import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient, storageStub } from "../helpers/testkit.ts";

beforeEach(() => {
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/utils/adminOtp.ts", { namedExports: { requestAdminActionOtp: async () => ({ emailDelivery: "sent", message: "sent" }), verifyAdminActionOtp: async () => {} } });
  mock.module("../../src/utils/snsPush.ts", { namedExports: { sendSnsPushNotifications: async () => ({ sent: 0, failed: 0, disabledEndpointArns: [] }) } });
  mock.module("../../src/controllers/pushTokenController.ts", { namedExports: { loadSnsEndpointsForOrg: async () => [], deactivatePushEndpoints: async () => {} } });
});
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/notificationController.ts");
const admin = { userId: "a1", role: "admin" };
const superScope: any = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]];

test("createNotification: auth / target count / required fields", async () => {
  const { createNotification } = await load();
  mock.method(pool, "connect", async () => fakeClient([]));
  let c = reqres({ user: undefined, body: {} });
  await createNotification(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/);
  c = reqres({ user: admin, body: { school_id: "s1", institute_id: "i1" } });
  await createNotification(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /exactly one/);
  route(superScope);
  c = reqres({ user: admin, body: { school_id: "s1", title: "", message: "" } });
  await createNotification(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Title and message/);
});
test("createNotification: success (school target)", async () => {
  const { createNotification } = await load();
  route(superScope);
  mock.method(pool, "connect", async () => fakeClient([...superScope, [/INSERT INTO notifications/i, [{ id: "n1", title: "T", message: "M" }]], [/BEGIN|COMMIT/i, []]]));
  const c = reqres({ user: admin, body: { school_id: "s1", title: "T", message: "M" } });
  await createNotification(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201); assert.equal(c.res.body.notification.id, "n1");
});
test("createNotification: admin target requires super", async () => {
  const { createNotification } = await load();
  route([[/FROM users WHERE id/i, [{ is_super_admin: false }]]]);
  mock.method(pool, "connect", async () => fakeClient([]));
  const c = reqres({ user: admin, body: { admin_id: "a2", title: "T", message: "M" } });
  await createNotification(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Only the super admin/);
});
test("listAllAdminNotifications + incomingUnreadCount + listAdminInbox", async () => {
  const { listAllAdminNotifications, incomingUnreadCount, listAdminInbox } = await load();
  route([...superScope, [/FROM notifications n\s+LEFT JOIN schools/i, [{ id: "n1" }]]]);
  let c = reqres({ user: admin });
  await listAllAdminNotifications(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
  route([...superScope, [/COUNT\(\*\)::int AS count/i, [{ count: 3 }]]]);
  c = reqres({ user: admin });
  await incomingUnreadCount(c.req, c.res, c.next); assert.equal(c.res.body.unreadCount, 3);
  route([...superScope, [/EXISTS[\s\S]*notification_reads/i, [{ id: "n1", read: false }]]]);
  c = reqres({ user: admin });
  await listAdminInbox(c.req, c.res, c.next); assert.equal(c.res.body.notifications.length, 1);
});
test("markIncomingNotificationsRead: child (ids) + super (all)", async () => {
  const { markIncomingNotificationsRead } = await load();
  route([[/FROM users WHERE id/i, [{ is_super_admin: false }]], [/INSERT INTO notification_reads/i, []]]);
  let c = reqres({ user: admin, body: { ids: ["11111111-1111-4111-8111-111111111111"] } });
  await markIncomingNotificationsRead(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  route([...superScope, [/INSERT INTO notification_reads/i, []]]);
  c = reqres({ user: admin, body: {} });
  await markIncomingNotificationsRead(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
test("listAdminNotifications: schoolId required + success", async () => {
  const { listAdminNotifications } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: {} });
  await listAdminNotifications(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /schoolId is required/);
  route([...superScope, [/SELECT \* FROM notifications/i, [{ id: "n1" }]]]);
  c = reqres({ user: admin, params: { schoolId: "s1" } });
  await listAdminNotifications(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("requestNotificationDeleteOtp + deleteNotification", async () => {
  const { requestNotificationDeleteOtp, deleteNotification } = await load();
  route([[/SELECT email FROM users/i, [{ email: "a@b.com" }]], [/SELECT title FROM notifications/i, [{ title: "T" }]], ...superScope]);
  let c = reqres({ user: admin, params: { id: "n1" } });
  await requestNotificationDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  route([...superScope, [/DELETE FROM notifications/i, [{ id: "n1" }]]]);
  c = reqres({ user: admin, params: { id: "n1" }, body: { otp: "123456" } });
  await deleteNotification(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
  route([...superScope, [/DELETE FROM notifications/i, []]]);
  c = reqres({ user: admin, params: { id: "n1" }, body: { otp: "123456" } });
  await deleteNotification(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
});
test("bulk delete otp + bulkDeleteNotifications partial", async () => {
  const { requestNotificationBulkDeleteOtp, bulkDeleteNotifications } = await load();
  route(superScope);
  let c = reqres({ user: admin, body: { ids: [] } });
  await requestNotificationBulkDeleteOtp(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least one/);
  route([[/SELECT email FROM users/i, [{ email: "a@b.com" }]], ...superScope]);
  c = reqres({ user: admin, body: { ids: ["n1", "n2"] } });
  await requestNotificationBulkDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  let n = 0;
  route([...superScope, [/DELETE FROM notifications/i, () => (n++ === 0 ? [{ id: "n1" }] : [])]]);
  c = reqres({ user: admin, body: { ids: ["n1", "n2"], otp: "123456" } });
  await bulkDeleteNotifications(c.req, c.res, c.next); assert.equal(c.res.body.status, "partial");
});
test("teacher notifications: list / delete / delete-all / mark-read", async () => {
  const { listTeacherNotifications, deleteTeacherNotification, deleteAllTeacherNotifications, markTeacherNotificationRead } = await load();
  const teacher = { userId: "u1", role: "teacher", schoolId: "s1" };
  route([[/EXISTS[\s\S]*notification_reads[\s\S]*FROM notifications/i, [{ id: "n1", is_read: false }]]]);
  let c = reqres({ user: teacher });
  await listTeacherNotifications(c.req, c.res, c.next); assert.equal(c.res.body.unreadCount, 1);
  route([[/SELECT id FROM notifications WHERE id/i, [{ id: "n1" }]], [/INSERT INTO notification_deletes/i, []]]);
  c = reqres({ user: teacher, params: { id: "n1" } });
  await deleteTeacherNotification(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
  route([[/INSERT INTO notification_deletes/i, []]]);
  c = reqres({ user: teacher });
  await deleteAllTeacherNotifications(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
  route([[/SELECT id FROM notifications WHERE id/i, [{ id: "n1" }]], [/INSERT INTO notification_reads/i, []]]);
  c = reqres({ user: teacher, params: { id: "n1" } });
  await markTeacherNotificationRead(c.req, c.res, c.next); assert.equal(c.res.body.read, true);
});
