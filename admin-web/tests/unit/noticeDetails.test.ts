import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNoticeDetails, orderedNoticeRows, noticeHeadline } from "../../src/utils/noticeDetails.ts";

// A real child-admin "school created" notification body (as the backend builds it).
const MESSAGE = [
  "School:", "sun school",
  "", "Created By:", "Praveen (child admin)",
  "", "Date:", "24 Nov 2026",
  "", "Time:", "11:51 AM",
  "", "Username:", "sun schooll",
  "", "Password:", "secret12",
].join("\n");

test("parseNoticeDetails extracts each label/value pair incl. Created By", () => {
  const rows = parseNoticeDetails(MESSAGE);
  const by = rows.find((r) => r.label === "Created By");
  assert.equal(by?.value, "Praveen (child admin)");
  assert.equal(rows.find((r) => r.label === "School")?.value, "sun school");
});

test("orderedNoticeRows SHOWS the creator (regression: it was previously hidden)", () => {
  const rows = orderedNoticeRows(parseNoticeDetails(MESSAGE));
  const labels = rows.map((r) => r.label);
  assert.ok(labels.includes("Created by"), "the admin who created the school must be shown");
  assert.equal(rows.find((r) => r.label === "Created by")?.value, "Praveen (child admin)");
  // Order: Type, name, Created by, Username, Password
  assert.deepEqual(labels, ["Type", "School name", "Created by", "Username", "Password"]);
  // Password is still masked.
  assert.equal(rows.find((r) => r.label === "Password")?.secret, true);
});

test("noticeHeadline stays clean (org · name, not the creator)", () => {
  const details = parseNoticeDetails(MESSAGE);
  assert.equal(noticeHeadline("School sun school created", details), "School · sun school");
  assert.equal(noticeHeadline("New registration: Little flower em school", details), "New registration: Little flower em school");
});
