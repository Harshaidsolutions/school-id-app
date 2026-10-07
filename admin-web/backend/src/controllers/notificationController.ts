import { assertOrganizationOwned } from "./organizationPortalController";
import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { STUDENT_PHOTOS_BUCKET, uploadBufferToBucket, deleteFromBucket } from "../config/storage";
import { AppError } from "../middleware/errorHandler";
import {
  requestAdminActionOtp,
  verifyAdminActionOtp,
} from "../utils/adminOtp";
import { parseBulkIds } from "../utils/bulkIds";
import { routeParam } from "../utils/routeParams";
import type { NotificationRow } from "../types/admin";
import { sendSnsPushNotifications } from "../utils/snsPush";
import {
  deactivatePushEndpoints,
  loadSnsEndpointsForOrg,
} from "./pushTokenController";
import {
  adminSeesAllOrganizations,
  assertInstituteOwnedByAdmin,
  assertNotificationOwnedByAdmin,
  assertSchoolOwnedByAdmin,
  requireAdminScope,
} from "../utils/adminScope";

type NotificationWithTarget = NotificationRow & {
  school_name?: string | null;
  institute_name?: string | null;
  organization_name?: string | null;
};

export async function createNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  let imagePath: string | null = null;
  let committed = false;
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const schoolId = String(req.body.school_id ?? req.body.schoolId ?? "").trim();
    const instituteId = String(req.body.institute_id ?? req.body.instituteId ?? "").trim();
    const organizationId = String(req.body.organization_id ?? req.body.organizationId ?? "").trim();
    if ([schoolId, instituteId, organizationId].filter(Boolean).length !== 1) throw new AppError("Select exactly one school, institute or organization", 400);
    const title = String(req.body.title ?? "").trim();
    const message = String(req.body.message ?? "").trim();
    const requestId = String(req.body.requestId ?? "").trim() || null;
    if (requestId && (requestId.length > 200 || !/^[a-zA-Z0-9:_-]+$/.test(requestId))) throw new AppError("Invalid request identifier", 400);
    if (!title || !message) throw new AppError("Title and message are required", 400);
    if (req.file && req.file.size > 10 * 1024 * 1024) throw new AppError("Notification image must be 10 MB or smaller", 400);
    const scope = await requireAdminScope(req);
    // Validate ownership before storing any uploaded image or returning a previous send.
    if (schoolId) await assertSchoolOwnedByAdmin(scope, schoolId);
    else if (instituteId) await assertInstituteOwnedByAdmin(scope, instituteId);
    else await assertOrganizationOwned(scope, organizationId);
    await client.query("BEGIN");
    if (requestId) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`notification:${req.user.userId}:${requestId}`]);
      const existing = await client.query<NotificationRow>("SELECT * FROM notifications WHERE created_by = $1 AND client_request_id = $2", [req.user.userId, requestId]);
      if (existing.rows[0]) {
        const note = existing.rows[0];
        if ((note.school_id || "") !== schoolId || (note.institute_id || "") !== instituteId || (note.organization_id || "") !== organizationId || note.title !== title || note.message !== message) throw new AppError("This send identifier was already used for a different notification", 409);
        await client.query("COMMIT"); committed = true;
        res.status(200).json({status:"ok", notification:note, reused:true}); return;
      }
    }
    let imageUrl: string | null = null;
    if (req.file) {
      const ext = req.file.mimetype.includes("png") ? "png" : "jpg";
      imagePath = `notifications/${schoolId || instituteId || organizationId}/${randomUUID()}.${ext}`;
      imageUrl = await uploadBufferToBucket(STUDENT_PHOTOS_BUCKET, imagePath, req.file.buffer, req.file.mimetype);
    }
    const inserted = await client.query<NotificationRow>(
      `INSERT INTO notifications (school_id, institute_id, organization_id, title, message, image_url, created_by, client_request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [schoolId || null, instituteId || null, organizationId || null, title, message, imageUrl, req.user.userId, requestId]
    );
    await client.query("COMMIT"); committed = true;
    const notification = inserted.rows[0];
    // Delivery failure never causes the already-committed announcement to be inserted again.
    void loadSnsEndpointsForOrg({schoolId, instituteId, organizationId}).then(endpoints => sendSnsPushNotifications(endpoints, {
      title, body:message, imageUrl,
      data:{notificationId:notification.id, ...(schoolId ? {schoolId} : instituteId ? {instituteId} : {organizationId})},
    })).then(result => deactivatePushEndpoints(result.disabledEndpointArns)).catch(error => console.error("[notification-push]", error));
    res.status(201).json({status:"ok", notification});
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (imagePath) await deleteFromBucket(STUDENT_PHOTOS_BUCKET, imagePath).catch(() => undefined);
    }
    next(error);
  } finally { client.release(); }
}

/** GET /admin/notifications — all notifications with target names */
export async function listAllAdminNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    const values: unknown[] = [];
    const accessFilter = seeAll
      ? ""
      : ` WHERE (s.owner_admin_id = $1 OR i.owner_admin_id = $1 OR o.owner_admin_id = $1)
            AND COALESCE(n.audience, 'org') <> 'super_admin'`;
    if (!seeAll) {
      values.push(scope.adminUserId);
    }

    const result = await pool.query<NotificationWithTarget>(
      `SELECT n.*,
              s.name AS school_name,
              i.name AS institute_name,
              o.name AS organization_name
       FROM notifications n
       LEFT JOIN schools s ON s.id = n.school_id
       LEFT JOIN institutes i ON i.id = n.institute_id
       LEFT JOIN organizations o ON o.id = n.organization_id
       ${accessFilter}
       ORDER BY n.created_at DESC NULLS LAST`,
      values
    );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      notifications: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

/** GET /admin/notifications/unread-count — parent admin bell badge */
export async function incomingUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    if (!seeAll) {
      res.status(200).json({ status: "ok", unreadCount: 0 });
      return;
    }
    const result = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM notifications n
       WHERE n.audience = 'super_admin'
         AND NOT EXISTS (
           SELECT 1 FROM notification_reads r
           WHERE r.notification_id = n.id AND r.user_id = $1
         )`,
      [scope.adminUserId]
    );
    res.status(200).json({
      status: "ok",
      unreadCount: result.rows[0]?.count ?? 0,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /admin/notifications/incoming/mark-read */
export async function markIncomingNotificationsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    if (!seeAll) {
      res.status(200).json({ status: "ok" });
      return;
    }
    const requested = Array.isArray(req.body?.ids)
      ? parseBulkIds(req.body.ids, "notification")
      : null;
    if (requested) {
      await pool.query(
        `INSERT INTO notification_reads (notification_id, user_id)
         SELECT n.id, $1
         FROM notifications n
         WHERE n.audience = 'super_admin'
           AND n.id = ANY($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [scope.adminUserId, requested]
      );
    } else {
      await pool.query(
        `INSERT INTO notification_reads (notification_id, user_id)
         SELECT n.id, $1
         FROM notifications n
         WHERE n.audience = 'super_admin'
         ON CONFLICT DO NOTHING`,
        [scope.adminUserId]
      );
    }
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
}

export async function listAdminNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = routeParam(req.params.schoolId);
    if (!schoolId) throw new AppError("schoolId is required", 400);

    const scope = await requireAdminScope(req);
    await assertSchoolOwnedByAdmin(scope, schoolId);

    const result = await pool.query<NotificationRow>(
      `SELECT * FROM notifications
       WHERE school_id = $1
         AND COALESCE(audience, 'org') <> 'super_admin'
       ORDER BY created_at DESC`,
      [schoolId]
    );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      notifications: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function requestNotificationDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const notificationId = routeParam(req.params.id);
    if (!notificationId) throw new AppError("Notification id is required", 400);

    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    await assertNotificationOwnedByAdmin(scope, seeAll, notificationId);

    const note = await pool.query<{ title: string }>(
      `SELECT title FROM notifications WHERE id = $1 LIMIT 1`,
      [notificationId]
    );
    if (!note.rows[0]) throw new AppError("Notification not found", 404);

    const admin = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [req.user.userId]
    );
    const adminEmail = admin.rows[0]?.email;
    if (!adminEmail) {
      throw new AppError("Admin account email is required to send OTP", 400);
    }

    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_notification",
      resourceId: notificationId,
      emailSubject: "Confirm notification deletion",
      emailIntro: `Confirm deletion of notification "${note.rows[0].title}".`,
      logPrefix: "[notification-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

export async function deleteNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const notificationId = routeParam(req.params.id);
    if (!notificationId) throw new AppError("Notification id is required", 400);

    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    await assertNotificationOwnedByAdmin(scope, seeAll, notificationId);

    const otp = String(req.body?.otp ?? "").trim();
    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_notification",
      resourceId: notificationId,
      otp,
    });

    const result = await pool.query(
      `DELETE FROM notifications WHERE id = $1 RETURNING id`,
      [notificationId]
    );
    if (!result.rows[0]) throw new AppError("Notification not found", 404);

    res.status(200).json({ status: "ok", deleted: true });
  } catch (error) {
    next(error);
  }
}

function bulkNotificationResourceId(ids: string[]): string {
  return [...ids].sort().join(",");
}

function parseNotificationIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new AppError("ids are required", 400);
  const ids = [
    ...new Set(raw.map((id) => String(id).trim()).filter((id) => id.length > 0)),
  ];
  if (ids.length === 0) throw new AppError("Select at least one notification", 400);
  if (ids.length > 200) {
    throw new AppError("Select 200 notifications or fewer at a time", 400);
  }
  return ids;
}

export async function requestNotificationBulkDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const ids = parseNotificationIds(req.body?.ids);
    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    for (const id of ids) {
      await assertNotificationOwnedByAdmin(scope, seeAll, id);
    }
    const admin = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [req.user.userId]
    );
    const adminEmail = admin.rows[0]?.email;
    if (!adminEmail) {
      throw new AppError("Admin account email is required to send OTP", 400);
    }
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_notification_bulk",
      resourceId: bulkNotificationResourceId(ids),
      emailSubject: "Confirm notification deletion",
      emailIntro: `Confirm deletion of ${ids.length} notification${ids.length === 1 ? "" : "s"}.`,
      logPrefix: "[notification-bulk-delete]",
    });
    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

export async function bulkDeleteNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const ids = parseNotificationIds(req.body?.ids);
    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    for (const id of ids) {
      await assertNotificationOwnedByAdmin(scope, seeAll, id);
    }
    const otp = String(req.body?.otp ?? "").trim();
    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_notification_bulk",
      resourceId: bulkNotificationResourceId(ids),
      otp,
    });
    const deleted: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      const result = await pool.query(
        `DELETE FROM notifications WHERE id = $1 RETURNING id`,
        [id]
      );
      if (result.rows[0]) deleted.push(id);
      else failed.push({ id, message: "Notification not found" });
    }
    const status =
      failed.length === 0 ? "ok" : deleted.length === 0 ? "error" : "partial";
    res.status(deleted.length === 0 ? 400 : 200).json({
      status,
      deleted,
      failed,
      deletedCount: deleted.length,
      failedCount: failed.length,
    });
  } catch (error) {
    next(error);
  }
}

function notificationTarget(req: Request): { column: "school_id" | "institute_id" | "organization_id"; id: string } {
  if (!req.user?.userId) throw new AppError("Authentication required", 401);
  const column = req.user.role === "organization_staff" ? "organization_id" : req.user.role === "institute_staff" ? "institute_id" : "school_id";
  const id = column === "organization_id" ? req.user.organizationId : column === "institute_id" ? req.user.instituteId : req.user.schoolId;
  if (!id) throw new AppError("Account is missing its organization assignment", 403);
  return {column, id};
}

export async function listTeacherNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const target = notificationTarget(req);
    const result = await pool.query<NotificationRow & {is_read:boolean}>(
      `SELECT n.*, EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id=n.id AND r.user_id=$2) AS is_read
       FROM notifications n WHERE n.${target.column}=$1 AND COALESCE(n.audience, 'org') <> 'super_admin'
       AND NOT EXISTS (SELECT 1 FROM notification_deletes d WHERE d.notification_id=n.id AND d.user_id=$2)
       ORDER BY n.created_at DESC`, [target.id, req.user!.userId]
    );
    res.status(200).json({status:"ok", count:result.rows.length, unreadCount:result.rows.filter(n => !n.is_read).length, notifications:result.rows});
  } catch(error) {next(error);}
}

async function assertTeacherNotificationAccess(req: Request, notificationId: string): Promise<void> {
  const target = notificationTarget(req);
  const note = await pool.query(`SELECT id FROM notifications WHERE id=$1 AND ${target.column}=$2 AND COALESCE(audience, 'org') <> 'super_admin'`, [notificationId, target.id]);
  if (!note.rows[0]) throw new AppError("Notification not found", 404);
}

export async function deleteTeacherNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const notificationId = routeParam(req.params.id);
    if (!notificationId) throw new AppError("Notification id is required", 400);

    await assertTeacherNotificationAccess(req, notificationId);

    await pool.query(
      `INSERT INTO notification_deletes (notification_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [notificationId, req.user!.userId]
    );

    res.status(200).json({ status: "ok", deleted: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteAllTeacherNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.userId) {
      throw new AppError("Authentication required", 401);
    }

    const target = notificationTarget(req);
    await pool.query(`INSERT INTO notification_deletes (notification_id, user_id)
      SELECT n.id, $2 FROM notifications n WHERE n.${target.column}=$1 AND COALESCE(n.audience, 'org') <> 'super_admin'
      ON CONFLICT DO NOTHING`, [target.id, req.user.userId]);

    res.status(200).json({ status: "ok", deleted: true });
  } catch (error) {
    next(error);
  }
}

export async function markTeacherNotificationRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.userId) {
      throw new AppError("Authentication required", 401);
    }

    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Notification id is required", 400);

    await assertTeacherNotificationAccess(req, id);

    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, req.user.userId]
    );

    res.status(200).json({ status: "ok", read: true });
  } catch (error) {
    next(error);
  }
}
