import type {
  AwayDate,
  MonthAbsence,
  Person,
  Roster,
  Rules,
  Warning,
  WeekAssignments,
} from "./types";
import { isAwayOn, weekIndexOfSunday } from "./dates";

export interface PeopleLookup {
  byName: Map<string, Person>;
  all: Person[];
}

export function buildLookup(people: Person[]): PeopleLookup {
  const byName = new Map<string, Person>();
  // Case-insensitive key normalisation.
  for (const p of people) byName.set(normalize(p.name), p);
  return { byName, all: people };
}

export function normalize(name: string): string {
  // Strip ALL whitespace so "Wan Ying" == "Wanying", "Puay Choo" == "PuayChoo".
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function findPerson(lookup: PeopleLookup, name?: string): Person | undefined {
  if (!name) return undefined;
  // Allow fuzzy match like "Ps Ludwig" <-> "Ludwig" by trying exact, then by
  // trimming common prefixes ("Ps ", "Uncle ", "Aunty ").
  const variants = [
    name,
    name.replace(/^(ps\.?\s+|pastor\s+|uncle\s+|aunty\s+)/i, ""),
  ];
  for (const v of variants) {
    const hit = lookup.byName.get(normalize(v));
    if (hit) return hit;
  }
  return undefined;
}

// Set of roles considered "worship team" for same-week clash checks.
const WORSHIP_SLOTS: (keyof WeekAssignments)[] = [
  "worshipLeader",
  "singers",
  "piano",
  "guitar",
  "bass",
  "drums",
  "freeshow",
  "strings",
  "sound",
];

function personInWeek(
  week: WeekAssignments,
  predicate: (slot: string | string[], key: keyof WeekAssignments) => boolean
): string[] {
  // Collect names from every slot in the week and apply the predicate.
  const found = new Set<string>();
  for (const key of Object.keys(week) as (keyof WeekAssignments)[]) {
    if (key === "date" || key === "day") continue;
    const v = week[key];
    if (typeof v === "string") {
      if (predicate(v, key)) found.add(v);
    } else if (Array.isArray(v)) {
      for (const name of v) if (predicate(name, key)) found.add(name);
    }
  }
  return [...found];
}

// All names a person holds this week (across all slots), for clash detection.
function namesForWeek(week: WeekAssignments): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (name: string, slot: string) => {
    const n = name.trim();
    if (!n) return;
    const arr = map.get(n) || [];
    arr.push(slot);
    map.set(n, arr);
  };
  for (const key of Object.keys(week) as (keyof WeekAssignments)[]) {
    if (key === "date" || key === "day") continue;
    const v = week[key];
    if (typeof v === "string") push(v, String(key));
    else if (Array.isArray(v)) v.forEach((n) => push(n, String(key)));
  }
  return map;
}

