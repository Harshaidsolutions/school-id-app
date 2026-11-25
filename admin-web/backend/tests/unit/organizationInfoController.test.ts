import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

const STORAGE_STUB = {
  STUDENT_PHOTOS_BUCKET: "b", PRINT_PDFS_BUCKET: "b", TEMPLATES_BUCKET: "b", SCHOOL_ASSETS_BUCKET: "b", CARD_PREVIEWS_BUCKET: "b", CATALOG_BUCKET: "b",
  getS3Client: () => ({}), publicObjectUrl: () => "u", studentPhotoStoragePath: () => "p", memberSignatureStoragePath: () => "p",
  uploadMemberSignatureToStorage: async () => "u", studentFieldImageStoragePath: () => "p", uploadStudentFieldImageToStorage: async () => "u",
  studentPhotoOrgId: () => "o", uploadBufferToBucket: async () => "u", uploadStudentPhotoToStorage: async () => "u", deleteStudentPhotoFromStorage: async () => {},
  deleteFromBucket: async () => {}, studentPhotoPathFromUrl: () => "p", deleteStudentPhotoByPath: async () => {}, readBucketObject: async () => Buffer.from(""),
  fetchImageBytes: async () => Buffer.from(""), uploadPrintPdfToStorage: async () => "u", uploadTemplateImage: async () => "u", uploadCatalogFile: async () => "u",
  uploadSchoolAsset: async () => "https://cdn/asset", uploadCardPreview: async () => "u", assertS3BucketAccessible: async () => {}, deletePrefixFromBucket: async () => {}, purgeOrgFiles: async () => {},
};
beforeEach(() => { mock.module("../../src/config/storage.ts", { namedExports: STORAGE_STUB }); });
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/organizationInfoController.ts");
const admin = { userId: "a1", role: "admin" };
const superScope: any = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]];

test("getSchoolOrganizationInfo: id required / not found / success", async () => {
  const { getSchoolOrganizationInfo } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: {} });
  await getSchoolOrganizationInfo(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /School id is required/);
  route([...superScope, [/FROM schools s\s+LEFT JOIN templates/i, []]]);
  c = reqres({ user: admin, params: { id: "s1" } });
  await getSchoolOrganizationInfo(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /School not found/);
  route([...superScope, [/FROM schools s\s+LEFT JOIN templates/i, [{ id: "s1", name: "Z", model: null, tags: null, template_id: null, owner_admin_id: "a1", template_image_url: null }]]]);
  c = reqres({ user: admin, params: { id: "s1" } });
  await getSchoolOrganizationInfo(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.body.organization.name, "Z");
});
test("getInstituteOrganizationInfo: not found / success", async () => {
  const { getInstituteOrganizationInfo } = await load();
  route([...superScope, [/FROM institutes i\s+LEFT JOIN templates/i, []]]);
  let c = reqres({ user: admin, params: { id: "i1" } });
  await getInstituteOrganizationInfo(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Institute not found/);
  route([...superScope, [/FROM institutes i\s+LEFT JOIN templates/i, [{ id: "i1", name: "Inst", model: null, tags: null, template_id: null, owner_admin_id: null, template_image_url: null }]]]);
  c = reqres({ user: admin, params: { id: "i1" } });
  await getInstituteOrganizationInfo(c.req, c.res, c.next); assert.equal(c.res.body.organization.name, "Inst");
});
test("updateSchoolAppSettings: not found / success", async () => {
  const { updateSchoolAppSettings } = await load();
  route([...superScope, [/FROM schools WHERE id = \$1 LIMIT 1/i, []]]);
  let c = reqres({ user: admin, params: { id: "s1" }, body: {} });
  await updateSchoolAppSettings(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /School not found/);
  route([...superScope, [/FROM schools WHERE id = \$1 LIMIT 1/i, [{ field_visibility: {}, allow_number_edit: true, allow_record_edit: true, show_captured_section: true }]], [/UPDATE schools/i, [{ field_visibility: { fld_0: true }, allow_number_edit: false, allow_record_edit: true, show_captured_section: true }]]]);
  c = reqres({ user: admin, params: { id: "s1" }, body: { field_visibility: { fld_0: true }, allow_number_edit: false } });
  await updateSchoolAppSettings(c.req, c.res, c.next); assert.equal(c.res.body.settings.allow_number_edit, false);
});
test("updateInstituteAppSettings: success", async () => {
  const { updateInstituteAppSettings } = await load();
  route([...superScope, [/FROM institutes WHERE id = \$1 LIMIT 1/i, [{ field_visibility: {}, allow_number_edit: true, allow_record_edit: true, show_captured_section: true }]], [/UPDATE institutes/i, [{ show_captured_section: false }]]]);
  const c = reqres({ user: admin, params: { id: "i1" }, body: { show_captured_section: false } });
  await updateInstituteAppSettings(c.req, c.res, c.next); assert.equal(c.res.body.settings.show_captured_section, false);
});
test("clearOrganizationImage: unknown type / unknown org / success", async () => {
  const { clearOrganizationImage } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: { kind: "schools", id: "s1", type: "weird" } });
  await clearOrganizationImage(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Unknown image type/);
  c = reqres({ user: admin, params: { kind: "widgets", id: "s1", type: "logo" } });
  await clearOrganizationImage(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Unknown organization type/);
  route([...superScope, [/UPDATE schools SET logo_url = NULL/i, []]]);
  c = reqres({ user: admin, params: { kind: "schools", id: "s1", type: "logo" } });
  await clearOrganizationImage(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
test("updateOrganizationDetailField: unknown field / success", async () => {
  const { updateOrganizationDetailField } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: { kind: "schools", id: "s1" }, body: { field: "nope" } });
  await updateOrganizationDetailField(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Unknown field/);
  route([...superScope, [/UPDATE schools SET detail_phone/i, []]]);
  c = reqres({ user: admin, params: { kind: "schools", id: "s1" }, body: { field: "phone", value: " 999 " } });
  await updateOrganizationDetailField(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
test("uploadOrganizationImage: no file / success", async () => {
  const { uploadOrganizationImage } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: { kind: "schools", id: "s1", type: "logo" } });
  await uploadOrganizationImage(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Image file is required/);
  route([...superScope, [/UPDATE schools SET logo_url/i, []]]);
  c = reqres({ user: admin, params: { kind: "schools", id: "s1", type: "logo" } }); c.req.file = { originalname: "l.png", size: 1, mimetype: "image/png" } as any;
  await uploadOrganizationImage(c.req, c.res, c.next); assert.match(c.res.body.url, /cdn\/asset/);
});
