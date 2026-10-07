const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  sharp = require("sharp");
const { pool } = require("../dist/config/database"),
  config = require("../dist/controllers/formConfigController"),
  serial = require("../dist/utils/addSerial"),
  storage = require("../dist/config/storage"),
  controller = require("../dist/controllers/schoolParentFormController");
const fields = [
  { key: "student_name", label: "Student Name", enabled: true },
  { key: "class_section", label: "Class", enabled: true },
  { key: "parent_phone", label: "Phone", enabled: false },
  { key: "photo_id", label: "Photo Number", enabled: true },
];
test("parent schema hides disabled fields and generated number; name/photo/class mandatory", () => {
  const result = controller.parentFormFields(fields);
  assert.deepEqual(
    result.fields.map((f) => f.id),
    ["student_photo", "student_name", "class_section"],
  );
  assert.deepEqual(
    result.fields.filter((f) => f.required).map((f) => f.id),
    ["student_photo", "student_name", "class_section"],
  );
  assert.throws(
    () => controller.parentFormFields([]),
    (e) => e.statusCode === 400,
  );
});
test("parent submission inserts school student; duplicate and upload failure roll back", async () => {
  const original = {
    connect: pool.connect,
    query: pool.query,
    config: config.loadFormConfigForOrg,
    serial: serial.allocateReusableAddSerial,
    upload: storage.uploadStudentPhotoToStorage,
    remove: storage.deleteStudentPhotoFromStorage,
  };
  const image = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  let duplicate = false,
    failUpload = false,
    uploads = 0,
    removed = 0,
    queries = [],
    released = 0;
  pool.query = async () => ({
    rows: [{ id: "school-a", name: "School A", parent_form_classes: ["6 A"] }],
  });
  config.loadFormConfigForOrg = async () => fields;
  serial.allocateReusableAddSerial = async () => "ADD_000";
  pool.connect = async () => ({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return {
        rows:
          sql.includes("NOT EXISTS") && duplicate ? [{ id: "existing" }] : [],
      };
    },
    release() {
      released++;
    },
  });
  storage.uploadStudentPhotoToStorage = async () => {
    uploads++;
    if (failUpload) throw Error("upload failure");
    return "photo.jpg";
  };
  storage.deleteStudentPhotoFromStorage = async () => {
    removed++;
  };
  async function submit(body, photo = true) {
    queries = [];
    let error, result, status;
    await controller.submitSchoolParentForm(
      {
        params: { token: "a".repeat(48) },
        body: { class_section: "6 A", ...body },
        files: photo
          ? {
              student_photo: [
                {
                  fieldname: "student_photo",
                  buffer: image,
                  mimetype: "image/jpeg",
                },
              ],
            }
          : {},
      },
      {
        status(n) {
          status = n;
          return this;
        },
        json(data) {
          result = data;
        },
      },
      (e) => (error = e),
    );
    return { error, result, status };
  }
  try {
    assert.equal(
      (await submit({ student_name: "Asha" }, false)).error.statusCode,
      400,
    );
    assert.equal((await submit({ student_name: " " })).error.statusCode, 400);
    assert.equal(
      (await submit({ student_name: "Asha", class_section: "" })).error
        .statusCode,
      400,
    );
    assert.equal(
      (await submit({ student_name: "Asha", class_section: "injected class" }))
        .error.statusCode,
      400,
    );
    assert.equal(uploads, 0);
    const ok = await submit({
      student_name: "Asha",
      class_section: "6 A",
      parent_phone: "hidden",
      schoolId: "foreign",
    });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.result, { status: "ok", photoNumber: "ADD_000" });
    const insert = queries.find((q) => q.sql.startsWith("INSERT"));
    assert.equal(insert.values[1], "school-a");
    assert.equal(insert.values[4], "6 A");
    assert.equal(JSON.parse(insert.values[12]).parent_phone, undefined);
    assert.equal(JSON.parse(insert.values[12]).photo_id, "ADD_000");
    assert.match(
      queries.find((q) => q.sql.startsWith("UPDATE students")).sql,
      /photo_captured_at=NOW\(\),photo_cropped=false/,
    );
    assert.equal(queries.at(-1).sql, "COMMIT");
    duplicate = true;
    assert.equal(
      (await submit({ student_name: "Asha" })).error.statusCode,
      409,
    );
    assert.equal(uploads, 1);
    assert.equal(queries.at(-1).sql, "ROLLBACK");
    duplicate = false;
    failUpload = true;
    assert.match(
      (await submit({ student_name: "Other" })).error.message,
      /upload failure/,
    );
    assert.equal(removed, 1);
    assert.equal(queries.at(-1).sql, "ROLLBACK");
    assert.equal(released, 3);
  } finally {
    pool.connect = original.connect;
    pool.query = original.query;
    config.loadFormConfigForOrg = original.config;
    serial.allocateReusableAddSerial = original.serial;
    storage.uploadStudentPhotoToStorage = original.upload;
    storage.deleteStudentPhotoFromStorage = original.remove;
  }
});
test("teacher link scope comes from authentication", async () => {
  const original = pool.query;
  let values, result;
  pool.query = async (sql, v) => {
    values = v;
    return { rows: [{ parent_form_token: "a".repeat(48) }] };
  };
  try {
    await controller.getSchoolParentLink(
      {
        user: { role: "teacher", schoolId: "school-a" },
        params: { id: "foreign" },
      },
      {
        json(data) {
          result = data;
        },
      },
      (e) => {
        throw e;
      },
    );
    assert.deepEqual(values, ["school-a"]);
    assert.match(result.link, /\/school-form\/a{48}$/);
  } finally {
    pool.query = original;
  }
});