export function validateRoster(
  roster: Roster,
  lookup: PeopleLookup,
  rules: Rules
): Warning[] {
  const warnings: Warning[] = [];
  const weeks = [...roster.saturdays, ...roster.sundays];

  // Tally per-month usages for usher back-to-back and 2x/month checks.
  const usherCount = new Map<string, number>();
  for (const w of roster.sundays) {
    for (const u of w.ushers) usherCount.set(u, (usherCount.get(u) || 0) + 1);
  }
  const usherDatesByPerson = new Map<string, string[]>();
  for (const w of roster.sundays) {
    for (const u of w.ushers) {
      const arr = usherDatesByPerson.get(u) || [];
      arr.push(w.date);
      usherDatesByPerson.set(u, arr);
    }
  }

  for (const week of weeks) {
    const isSaturday = week.day === "saturday";
    const weekIdx = isSaturday ? 1 : weekIndexOfSunday(week.date);
    const namesMap = namesForWeek(week);

    // 1. Away-date checks (overlap crews excluded — the fixed teams are
    // listed even when someone is away, matching the printed rosters).
    for (const [name, slots] of namesMap.entries()) {
      const nonOverlap = slots.filter(
        (s) =>
          s !== "hospitality" &&
          s !== "hospitalityLeads" &&
          s !== "kitchen" &&
          s !== "cafe"
      );
      if (nonOverlap.length === 0) continue;
      const p = findPerson(lookup, name);
      if (!p) continue;
      if (isAwayOn(week.date, p.awayDates)) {
        warnings.push({
          date: week.date,
          slot: nonOverlap.join(","),
          message: `${name} is marked away on ${week.date} but is rostered.`,
          severity: "hard",
        });
      }
    }

    // 2. Saturday-unavailable people.
    if (isSaturday) {
      for (const name of namesMap.keys()) {
        if (rules.saturdayUnavailable.some((n) => normalize(n) === normalize(name))) {
          warnings.push({
            date: week.date,
            slot: "all",
            message: `${name} is not available on Saturdays.`,
            severity: "hard",
          });
        }
      }
    }

    // 3. Preaching rules: Pastor Ludwig 1st/3rd, Chris/Donald alt 2nd, Dino 4th, Grace 5th.
    if (!isSaturday && week.preaching) {
      const expected = rules.preachingRotation.find((r) => r.week === weekIdx);
      if (expected && expected.options.length > 0) {
        if (!expected.options.some((o) => normalize(o) === normalize(week.preaching!))) {
          warnings.push({
            date: week.date,
            slot: "preaching",
            message: `${week.preaching} is preaching in week ${weekIdx}; rotation suggests ${expected.options.join(" or ")}.`,
            severity: "soft",
          });
        }
      }
    }

    // 4. HC conductor cannot be preaching that service.
    if (week.hcConductor && week.preaching &&
        normalize(week.hcConductor) === normalize(week.preaching)) {
      warnings.push({
        date: week.date,
        slot: "hcConductor",
        message: `${week.hcConductor} cannot conduct HC on a week they're preaching.`,
        severity: "hard",
      });
    }

    // 4b. Worship leader cannot also be preaching that week (preaching priority).
    if (week.worshipLeader && week.preaching &&
        normalize(week.worshipLeader) === normalize(week.preaching)) {
      warnings.push({
        date: week.date,
        slot: "worshipLeader",
        message: `${week.worshipLeader} cannot lead worship on a week they're preaching.`,
        severity: "hard",
      });
    }

    // 5. Chris/Donald conducting restriction (per Word doc).
    if (week.hcConductor && (normalize(week.hcConductor) === "chris" || normalize(week.hcConductor) === "donald")) {
      if (week.preaching && normalize(week.preaching) === normalize(week.hcConductor)) {
        // already flagged above
      }
    }

    // 6. Dino 3rd HC server => Amy not on worship.
    if (week.hcServers.some((s) => normalize(s) === "dino")) {
      if (WORSHIP_SLOTS.some((slot) => {
        const v = week[slot];
        if (Array.isArray(v)) return v.some((n) => normalize(n) === "amy");
        return typeof v === "string" && normalize(v) === "amy";
      })) {
        warnings.push({
          date: week.date,
          slot: "hcServers",
          message: "Dino is a HC server; Amy must not be on worship that week.",
          severity: "hard",
        });
      }
    }

    // 7. Camera clash: cannot be on ushers or worship team same week.
    // (Per rostering doc: "They cant be on ushers or on Worship team.")
    // Hospitality / hospitalityLeads / kitchen / cafe crews MAY overlap with
    // camera (observed: Aira on camera + hospitality/cafe; Alif on camera +
    // kitchen), as can counting/HC/toilets (different time in service).
    if (week.camera) {
      const camNorm = normalize(week.camera);
      const clashes: string[] = [];
      // Worship-team slots.
      for (const slot of WORSHIP_SLOTS) {
        const v = week[slot];
        if (Array.isArray(v)) {
          if (v.some((n) => normalize(n) === camNorm)) clashes.push(String(slot));
        } else if (typeof v === "string" && v && normalize(v) === camNorm) {
          clashes.push(String(slot));
        }
      }
      // Ushers.
      if (week.ushers.some((u) => normalize(u) === camNorm)) clashes.push("ushers");
      if (clashes.length > 0) {
        warnings.push({
          date: week.date,
          slot: "camera",
          message: `${week.camera} is on Camera and also on ${clashes.join(", ")} same week.`,
          severity: "hard",
        });
      }
    }

    // 8. Usher rules: 2/month, no back-to-back.
    if (!isSaturday) {
      for (const u of week.ushers) {
        const c = usherCount.get(u) || 0;
        if (c > rules.usherMaxPerMonth) {
          warnings.push({
            date: week.date,
            slot: "ushers",
            message: `${u} is on ushers ${c} times this month (max ${rules.usherMaxPerMonth}).`,
            severity: "soft",
          });
        }
      }
      // Back-to-back check (consecutive Sundays).
      if (!rules.usherBackToBackAllowed) {
        const dates = roster.sundays.map((w) => w.date).sort();
        const dateIdx = dates.indexOf(week.date);
        if (dateIdx > 0) {
          const prev = roster.sundays[dateIdx - 1];
          for (const u of week.ushers) {
            if (prev.ushers.some((p) => normalize(p) === normalize(u))) {
              warnings.push({
                date: week.date,
                slot: "ushers",
                message: `${u} is on ushers back-to-back weeks.`,
                severity: "soft",
              });
            }
          }
        }
      }
    }

    // 9. Usher Freeshow clash: if on ushers, can't be on Freeshow (F) that week.
    if (week.ushers.length && week.freeshow) {
      if (week.ushers.some((u) => normalize(u) === normalize(week.freeshow!))) {
        warnings.push({
          date: week.date,
          slot: "freeshow",
          message: `${week.freeshow} is on Ushers and Freeshow the same week.`,
          severity: "hard",
        });
      }
    }

    // 10. Counting: Karen + Wanying never together.
    if (week.counting.length >= 2) {
      const names = week.counting.map(normalize);
      for (const [a, b] of rules.countingConflicts) {
        if (names.includes(normalize(a)) && names.includes(normalize(b))) {
          warnings.push({
            date: week.date,
            slot: "counting",
            message: `${a} and ${b} (conflict of interest) are on counting together.`,
            severity: "hard",
          });
        }
      }
    }

    // 11b. Hospitality: fixed Team A / Team B rotation.
    // - "none" (break/recess/rare off-weeks, incl. Saturdays and 1st Sundays)
    //   must have empty hospitality + leads.
    // - "A"/"B" must match the fixed team membership; leads must be a subset
    //   (usually 3) of the team.
    // - "combined" (special Sundays, e.g. Evangel Day) just needs a non-empty list.
    {
      const team = (week.hospitalityTeam || "").trim();
      const hosp = week.hospitality || [];
      const leads = week.hospitalityLeads || [];
      const normSet = (arr: string[]) => new Set(arr.map(normalize));
      if (week.day === "saturday") {
        if (hosp.length > 0) {
          warnings.push({
            date: week.date,
            slot: "hospitality",
            message: "Hospitality is Sundays only; Saturday should be empty.",
            severity: "soft",
          });
        }
      } else if (team === "none" || team === "") {
        if (hosp.length > 0 || leads.length > 0) {
          warnings.push({
            date: week.date,
            slot: "hospitality",
            message: `Hospitality is set to "${team || "unset"}" but names are listed.`,
            severity: "soft",
          });
        }
      } else if (team === "A" || team === "B") {
        const expected = team === "A" ? rules.hospitalityTeamA : rules.hospitalityTeamB;
        const expSet = normSet(expected || []);
        const hospSet = normSet(hosp);
        const missing = (expected || []).filter((n) => !hospSet.has(normalize(n)));
        const extra = hosp.filter((n) => !expSet.has(normalize(n)));
        if (missing.length > 0 || extra.length > 0) {
          const parts: string[] = [];
          if (missing.length) parts.push(`missing ${missing.join(", ")}`);
          if (extra.length) parts.push(`unexpected ${extra.join(", ")}`);
          warnings.push({
            date: week.date,
            slot: "hospitality",
            message: `Team ${team} should be ${(expected || []).join(", ")} (${parts.join("; ")}).`,
            severity: "soft",
          });
        }
        const wanted = rules.hospitalityLeadsPerWeek || 3;
        if (leads.length !== wanted) {
          warnings.push({
            date: week.date,
            slot: "hospitalityLeads",
            message: `Team ${team} should have ${wanted} ^ setup leads (has ${leads.length}).`,
            severity: "soft",
          });
        }
        const notInTeam = leads.filter((n) => !hospSet.has(normalize(n)));
        if (notInTeam.length > 0) {
          warnings.push({
            date: week.date,
            slot: "hospitalityLeads",
            message: `Setup leads must be part of Team ${team}: ${notInTeam.join(", ")}.`,
            severity: "soft",
          });
        }
      } else if (team === "combined") {
        if (hosp.length === 0) {
          warnings.push({
            date: week.date,
            slot: "hospitality",
            message: 'Combined hospitality week should list the combined team.',
            severity: "soft",
          });
        }
      } else {
        warnings.push({
          date: week.date,
          slot: "hospitality",
          message: `Unknown hospitality team "${team}" (use A, B, combined or none).`,
          severity: "soft",
        });
      }
    }

    // 11. Worship team hard clashes: ushers/HC/camera same week as worship team.
    const worshipNames = new Set<string>();
    for (const slot of WORSHIP_SLOTS) {
      const v = week[slot];
      if (Array.isArray(v)) v.forEach((n) => worshipNames.add(normalize(n)));
      else if (typeof v === "string") worshipNames.add(normalize(v));
    }
    if (worshipNames.size > 0) {
      // ushers clash
      for (const u of week.ushers) {
        if (worshipNames.has(normalize(u))) {
          warnings.push({
            date: week.date,
            slot: "ushers",
            message: `${u} is on Ushers and Worship team the same week.`,
            severity: "soft",
          });
        }
      }
      // HC server clash
      for (const s of week.hcServers) {
        if (worshipNames.has(normalize(s))) {
          warnings.push({
            date: week.date,
            slot: "hcServers",
            message: `${s} is on HC servers and Worship team the same week.`,
            severity: "soft",
          });
        }
      }
    }
  }
  return warnings;
}

