import { test } from "node:test";
import assert from "node:assert/strict";
import { classSortKey, sortClassSections } from "../../src/utils/classSort.ts";
import { getAssignedClassSection, isSchoolWideTeacher } from "../../src/utils/teacherScope.ts";
import { isFieldVisible, applyFieldVisibility } from "../../src/utils/fieldVisibility.ts";
import { resolveFieldKind, resolveFieldLabelKind } from "../../src/utils/formFieldKinds.ts";
import { markIntroSeen } from "../../src/navigation/authInitialRoute.ts";
import { returnToClassList } from "../../src/navigation/returnToClass.ts";

test("classSortKey: hierarchy Nursery<LKG<UKG<I<...", () => {
  assert.equal(classSortKey("Nursery")[0], -30);
  assert.equal(classSortKey("LKG")[0], -20);
  assert.equal(classSortKey("UKG")[0], -10);
  assert.equal(classSortKey("I")[0], 1);
  assert.equal(classSortKey("X")[0], 10);
  assert.equal(classSortKey("5")[0], 5);
  assert.equal(classSortKey("Unknown")[0], 1000);
});
test("sortClassSections asc/desc", () => {
  const asc = sortClassSections([{ c: "X" }, { c: "Nursery" }, { c: "V" }], (x) => x.c);
  assert.deepEqual(asc.map((x) => x.c), ["Nursery", "V", "X"]);
  const desc = sortClassSections([{ c: "I" }, { c: "X" }], (x) => x.c, "desc");
  assert.deepEqual(desc.map((x) => x.c), ["X", "I"]);
});
test("teacherScope", () => {
  assert.equal(getAssignedClassSection({ assignedClass: "5", assignedSection: "A" } as any), "5 A");
  assert.equal(getAssignedClassSection({ assignedClass: "5" } as any), "5");
  assert.equal(getAssignedClassSection(null), null);
  assert.equal(isSchoolWideTeacher({ role: "teacher", schoolId: "s1" } as any), true);
  assert.equal(isSchoolWideTeacher({ role: "teacher", schoolId: "s1", assignedClass: "5" } as any), false);
});
test("fieldVisibility", () => {
  assert.equal(isFieldVisible("a", undefined), true);
  assert.equal(isFieldVisible("a", { a: false }), false);
  assert.equal(isFieldVisible("a", { a: true }), true);
  assert.deepEqual(applyFieldVisibility([{ key: "a" }, { key: "b" }] as any, { b: false }).map((f) => f.key), ["a"]);
});
test("formFieldKinds: canonical + label + excel generic", () => {
  assert.equal(resolveFieldKind({ key: "student_name", label: "Name" } as any), "student_name");
  assert.equal(resolveFieldKind({ key: "blood_group", label: "Blood Group" } as any), "blood_group");
  assert.equal(resolveFieldKind({ key: "fld_0", label: "Photo" } as any), "photo");
  assert.equal(resolveFieldKind({ key: "fld_1", label: "Favourite Colour" } as any), "generic");
  assert.equal(resolveFieldLabelKind({ key: "fld_2", label: "Father Name" } as any), "parent_name");
  assert.equal(resolveFieldLabelKind({ key: "fld_3", label: "Mobile" } as any), "parent_phone");
  assert.equal(resolveFieldKind({ key: "dob", label: "DOB" } as any), "dob");
  assert.equal(resolveFieldKind({ key: "gender", label: "Sex" } as any), "gender");
});
test("authInitialRoute markIntroSeen does not throw", () => {
  assert.doesNotThrow(() => markIntroSeen());
});
test("returnToClassList resets navigation with/without class", () => {
  const calls: any[] = [];
  const nav = { reset: (a: unknown) => calls.push(a) } as any;
  returnToClassList(nav, "5 A");
  assert.equal(calls[0].routes.length, 2);
  returnToClassList(nav, null);
  assert.equal(calls[1].routes.length, 1);
});
