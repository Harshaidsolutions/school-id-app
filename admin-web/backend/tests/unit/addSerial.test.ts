import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { isIdentityAliasLabel, identityFields, firstIdentityValue, smallestAddSerial, allocateReusableAddSerial, allocateOrganizationAddSerial } from "../../src/utils/addSerial.ts";

const F = (over: Record<string, unknown>) => ({ key: "k", label: "L", enabled: true, ...over } as any);

test("isIdentityAliasLabel", () => {
  assert.equal(isIdentityAliasLabel("ID"), true);
  assert.equal(isIdentityAliasLabel("Photo ID"), true);
  assert.equal(isIdentityAliasLabel("Name"), false);
});
test("identityFields filters enabled identity columns", () => {
  const fields = [F({ key: "a", label: "ID" }), F({ key: "b", label: "ID", enabled: false }), F({ key: "c", label: "Name" })];
  assert.deepEqual(identityFields(fields).map((f) => f.key), ["a"]);
});
test("firstIdentityValue returns first non-empty", () => {
  const fields = [F({ key: "a", label: "ID" }), F({ key: "b", label: "Photo ID" })];
  assert.equal(firstIdentityValue(fields, { a: "  ", b: "X9" }), "X9");
  assert.equal(firstIdentityValue(fields, {}), null);
});
test("smallestAddSerial finds the lowest free number", () => {
  assert.equal(smallestAddSerial([]), "ADD_001");
  assert.equal(smallestAddSerial(["ADD_001", "ADD_003"]), "ADD_002");
  assert.equal(smallestAddSerial(["ADD_1 and ADD_2"]), "ADD_003");
});

function stubClient(responses: Record<string, unknown>) {
  const calls: string[] = [];
  const query = mock.fn(async (sql: string) => {
    calls.push(sql);
    for (const [frag, rows] of Object.entries(responses)) if (sql.includes(frag)) return { rows } as any;
    return { rows: [] } as any;
  });
  return { client: { query } as any, calls };
}

test("allocateReusableAddSerial: requires org", async () => {
  const { client } = stubClient({});
  await assert.rejects(() => allocateReusableAddSerial(client, {}), /Organization is required/);
});
test("allocateReusableAddSerial: issues max(seq,highest)+1 (school)", async () => {
  const { client } = stubClient({
    "photo_capture_seq FROM schools": [{ photo_capture_seq: 2 }],
    "photo_id FROM students": [{ photo_id: "ADD_005" }, { photo_id: "P9" }],
  });
  assert.equal(await allocateReusableAddSerial(client, { schoolId: "s1" }), "ADD_006");
});
test("allocateReusableAddSerial: first issue when empty (institute)", async () => {
  const { client } = stubClient({
    "photo_capture_seq FROM institutes": [{ photo_capture_seq: 0 }],
    "photo_id FROM students": [],
  });
  assert.equal(await allocateReusableAddSerial(client, { instituteId: "i1" }), "ADD_001");
});
test("allocateOrganizationAddSerial", async () => {
  const { client } = stubClient({
    "photo_capture_seq FROM organizations": [{ photo_capture_seq: 0 }],
    "photo_number FROM organization_submissions": [{ photo_number: "ADD_010" }],
  });
  assert.equal(await allocateOrganizationAddSerial(client, "o1"), "ADD_011");
});
