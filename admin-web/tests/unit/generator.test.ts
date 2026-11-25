import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseHeader, detectRoles, roleValue, applyCase, ROLES } from "../../src/generator/columns.ts";
import { impose, mirrorSlot, cropMarks, CARD_SIZES, SHEET_SIZES } from "../../src/generator/impose.ts";
import { textBoxHeight, newText, newImage, newQr, newBarcode, defaultLayout, blankLayout, templateCard, customCard, sizeText, isLayout, stripColumnLabels, fitLayoutToTemplate, nextTextSpot } from "../../src/generator/defaults.ts";
import { crc32 } from "../../src/generator/zip.ts";

// ---- columns ----
test("normaliseHeader strips accents/punct/case", () => {
  assert.equal(normaliseHeader("  Father's Name! "), "fathersname");
});
test("detectRoles maps headers to roles, each column once", () => {
  const roles = detectRoles(["Student Name", "Roll No", "Father Name", "Class", "DOB"]);
  assert.equal(roles.name, "Student Name");
  assert.equal(roles.roll, "Roll No");
  assert.equal(roles.father, "Father Name");
  assert.equal(roles.class, "Class");
  assert.equal(roles.dob, "DOB");
});
test("roleValue + applyCase", () => {
  const roles = { name: "Student Name" };
  assert.equal(roleValue({ "Student Name": " Asha " }, roles, "name"), "Asha");
  assert.equal(roleValue({}, roles, "missing"), "");
  assert.equal(applyCase("hello world", "upper"), "HELLO WORLD");
  assert.equal(applyCase("HELLO", "lower"), "hello");
  assert.equal(applyCase("hello world", "title"), "Hello World");
  assert.equal(applyCase("hello. there", "sentence"), "Hello. There");
  assert.equal(applyCase("keep", "none"), "keep");
  assert.ok(ROLES.length > 10);
});

// ---- impose ----
test("impose: fits cards on a sheet", () => {
  const imp = impose({ sheet: SHEET_SIZES[0], card: { w: 54, h: 85.6 }, margin: 5, gap: 2, perSheet: 0, allowRotate: false });
  assert.ok(imp.capacity > 0);
  assert.equal(imp.slots.length, imp.capacity);
  assert.equal(imp.cols * imp.rows >= imp.capacity, true);
});
test("impose: perSheet caps capacity; zero when card too big", () => {
  const capped = impose({ sheet: SHEET_SIZES[0], card: { w: 54, h: 85.6 }, margin: 5, gap: 2, perSheet: 2, allowRotate: true });
  assert.equal(capped.capacity, 2);
  const none = impose({ sheet: { key: "x", label: "x", w: 10, h: 10 }, card: { w: 54, h: 85.6 }, margin: 5, gap: 2, perSheet: 0, allowRotate: false });
  assert.equal(none.capacity, 0);
});
test("mirrorSlot + cropMarks", () => {
  assert.deepEqual(mirrorSlot({ x: 10, y: 20 }, 54, 210), { x: 210 - 10 - 54, y: 20 });
  const imp = impose({ sheet: SHEET_SIZES[0], card: { w: 54, h: 85.6 }, margin: 5, gap: 2, perSheet: 2, allowRotate: false });
  const marks = cropMarks(imp, SHEET_SIZES[0]);
  assert.ok(marks.lines.length > 0);
  assert.ok(marks.xs.length >= 2 && marks.ys.length >= 2);
});

// ---- defaults ----
test("textBoxHeight", () => {
  assert.ok(textBoxHeight(8, 1) > 0);
  assert.ok(textBoxHeight(8, 2) > textBoxHeight(8, 1));
});
test("element factories", () => {
  assert.equal(newText("front", "Name").kind, "text");
  assert.equal(newText("front", "").required, false);
  assert.equal(newImage("front", "photo").required, true);
  assert.equal(newImage("front", "signature").cleanSignature, true);
  assert.equal(newQr("back", "Admission No").kind, "qr");
  assert.equal(newBarcode("back", "Admission No").format, "code128");
});
test("defaultLayout / blankLayout / isLayout", () => {
  const layout = defaultLayout({ name: "Student Name", class: "Class", admission: "Adm", phone: "Phone", address: "Address" });
  assert.equal(layout.kind, "id-bulk-v2");
  assert.ok(layout.elements.length > 1);
  assert.equal(isLayout(layout), true);
  assert.equal(isLayout({}), false);
  assert.equal(blankLayout().elements.length, 0);
});
test("templateCard / customCard / sizeText", () => {
  const tc = templateCard(660, 1050, 300);
  assert.ok(Math.abs(tc.w - 55.88) < 0.1);
  assert.equal(customCard(54, 85.6).key, "custom");
  assert.match(sizeText({ w: 54, h: 85.6 }), /54 × 85.6 mm/);
});
test("stripColumnLabels drops redundant prefix", () => {
  const layout = { ...blankLayout(), elements: [newText("front", "Name", { prefix: "Name:" }), newText("front", "Class", { prefix: "Class : " })] } as any;
  const stripped = stripColumnLabels(layout);
  assert.equal(stripped.elements[0].prefix, "");
});
test("fitLayoutToTemplate scales elements; nextTextSpot", () => {
  const base = defaultLayout({ name: "Student Name" });
  const fitted = fitLayoutToTemplate(base, 660, 1050, 300);
  assert.ok(fitted.card.w > 0);
  const spot = nextTextSpot(base, "front");
  assert.ok(spot === undefined || typeof spot.y === "number");
});

// ---- zip ----
test("crc32: known value for 'abc'", () => {
  assert.equal(crc32(new TextEncoder().encode("abc")) >>> 0, 0x352441c2);
});
