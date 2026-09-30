import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
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
};

export async function createNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = String(req.body.school_id ?? req.body.schoolId ?? "").trim();
    const instituteId = String(
      req.body.institute_id ?? req.body.instituteId ?? ""
    ).trim();
    const title = String(req.body.title ?? "").trim();
    const message = String(req.body.message ?? "").trim();

    if (!schoolId && !instituteId) {
      throw new AppError("schoolId or instituteId is required", 400);
    }
    if (schoolId && instituteId) {
      throw new AppError("Provide either schoolId or instituteId, not both", 400);
    }
    if (!title) throw new AppError("title is required", 400);
    if (!message) throw new AppError("message is required", 400);

    const scope = await requireAdminScope(req);

    if (schoolId) {
      const school = await pool.query(`SELECT id FROM schools WHERE id = $1`, [
        schoolId,
      ]);
      if (!school.rows[0]) throw new AppError("School not found", 404);
      await assertSchoolOwnedByAdmin(scope, schoolId);

      const inserted = await pool.query<NotificationRow>(
        `INSERT INTO notifications (school_id, title, message, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [schoolId, title, message, req.user.userId]
      );

      const notification = inserted.rows[0];
      const endpoints = await loadSnsEndpointsForOrg({ schoolId });
      if (notification && endpoints.length > 0) {
        void sendSnsPushNotifications(endpoints, {
          title,
          body: message,
          data: { notificationId: notification.id, schoolId },
        }).then((result) => {
          if (result.disabledEndpointArns.length > 0) {
            void deactivatePushEndpoints(result.disabledEndpointArns);
          }
        });
      }

      res.status(201).json({ status: "ok", notification });
      return;
    }

    const institute = await pool.query(`SELECT id FROM institutes WHERE id = $1`, [
      instituteId,
    ]);
    if (!institute.rows[0]) throw new AppError("Institute not found", 404);
    await assertInstituteOwnedByAdmin(scope, instituteId);

    const inserted = await pool.query<NotificationRow>(
      `INSERT INTO notifications (institute_id, title, message, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [instituteId, title, message, req.user.userId]
    );

    const notification = inserted.rows[0];
    const endpoints = await loadSnsEndpointsForOrg({ instituteId });
    if (notification && endpoints.length > 0) {
      void sendSnsPushNotifications(endpoints, {
        title,
        body: message,
        data: { notificationId: notification.id, instituteId },
      }).then((result) => {
        if (result.disabledEndpointArns.length > 0) {
          void deactivatePushEndpoints(result.disabledEndpointArns);
        }
      });
    }

    res.status(201).json({ status: "ok", notification });
  } catch (error) {
    next(error);
  }
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
      : ` WHERE (s.owner_admin_id = $1 OR i.owner_admin_id = $1)
            AND COALESCE(n.audience, 'org') <> 'super_admin'`;
    if (!seeAll) {
      values.push(scope.adminUserId);
    }

    const result = await pool.query<NotificationWithTarget>(
      `SELECT n.*,
              s.name AS school_name,
              i.name AS institute_name
       FROM notifications n
       LEFT JOIN schools s ON s.id = n.school_id
       LEFT JOIN institutes i ON i.id = n.institute_id
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

export async function listTeacherNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.userId) {
      throw new AppError("Authentication required", 401);
    }

    const isInstitute = req.user.role === "institute_staff";
    const schoolId = req.user.schoolId;
    const instituteId = req.user.instituteId;

    if (isInstitute) {
      if (!instituteId) {
        throw new AppError("Institute account is missing institute assignment", 403);
      }

      const result = await pool.query<
        NotificationRow & { is_read: boolean }
      >(
        `SELECT n.*,
                EXISTS (
                  SELECT 1 FROM notification_reads r
                  WHERE r.notification_id = n.id AND r.user_id = $2
                ) AS is_read
         FROM notifications n
         WHERE n.institute_id = $1
           AND COALESCE(n.audience, 'org') <> 'super_admin'
           AND NOT EXISTS (
             SELECT 1 FROM notification_deletes d
             WHERE d.notification_id = n.id AND d.user_id = $2
           )
         ORDER BY n.created_at DESC`,
        [instituteId, req.user.userId]
      );

      const unreadCount = result.rows.filter((n) => !n.is_read).length;
      res.status(200).json({
        status: "ok",
        count: result.rows.length,
        unreadCount,
        notifications: result.rows,
      });
      return;
    }

    if (!schoolId) {
      throw new AppError("Teacher account is missing school assignment", 403);
    }

    const result = await pool.query<
      NotificationRow & { is_read: boolean }
    >(
      `SELECT n.*,
              EXISTS (
                SELECT 1 FROM notification_reads r
                WHERE r.notification_id = n.id AND r.user_id = $2
              ) AS is_read
       FROM notifications n
       WHERE n.school_id = $1
         AND COALESCE(n.audience, 'org') <> 'super_admin'
         AND NOT EXISTS (
           SELECT 1 FROM notification_deletes d
           WHERE d.notification_id = n.id AND d.user_id = $2
         )
       ORDER BY n.created_at DESC`,
      [schoolId, req.user.userId]
    );

    const unreadCount = result.rows.filter((n) => !n.is_read).length;

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      unreadCount,
      notifications: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function assertTeacherNotificationAccess(
  req: Request,
  notificationId: string
): Promise<void> {
  if (!req.user?.userId) {
    throw new AppError("Authentication required", 401);
  }

  const isInstitute = req.user.role === "institute_staff";
  const note = isInstitute
    ? await pool.query(
        `SELECT id FROM notifications WHERE id = $1 AND institute_id = $2`,
        [notificationId, req.user.instituteId]
      )
    : await pool.query(
        `SELECT id FROM notifications WHERE id = $1 AND school_id = $2`,
        [notificationId, req.user.schoolId]
      );

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

    const isInstitute = req.user.role === "institute_staff";
    if (isInstitute) {
      if (!req.user.instituteId) {
        throw new AppError("Institute account is missing institute assignment", 403);
      }
      await pool.query(
        `INSERT INTO notification_deletes (notification_id, user_id)
         SELECT n.id, $2
         FROM notifications n
         WHERE n.institute_id = $1
         ON CONFLICT DO NOTHING`,
        [req.user.instituteId, req.user.userId]
      );
    } else {
      if (!req.user.schoolId) {
        throw new AppError("Teacher account is missing school assignment", 403);
      }
      await pool.query(
        `INSERT INTO notification_deletes (notification_id, user_id)
         SELECT n.id, $2
         FROM notifications n
         WHERE n.school_id = $1
         ON CONFLICT DO NOTHING`,
        [req.user.schoolId, req.user.userId]
      );
    }

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
