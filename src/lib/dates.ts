// Date helpers (all in ISO yyyy-mm-dd). No timezone gymnastics — we treat
// dates as plain strings everywhere in storage.

export function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parse(isoStr: string): Date {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Returns all Sundays in the given month as ISO strings.
export function sundaysInMonth(year: number, month1: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month1 - 1, 1);
  // advance to first Sunday
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month1 - 1) {
    out.push(iso(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// First Saturday of the month (1st-Saturday service) or null.
export function firstSaturday(year: number, month1: number): string | null {
  const d = new Date(year, month1 - 1, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return iso(d);
}

// Week index (1..5) of the given Sunday within its month.
export function weekIndexOfSunday(isoStr: string): number {
  const d = parse(isoStr);
  return Math.ceil(d.getDate() / 7);
}

// Inclusive overlap check for an away range vs a single date.
export function isAwayOn(
  date: string,
  away: { from: string; to?: string }[]
): boolean {
  return away.some((a) => {
    if (date < a.from) return false;
    if (a.to && date > a.to) return false;
    return true;
  });
}

export function monthString(year: number, month1: number): string {
  return `${year}-${String(month1).padStart(2, "0")}`;
}

export function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-AU", {
    month: "long",
    year: "numeric",
  });
}
