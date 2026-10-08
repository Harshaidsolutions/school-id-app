import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { getAndroidPlatformApplicationArn } from "../config/sns";
import {
  deactivateSnsEndpoint,
  registerSnsDeviceEndpoint,
} from "../utils/snsPush";

type PushTokenRow = {
  id: string;
  push_token: string;
  sns_endpoint_arn: string | null;
};

function normalizePushToken(raw: unknown): string {
  return String(raw ?? "").trim();
}

function isValidFcmToken(token: string): boolean {
  if (token.length < 32 || token.length > 4096) return false;
  if (token.startsWith("ExponentPushToken")) return false;
  return /^[\w\-:.+/=]+$/.test(token);
}

/** POST /teacher/push-token — register FCM token + SNS endpoint for this device. */
export async function registerTeacherPushToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.userId) {
      throw new AppError("Authentication required", 401);
    }

    const pushToken = normalizePushToken(req.body.pushToken ?? req.body.token);
    if (!isValidFcmToken(pushToken)) {
      throw new AppError("Valid FCM device push token is required", 400);
    }

    const schoolId = req.user.schoolId ?? null;
    const instituteId = req.user.instituteId ?? null;
    const organizationId = req.user.organizationId ?? null;
    if (!schoolId && !instituteId && !organizationId) {
      throw new AppError("Teacher account is missing org assignment", 403);
    }

    const platform = String(req.body.platform ?? "android").trim().slice(0, 16);
    const deviceId = String(req.body.deviceId ?? req.body.device_id ?? "")
      .trim()
      .slice(0, 128);
    const deviceName = String(req.body.deviceName ?? req.body.device_name ?? "")
      .trim()
      .slice(0, 128);

    const existing = await pool.query<PushTokenRow>(
      `SELECT id, push_token, sns_endpoint_arn
       FROM teacher_push_tokens
       WHERE push_token = $1
       LIMIT 1`,
      [pushToken]
    );

    let snsEndpointArn: string | null = existing.rows[0]?.sns_endpoint_arn ?? null;
    const snsConfigured = Boolean(getAndroidPlatformApplicationArn());

    if (snsConfigured) {
      const customUserData = JSON.stringify({
        userId: req.user.userId,
        schoolId,
        instituteId,
        organizationId,
        deviceId: deviceId || undefined,
      });
      snsEndpointArn = await registerSnsDeviceEndpoint(pushToken, {
        existingEndpointArn: snsEndpointArn,
        customUserData,
      });
    }

    await pool.query(
      `INSERT INTO teacher_push_tokens (
         user_id, school_id, institute_id, push_token, platform, organization_id,
         sns_endpoint_arn, device_id, device_name, is_active, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $9, $6, $7, $8, true, NOW())
       ON CONFLICT (push_token) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         school_id = EXCLUDED.school_id,
         institute_id = EXCLUDED.institute_id,
         organization_id = EXCLUDED.organization_id,
         platform = EXCLUDED.platform,
         sns_endpoint_arn = COALESCE(EXCLUDED.sns_endpoint_arn, teacher_push_tokens.sns_endpoint_arn),
         device_id = COALESCE(NULLIF(EXCLUDED.device_id, ''), teacher_push_tokens.device_id),
         device_name = COALESCE(NULLIF(EXCLUDED.device_name, ''), teacher_push_tokens.device_name),
         is_active = true,
         updated_at = NOW()`,
      [
        req.user.userId,
        schoolId,
        instituteId,
        pushToken,
        platform,
        snsEndpointArn,
        deviceId || null,
        deviceName || null,
        organizationId,
      ]
    );

    if (deviceId) {
      const stale = await pool.query<{ id: string; sns_endpoint_arn: string | null }>(
        `SELECT id, sns_endpoint_arn
         FROM teacher_push_tokens
         WHERE device_id = $1
           AND push_token <> $2
           AND is_active = true`,
        [deviceId, pushToken]
      );
      for (const row of stale.rows) {
        if (row.sns_endpoint_arn) {
          void deactivateSnsEndpoint(row.sns_endpoint_arn);
        }
        await pool.query(
          `UPDATE teacher_push_tokens SET is_active = false, updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
      }
    }

    res.status(200).json({
      status: "ok",
      registered: true,
      snsRegistered: Boolean(snsEndpointArn),
    });
  } catch (error) {
    next(error);
  }
}

/** DELETE /teacher/push-token — remove token on logout. */
export async function unregisterTeacherPushToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const pushToken = normalizePushToken(req.body.pushToken ?? req.body.token);
    if (!pushToken) {
      res.status(200).json({ status: "ok", removed: false });
      return;
    }

    // Delivery queries use this registry. Removing the scoped token stops future
    // dispatch immediately; disabling the shared SNS endpoint can race a quick
    // Off -> On or another account registering the same device.
    await pool.query(`DELETE FROM teacher_push_tokens WHERE push_token = $1 AND user_id = $2`, [
      pushToken, req.user?.userId,
    ]);
    res.status(200).json({ status: "ok", removed: true });
  } catch (error) {
    next(error);
  }
}

export async function loadSnsEndpointsForOrg(options: {schoolId?:string|null; instituteId?:string|null; organizationId?:string|null}): Promise<string[]> {
  const column = options.organizationId ? "organization_id" : options.instituteId ? "institute_id" : "school_id";
  const id = options.organizationId || options.instituteId || options.schoolId;
  if (!id) return [];
  const result = await pool.query<{sns_endpoint_arn:string}>(`SELECT DISTINCT sns_endpoint_arn FROM teacher_push_tokens
    WHERE ${column}=$1::uuid AND is_active=true AND sns_endpoint_arn IS NOT NULL`, [id]);
  return result.rows.map(row => row.sns_endpoint_arn);
}

export async function deactivatePushEndpoints(endpointArns: string[]): Promise<void> {
  if (endpointArns.length === 0) return;
  await pool.query(
    `UPDATE teacher_push_tokens
     SET is_active = false, updated_at = NOW()
     WHERE sns_endpoint_arn = ANY($1::text[])`,
    [endpointArns]
  );
  for (const arn of endpointArns) {
    void deactivateSnsEndpoint(arn);
  }
}

/** @deprecated Use loadSnsEndpointsForOrg — kept for reference during migration. */
export async function loadPushTokensForOrg(options: {
  schoolId?: string | null;
  instituteId?: string | null;
  organizationId?: string | null;
}): Promise<string[]> {
  const { schoolId, instituteId } = options;
  if (schoolId) {
    const result = await pool.query<{ push_token: string }>(
      `SELECT push_token FROM teacher_push_tokens
       WHERE school_id = $1::uuid AND is_active = true`,
      [schoolId]
    );
    return result.rows.map((r) => r.push_token);
  }
  if (instituteId) {
    const result = await pool.query<{ push_token: string }>(
      `SELECT push_token FROM teacher_push_tokens
       WHERE institute_id = $1::uuid AND is_active = true`,
      [instituteId]
    );
    return result.rows.map((r) => r.push_token);
  }
  return [];
}
