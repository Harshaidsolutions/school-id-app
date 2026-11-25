/** Pure helpers for rendering admin notification details (extracted from AppLayout so they are unit-tested). */
export type NoticeRow = { label: string; value: string };
export type OrderedNoticeRow = { label: string; value: string; secret?: boolean };

/** Parse a "Label:\n<value>" notification message body into label/value rows. */
export function parseNoticeDetails(message: string): NoticeRow[] {
  const rows: NoticeRow[] = [];
  let label: string | null = null;
  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.endsWith(":") && trimmed.length < 40 && !trimmed.includes(" ")) {
      label = trimmed.slice(0, -1);
      continue;
    }
    if (trimmed.endsWith(":") && trimmed.length < 48) {
      label = trimmed.slice(0, -1);
      continue;
    }
    if (label) {
      rows.push({ label, value: trimmed });
      label = null;
    }
  }
  return rows;
}

/** Notification detail rows: type, name, created by, username, password (date/time is in the header). */
export function orderedNoticeRows(details: NoticeRow[]): OrderedNoticeRow[] {
  const find = (re: RegExp) => details.find((row) => re.test(row.label.trim()));
  const org = find(/^(school|institute|organization|college)$/i);
  const out: OrderedNoticeRow[] = [];
  if (org) {
    out.push({ label: "Type", value: org.label.trim() });
    out.push({ label: `${org.label.trim()} name`, value: org.value });
  }
  // Who created this org (a child admin — these notifications only fire for child-admin creations).
  const creator = find(/^created by$/i);
  if (creator?.value) out.push({ label: "Created by", value: creator.value });
  const user = find(/^username$/i);
  if (user) out.push({ label: "Username", value: user.value });
  const pass = find(/^password$/i);
  if (pass) out.push({ label: "Password", value: pass.value, secret: true });
  if (!out.length) return details.filter((row) => !/^(date|time)$/i.test(row.label.trim()));
  return out;
}

export function noticeHeadline(title: string, details: NoticeRow[]): string {
  const kind = title.match(/(school|institute)/i)?.[1];
  if (kind && /created/i.test(title)) {
    const org = details.find((row) => /^(school|institute)$/i.test(row.label.trim()));
    if (org?.value) return `${org.label.trim()} · ${org.value}`;
    return `New ${kind.toLowerCase()}`;
  }
  return title;
}
