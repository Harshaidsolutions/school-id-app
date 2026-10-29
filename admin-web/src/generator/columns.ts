/** Smart Excel column detection: whatever the header is called, find what it means. */
export type Role = {
  key: string;
  label: string;
  synonyms: string[];
};

export const ROLES: Role[] = [
  { key: "admission", label: "Admission No / ID", synonyms: ["admission", "admn", "adm", "admno", "admissionno", "admissionnumber", "enrollment", "enrolment", "enrol", "regno", "registration", "registrationno", "studentid", "stdid", "id", "idno", "uid", "photoid", "srno", "scholarno", "grno", "sid", "empid", "employeeid", "staffid"] },
  { key: "roll", label: "Roll No", synonyms: ["roll", "rollno", "rollnumber", "rno"] },
  { key: "name", label: "Student / Person Name", synonyms: ["name", "studentname", "stdname", "std_name", "fullname", "student", "nameofthestudent", "candidatename", "pupilname", "employeename", "staffname", "membername", "firstname"] },
  { key: "father", label: "Father Name", synonyms: ["father", "fathername", "fathersname", "fname", "fathersname", "parent", "parentname", "guardian", "guardianname", "fatherguardian", "so", "co"] },
  { key: "mother", label: "Mother Name", synonyms: ["mother", "mothername", "mothersname", "mname"] },
  { key: "class", label: "Class", synonyms: ["class", "std", "standard", "grade", "classname", "course", "branch", "year", "department", "dept", "designation"] },
  { key: "section", label: "Section", synonyms: ["section", "sec", "division", "div"] },
  { key: "classSection", label: "Class & Section", synonyms: ["classsection", "classsec", "classdiv", "classandsection"] },
  { key: "dob", label: "Date of Birth", synonyms: ["dob", "dateofbirth", "birthdate", "birthday", "dtofbirth", "dateofbrith"] },
  { key: "blood", label: "Blood Group", synonyms: ["blood", "bloodgroup", "bg", "bloodgrp", "bgroup"] },
  { key: "phone", label: "Phone / Mobile", synonyms: ["phone", "mobile", "mobileno", "phoneno", "contact", "contactno", "parentphone", "parentmobile", "fathermobile", "cell", "mob", "whatsapp", "phonenumber", "mobilenumber"] },
  { key: "emergency", label: "Emergency Contact", synonyms: ["emergency", "emergencycontact", "emergencyno", "emergencyphone", "alternate", "alternatemobile", "altmobile", "altphone"] },
  { key: "address", label: "Address", synonyms: ["address", "addr", "residentialaddress", "permanentaddress", "village", "place", "location", "city", "town", "residence"] },
  { key: "transport", label: "Transport / Route", synonyms: ["transport", "route", "busroute", "busno", "bus", "vehicle", "pickup"] },
  { key: "aadhaar", label: "Aadhaar", synonyms: ["aadhaar", "aadhar", "aadharno", "aadhaarno", "uidai"] },
  { key: "house", label: "House", synonyms: ["house", "housename"] },
  { key: "validity", label: "Valid Till / Session", synonyms: ["validity", "validtill", "validupto", "session", "academicyear", "expiry", "expires"] },
];

export function normaliseHeader(header: string): string {
  return header.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function score(header: string, role: Role): number {
  const h = normaliseHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of role.synonyms) {
    const s = normaliseHeader(syn);
    if (h === s) best = Math.max(best, 100);
    else if (s.length >= 3 && (h.startsWith(s) || h.endsWith(s))) best = Math.max(best, 70 + Math.min(20, s.length));
    else if (s.length >= 4 && h.includes(s)) best = Math.max(best, 55 + Math.min(20, s.length));
  }
  return best;
}

/** Best column for each role (each column used once, strongest match wins). */
export function detectRoles(columns: string[]): Record<string, string> {
  const candidates: { role: string; column: string; score: number }[] = [];
  for (const role of ROLES) for (const column of columns) {
    const s = score(column, role);
    if (s >= 55) candidates.push({ role: role.key, column, score: s });
  }
  candidates.sort((a, b) => b.score - a.score);
  const roles: Record<string, string> = {};
  const usedColumns = new Set<string>();
  for (const c of candidates) {
    if (roles[c.role] || usedColumns.has(c.column)) continue;
    // "Name" alone must not be taken by father/mother when the column says Father Name etc.
    roles[c.role] = c.column;
    usedColumns.add(c.column);
  }
  return roles;
}

/** Display value for a row: role → column → text. */
export function roleValue(row: Record<string, string>, roles: Record<string, string>, role: string): string {
  const col = roles[role];
  return col ? (row[col] ?? "").trim() : "";
}

export function applyCase(text: string, mode: "none" | "upper" | "lower" | "title" | "sentence"): string {
  if (mode === "upper") return text.toLocaleUpperCase();
  if (mode === "lower") return text.toLocaleLowerCase();
  if (mode === "title") return text.toLocaleLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toLocaleUpperCase());
  if (mode === "sentence") {
    const lower = text.toLocaleLowerCase();
    return lower.replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_m, a: string, b: string) => a + b.toLocaleUpperCase());
  }
  return text;
}
