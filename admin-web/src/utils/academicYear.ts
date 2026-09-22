/** Academic year starts in April (common convention in this app). */
export function getAcademicYearStartYear(date = new Date()): number {
  const month = date.getMonth();
  const calendarYear = date.getFullYear();
  return month >= 3 ? calendarYear : calendarYear - 1;
}

export function formatAcademicYearLabel(startYear: number): string {
  return `${startYear} - ${startYear + 1}`;
}

export function buildCurrentAcademicYearOption(date = new Date()) {
  const start = getAcademicYearStartYear(date);
  return {
    label: formatAcademicYearLabel(start),
    value: String(start),
  };
}

/** Only the current academic year (rolls forward automatically each April). */
export function buildDashboardAcademicYearOptions(date = new Date()) {
  return [buildCurrentAcademicYearOption(date)];
}