// Helper exported for the algorithm: is the given person away/unavailable?
export function isUnavailable(
  personName: string,
  date: string,
  isSaturday: boolean,
  rules: Rules,
  lookup: PeopleLookup
): boolean {
  // Global skip: person is on break — never roster anywhere.
  if (rules.globalSkip?.some((n) => normalize(n) === normalize(personName))) return true;
  const p = findPerson(lookup, personName);
  if (p && isAwayOn(date, p.awayDates)) return true;
  if (isSaturday && rules.saturdayUnavailable.some((n) => normalize(n) === normalize(personName))) {
    return true;
  }
  return false;
}

export function hasCapability(p: Person | undefined, cap: string): boolean {
  if (!p) return false;
  return p.capabilities.includes(cap as Person["capabilities"][number]);
}

// Fold this month's absences into each person's awayDates so every existing
// availability check (isUnavailable, validateRoster) blocks them automatically.
export function applyAbsences(
  people: Person[],
  absences?: MonthAbsence[]
): Person[] {
  if (!absences || absences.length === 0) return people;
  const byName = new Map<string, AwayDate[]>();
  for (const a of absences) {
    if (!a.personName || !a.from) continue;
    const key = normalize(a.personName);
    const arr = byName.get(key) || [];
    arr.push({ from: a.from, to: a.to, note: a.note });
    byName.set(key, arr);
  }
  return people.map((p) => {
    const extra = byName.get(normalize(p.name));
    if (!extra) return p;
    return { ...p, awayDates: [...p.awayDates, ...extra] };
  });
}

export type { AwayDate };
