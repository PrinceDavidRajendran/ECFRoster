import type {
  CapabilityKey,
  Person,
  Roster,
  Rules,
  Warning,
  WeekAssignments,
} from "./types";
import { firstSaturday, sundaysInMonth, weekIndexOfSunday } from "./dates";
import { buildLookup, isUnavailable, normalize, PeopleLookup } from "./rules";

// ----- Helpers ---------------------------------------------------------------

function emptyWeek(date: string, day: "saturday" | "sunday"): WeekAssignments {
  return {
    date,
    day,
    singers: [],
    hcServers: [],
    hcSetup: [],
    counting: [],
    ushers: [],
    hospitality: [],
    kitchen: [],
    cafe: [],
  };
}

// Kitchen/Cafe/Hospitality crews may overlap with worship team / ushers / HC
// in the same week (observed: singers also on kitchen), so they are excluded
// from clash + fairness accounting like the fixed hospitality teams.
const OVERLAP_KEYS: (keyof WeekAssignments)[] = [
  "hospitality",
  "hospitalityTeam",
  "hospitalityLeads",
  "kitchen",
  "cafe",
];

function capabilityPool(
  lookup: PeopleLookup,
  cap: CapabilityKey,
  options: { activeOnly?: boolean } = {}
): string[] {
  return lookup.all
    .filter((p) => (options.activeOnly === false ? true : p.active))
    .filter((p) => p.capabilities.includes(cap))
    .map((p) => p.name);
}

function findPerson(lookup: PeopleLookup, name: string): Person | undefined {
  return lookup.byName.get(normalize(name));
}

// Returns whether name is already doing something in the given week.
// Overlap crews (kitchen/cafe/hospitality) are deliberately ignored so
// service roles never clash-block crew members (and vice versa).
function isAssignedAnywhere(week: WeekAssignments, name: string): boolean {
  const n = normalize(name);
  for (const key of Object.keys(week) as (keyof WeekAssignments)[]) {
    if (key === "date" || key === "day") continue;
    if ((OVERLAP_KEYS as string[]).includes(key)) continue;
    const v = week[key];
    if (typeof v === "string" && normalize(v) === n) return true;
    if (Array.isArray(v) && v.some((x) => normalize(x) === n)) return true;
  }
  return false;
}

function isOnWorshipTeam(week: WeekAssignments, name: string): boolean {
  const n = normalize(name);
  const slots: (keyof WeekAssignments)[] = [
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
  return slots.some((s) => {
    const v = week[s];
    if (Array.isArray(v)) return v.some((x) => normalize(x) === n);
    return typeof v === "string" && normalize(v) === n;
  });
}

// ----- Generator -------------------------------------------------------------

export interface GenerateResult {
  roster: Roster;
  warnings: Warning[];
  unresolved: { date: string; slot: string; reason: string }[];
}

export interface GenerateOptions {
  // If true, only fill worship-team slots (worship coord workflow).
  worshipOnly?: boolean;
  // Previous month's roster — used for cross-month fairness so people who were
  // NOT rostered last month are prioritised this month.
  previousRoster?: Roster;
}

// Counts how many times each person appeared anywhere in a roster.
function countAssignments(roster: Roster | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  if (!roster) return counts;
  const weeks = [...(roster.saturdays || []), ...(roster.sundays || [])];
  for (const w of weeks) {
    for (const key of Object.keys(w) as (keyof WeekAssignments)[]) {
      if (key === "date" || key === "day") continue;
      // Fixed crews must not distort cross-month fairness.
      if ((OVERLAP_KEYS as string[]).includes(key)) continue;
      const v = w[key];
      const add = (n: string) => {
        const k = normalize(n);
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      };
      if (typeof v === "string") add(v);
      else if (Array.isArray(v)) v.forEach(add);
    }
  }
  return counts;
}

export function generateRoster(
  month: string,
  rules: Rules,
  people: Person[],
  options: GenerateOptions = {}
): GenerateResult {
  const lookup = buildLookup(people);
  const [year, month1] = month.split("-").map(Number);

  // Build empty week shells.
  const sat = firstSaturday(year, month1);
  const saturdays: WeekAssignments[] = sat ? [emptyWeek(sat, "saturday")] : [];
  const sundays = sundaysInMonth(year, month1).map((d) => emptyWeek(d, "sunday"));

  const roster: Roster = {
    month,
    status: "DRAFT",
    saturdays,
    sundays,
    warnings: [],
    auditLog: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const unresolved: GenerateResult["unresolved"] = [];

  // Per-month fairness counters. Seed from last month's usage so people who
  // served a lot last month start "heavier" and the under-used are picked first.
  const timesThisMonth = new Map<string, number>();
  const lastMonthCounts = countAssignments(options.previousRoster);
  for (const [name, count] of lastMonthCounts.entries()) {
    // Weight last-month usage so it biases (but doesn't dominate) this month.
    timesThisMonth.set(name, count);
  }
  const bump = (name: string) =>
    timesThisMonth.set(normalize(name), (timesThisMonth.get(normalize(name)) || 0) + 1);

  // Previous-week HC conductor Chris/Donald alternation.
  let lastChrisDonald: "Chris" | "Donald" | null = null;

  // ---------- 1. PREACHING ---------- (Sundays only; no preaching on Saturday)
  if (!options.worshipOnly) {
    for (const w of sundays) {
      const weekIdx = weekIndexOfSunday(w.date);
      const slot = rules.preachingRotation.find((r) => r.week === weekIdx);
      const candidates = (slot?.options || []).filter(
        (n) => !isUnavailable(n, w.date, false, rules, lookup)
      );
      let chosen: string | undefined;
      if (weekIdx === 2 && candidates.length >= 1) {
        // Alternate Chris/Donald: pick the one who isn't lastChrisDonald.
        const alt = candidates.find((c) => {
          const norm = normalize(c);
          return norm === "chris"
            ? lastChrisDonald !== "Chris"
            : norm === "donald"
            ? lastChrisDonald !== "Donald"
            : false;
        });
        chosen = alt || candidates[0];
        if (chosen && normalize(chosen) === "chris") lastChrisDonald = "Chris";
        else if (chosen && normalize(chosen) === "donald") lastChrisDonald = "Donald";
      } else {
        chosen = candidates[0];
      }
      if (chosen) {
        w.preaching = chosen;
        bump(chosen);
      } else {
        unresolved.push({ date: w.date, slot: "preaching", reason: "No available candidate" });
      }
    }
  }

  // ---------- 2. WORSHIP LEADERS ----------
  // Rotate across BOTH Saturday and Sunday services. If a leader is assigned
  // to Saturday, they are skipped on the immediately-following Sunday.
  {
    const cycle = rules.worshipLeaderCycle.filter(
      (n) => !rules.worshipLeaderSkip.includes(n)
    );
    let i = 0;
    let saturdayLeader: string | null = null;

    // Continue the rotation from where last month ended so the same leaders
    // don't always open the month — vary combinations across months.
    if (options.previousRoster && cycle.length) {
      const prevWeeks = [
        ...(options.previousRoster.saturdays || []),
        ...(options.previousRoster.sundays || []),
      ].sort((a, b) => a.date.localeCompare(b.date));
      const lastLeader = prevWeeks
        .map((w) => w.worshipLeader)
        .filter(Boolean)
        .slice(-1)[0];
      if (lastLeader) {
        const idx = cycle.findIndex((n) => normalize(n) === normalize(lastLeader));
        if (idx >= 0) i = (idx + 1) % cycle.length;
      }
    }

    // Interleave: Saturday first (if any), then Sundays in chronological order.
    const allServices = [...saturdays, ...sundays].sort((a, b) => a.date.localeCompare(b.date));

    for (const w of allServices) {
      const isSat = w.day === "saturday";
      let chosen: string | undefined;
      for (let k = 0; k < cycle.length; k++) {
        const cand = cycle[(i + k) % cycle.length];
        if (isUnavailable(cand, w.date, isSat, rules, lookup)) continue;
        // Preaching takes priority: whoever is preaching can't also lead worship.
        if (w.preaching && normalize(cand) === normalize(w.preaching)) continue;
        // If this is the Sunday right after a Saturday service, skip whoever led Saturday.
        if (!isSat && saturdayLeader && normalize(cand) === normalize(saturdayLeader)) continue;
        chosen = cand;
        i = (i + k + 1) % cycle.length;
        break;
      }
      if (chosen) {
        w.worshipLeader = chosen;
        bump(chosen);
        if (isSat) saturdayLeader = chosen;
        else saturdayLeader = null; // reset after the Sunday following the Saturday
      } else {
        unresolved.push({ date: w.date, slot: "worshipLeader", reason: "All leaders away" });
      }
    }
  }

  // ---------- 3. HC CONDUCTOR (Sunday) ----------
  if (!options.worshipOnly) {
    const hcCondCount = new Map<string, number>(); // per-person conductor count this month
    let lastConductor: string | null = null; // track previous week's conductor for no-back-to-back
    for (const w of sundays) {
      const weekIdx = weekIndexOfSunday(w.date);
      const pool = [...rules.hcConductorPriority].filter(
        (n) => !isUnavailable(n, w.date, false, rules, lookup)
      );
      // Chris/Donald can't conduct on a week they're preaching.
      const preaching = w.preaching ? normalize(w.preaching) : null;
      let chosen: string | undefined;

      // First pass: prefer someone who didn't conduct last week.
      for (const cand of pool) {
        if (preaching && normalize(cand) === preaching) continue;
        const condMax = rules.hcConductorMax || 99;
        if ((hcCondCount.get(normalize(cand)) || 0) >= condMax) continue;
        // No back-to-back: skip if they conducted last week.
        if (lastConductor && normalize(cand) === normalize(lastConductor)) continue;
        // Alternate Chris/Donald across weeks.
        if (normalize(cand) === "chris" && lastChrisDonald === "Chris" && weekIdx !== 5) continue;
        if (normalize(cand) === "donald" && lastChrisDonald === "Donald" && weekIdx !== 5) continue;
        chosen = cand;
        if (normalize(cand) === "chris") lastChrisDonald = "Chris";
        else if (normalize(cand) === "donald") lastChrisDonald = "Donald";
        break;
      }

      // Second pass (fallback): allow back-to-back if no other option.
      if (!chosen) {
        for (const cand of pool) {
          if (preaching && normalize(cand) === preaching) continue;
          const condMax = rules.hcConductorMax || 99;
          if ((hcCondCount.get(normalize(cand)) || 0) >= condMax) continue;
          if (normalize(cand) === "chris" && lastChrisDonald === "Chris" && weekIdx !== 5) continue;
          if (normalize(cand) === "donald" && lastChrisDonald === "Donald" && weekIdx !== 5) continue;
          chosen = cand;
          if (normalize(cand) === "chris") lastChrisDonald = "Chris";
          else if (normalize(cand) === "donald") lastChrisDonald = "Donald";
          break;
        }
      }

      if (chosen) {
        w.hcConductor = chosen;
        bump(chosen);
        hcCondCount.set(normalize(chosen), (hcCondCount.get(normalize(chosen)) || 0) + 1);
        lastConductor = chosen;
      } else {
        unresolved.push({ date: w.date, slot: "hcConductor", reason: "No available conductor" });
        lastConductor = null;
      }
    }
  }

  // ---------- 4. HC CONDUCTOR (Saturday) ----------
  if (!options.worshipOnly) {
    for (const w of saturdays) {
      const pool = [...rules.hcConductorSaturday].filter(
        (n) => !isUnavailable(n, w.date, true, rules, lookup)
      );
      const chosen = pool[0];
      if (chosen) {
        w.hcConductor = chosen;
        bump(chosen);
      } else {
        unresolved.push({ date: w.date, slot: "hcConductor", reason: "No Saturday conductor" });
      }
    }
  }

  // ---------- 5. HC SETUP ----------
  if (!options.worshipOnly) {
    for (const w of [...saturdays, ...sundays]) {
      const isSat = w.day === "saturday";
      w.hcSetup = rules.hcSetupPeople.filter(
        (n) => !isUnavailable(n, w.date, isSat, rules, lookup)
      );
    }
  }

  // ---------- 6. MUSICIANS (P/G/B/D/F), SINGERS, SOUND, CAMERA ----------
  {
    // Leaders who play guitar themselves — skip guitar slot when they lead.
    const guitarLeaders = new Set(["psludwig", "amy", "lee"]);

    type MusicSlot = { key: keyof WeekAssignments; cap: CapabilityKey };
    const musicSlots: MusicSlot[] = [
      { key: "piano", cap: "piano" },
      { key: "guitar", cap: "guitar" },
      { key: "bass", cap: "bass" },
      { key: "drums", cap: "drums" },
      { key: "freeshow", cap: "freeshow" },
    ];

    // Track who was on each slot the previous week to avoid back-to-back.
    const prevSlotAssignment = new Map<string, string>(); // slot key → person name from prev week
    // Dedicated within-month drums counter (independent of cross-month fairness).
    const drumsThisMonth = new Map<string, number>();

    // Seed prev-week tracking from the previous month's LAST service so the
    // first week of the new month doesn't repeat the same people/combos.
    if (options.previousRoster) {
      const prevWeeks = [
        ...(options.previousRoster.saturdays || []),
        ...(options.previousRoster.sundays || []),
      ].sort((a, b) => a.date.localeCompare(b.date));
      const last = prevWeeks[prevWeeks.length - 1];
      if (last) {
        for (const { key } of musicSlots) {
          const v = last[key];
          if (typeof v === "string") prevSlotAssignment.set(key, v);
        }
        prevSlotAssignment.set("sound", (last.sound as string) || "");
        prevSlotAssignment.set("singers", (last.singers || []).join("|"));
      }
    }

    const allServices = [...saturdays, ...sundays].sort((a, b) => a.date.localeCompare(b.date));

    for (const w of allServices) {
      const isSat = w.day === "saturday";
      // Musicians + worship team leader form the "worship team" for clash checks.
      for (const { key, cap } of musicSlots) {
        // If worship leader plays guitar, don't assign a separate guitarist —
        // the leader covers it. Only skip if the leader IS actually playing guitar.
        if (key === "guitar" && w.worshipLeader && guitarLeaders.has(normalize(w.worshipLeader))) {
          prevSlotAssignment.set(key, ""); // reset tracking
          continue;
        }
        const pool = capabilityPool(lookup, cap)
          .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
          .filter((n) => !isAssignedAnywhere(w, n))
          .filter((n) => !(key === "freeshow" && rules.freeshowSkip?.some((s) => normalize(s) === normalize(n))));

        let chosen: string | undefined;
        const prevPerson = prevSlotAssignment.get(key) || "";

        if (key === "drums" && rules.drumsPriority?.length) {
          // Prefer drums-priority people but cap at drumsPriorityMax per month
          // (uses a dedicated within-month counter, not cross-month fairness).
          const max = rules.drumsPriorityMax || 3;
          const isPriority = (n: string) =>
            rules.drumsPriority.some((p) => normalize(p) === normalize(n));
          const isCapped = (n: string) =>
            isPriority(n) && (drumsThisMonth.get(normalize(n)) || 0) >= max;
          // Eligible pool never includes a priority person who hit their cap —
          // so e.g. Mathias can never exceed drumsPriorityMax.
          const eligiblePool = pool.filter((n) => !isCapped(n));
          // Spread priority drummers across the month: back-to-back avoidance
          // wins over the priority preference. If the priority person played
          // last service, give another drummer a turn so they're spread out.
          const noRepeat = eligiblePool.filter((n) => normalize(n) !== normalize(prevPerson));
          const priorityNoRepeat = noRepeat.filter(isPriority);
          const nonPriorityNoRepeat = noRepeat.filter((n) => !isPriority(n));
          if (priorityNoRepeat.length) {
            chosen = pickByFewest(priorityNoRepeat, timesThisMonth);
          } else if (nonPriorityNoRepeat.length) {
            chosen = pickByFewest(nonPriorityNoRepeat, timesThisMonth);
          } else {
            chosen = pickByFewest(eligiblePool, timesThisMonth);
          }
        } else if (key === "freeshow" && rules.drumsPriority?.length) {
          // Deprioritize drums-priority people for freeshow — pick others first.
          const nonPriority = pool.filter((n) =>
            !rules.drumsPriority.some((p) => normalize(p) === normalize(n))
          );
          // Avoid back-to-back.
          const nonPriorityNoRepeat = nonPriority.filter((n) => normalize(n) !== normalize(prevPerson));
          const poolNoRepeat = pool.filter((n) => normalize(n) !== normalize(prevPerson));
          chosen = nonPriorityNoRepeat.length
            ? pickByFewest(nonPriorityNoRepeat, timesThisMonth)
            : poolNoRepeat.length
            ? pickByFewest(poolNoRepeat, timesThisMonth)
            : pickByFewest(pool, timesThisMonth);
        } else {
          // Default: avoid back-to-back if possible.
          const noRepeat = pool.filter((n) => normalize(n) !== normalize(prevPerson));
          chosen = noRepeat.length ? pickByFewest(noRepeat, timesThisMonth) : pickByFewest(pool, timesThisMonth);
        }
        if (chosen) {
          (w[key] as string) = chosen;
          bump(chosen);
          if (key === "drums") {
            drumsThisMonth.set(normalize(chosen), (drumsThisMonth.get(normalize(chosen)) || 0) + 1);
          }
          prevSlotAssignment.set(key, chosen);
        } else {
          unresolved.push({ date: w.date, slot: String(key), reason: `No available ${cap}` });
          prevSlotAssignment.set(key, "");
        }
      }

      // Singers (count from rules). Balance genders and avoid back-to-back.
      const prevSingers: string[] = (prevSlotAssignment.get("singers") || "").split("|").filter(Boolean);
      const singerPool = capabilityPool(lookup, "singer")
        .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup));
      const chosenSingers: string[] = [];

      const isMaleSinger = (n: string) => rules.singersMale?.some((m) => normalize(m) === normalize(n));
      const isFemaleSinger = (n: string) => rules.singersFemale?.some((f) => normalize(f) === normalize(n));

      const getRemaining = () => singerPool.filter(
        (n) => !isAssignedAnywhere(w, n) &&
          !(w.worshipLeader && normalize(n) === normalize(w.worshipLeader)) &&
          !chosenSingers.some((s) => normalize(s) === normalize(n))
      );

      const pickFrom = (pool: string[]) => {
        const noRepeat = pool.filter((n) => !prevSingers.some((p) => normalize(p) === normalize(n)));
        return noRepeat.length ? pickByFewest(noRepeat, timesThisMonth) : pickByFewest(pool, timesThisMonth);
      };

      // Try to pick 1 male + 1 female for gender balance, then fill any gap.
      if (rules.singersPerWeek === 2 && rules.singersMale?.length && rules.singersFemale?.length) {
        // 1st pick: prefer a male.
        const males = getRemaining().filter(isMaleSinger);
        const male = pickFrom(males);
        if (male) { w.singers.push(male); chosenSingers.push(male); bump(male); }

        // 2nd pick: prefer a female.
        const females = getRemaining().filter(isFemaleSinger);
        const female = pickFrom(females);
        if (female) { w.singers.push(female); chosenSingers.push(female); bump(female); }
      }

      // Fill any remaining singer slots from ANY available singer (ensures we
      // always hit singersPerWeek even if one gender is short).
      while (w.singers.length < rules.singersPerWeek) {
        const rem = getRemaining();
        const chosen = pickFrom(rem);
        if (chosen) { w.singers.push(chosen); chosenSingers.push(chosen); bump(chosen); }
        else { unresolved.push({ date: w.date, slot: "singers", reason: "Not enough singers" }); break; }
      }
      prevSlotAssignment.set("singers", chosenSingers.join("|"));

      // Sound (worship-team adjacent, included for fairness). Avoid back-to-back.
      const prevSound = prevSlotAssignment.get("sound") || "";
      const soundPool = capabilityPool(lookup, "sound")
        .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
        .filter((n) => !isAssignedAnywhere(w, n));
      const soundNoRepeat = soundPool.filter((n) => normalize(n) !== normalize(prevSound));
      const soundChosen = soundNoRepeat.length ? pickByFewest(soundNoRepeat, timesThisMonth) : pickByFewest(soundPool, timesThisMonth);
      if (soundChosen) {
        w.sound = soundChosen;
        bump(soundChosen);
        prevSlotAssignment.set("sound", soundChosen);
      } else {
        prevSlotAssignment.set("sound", "");
      }

      // Camera (service role) — not on worship team or ushers that week.
      if (!options.worshipOnly) {
        const camPool = capabilityPool(lookup, "camera")
          .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
          .filter((n) => !isOnWorshipTeam(w, n))
          .filter((n) => !w.ushers.includes(n))
          .filter((n) => !isAssignedAnywhere(w, n));
        const camChosen = pickByFewest(camPool, timesThisMonth);
        if (camChosen) {
          w.camera = camChosen;
          bump(camChosen);
        } else {
          unresolved.push({ date: w.date, slot: "camera", reason: "No available camera operator" });
        }
      }
    }
  }

  // ---------- 7. HC SERVERS (3) — pair-based ----------
  if (!options.worshipOnly) {
    // Track how many times each pair has been used this month for fairness.
    const pairUsage = new Map<number, number>(); // pair index → times used

    for (const w of [...saturdays, ...sundays]) {
      const isSat = w.day === "saturday";

      // Helper: check if a person can serve this week.
      const canServe = (name: string): boolean => {
        if (isUnavailable(name, w.date, isSat, rules, lookup)) return false;
        if (rules.hcServerSkip?.some((s) => normalize(s) === normalize(name))) return false;
        // HC conductor that week cannot also be HC server.
        if (w.hcConductor && normalize(w.hcConductor) === normalize(name)) return false;
        // Check constraint: "noOtherRole" means they must not be assigned elsewhere.
        const constraint = rules.hcServerPairConstraints?.[name];
        if (constraint === "noOtherRole" && isAssignedAnywhere(w, name)) return false;
        // Also skip if on worship team (standard clash).
        if (isOnWorshipTeam(w, name)) return false;
        return true;
      };

      // Pick the best available pair (both members must be available).
      let chosenPair: [string, string] | null = null;
      let chosenPairIdx = -1;
      const pairs = rules.hcServerPairs || [];

      // Sort pairs by usage (least-used first) for fairness.
      const pairOrder = pairs
        .map((p, i) => ({ pair: p, idx: i, count: pairUsage.get(i) || 0 }))
        .sort((a, b) => a.count - b.count);

      for (const { pair, idx } of pairOrder) {
        if (canServe(pair[0]) && canServe(pair[1])) {
          chosenPair = pair as [string, string];
          chosenPairIdx = idx;
          break;
        }
      }

      if (chosenPair) {
        w.hcServers.push(chosenPair[0], chosenPair[1]);
        bump(chosenPair[0]);
        bump(chosenPair[1]);
        pairUsage.set(chosenPairIdx, (pairUsage.get(chosenPairIdx) || 0) + 1);
      } else {
        // Fallback: pick any 2 from the legacy pool.
        const fallback = [...rules.hcServerPool]
          .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
          .filter((n) => !isOnWorshipTeam(w, n))
          .filter((n) => !isAssignedAnywhere(w, n))
          .filter((n) => !rules.hcServerSkip?.some((s) => normalize(s) === normalize(n)))
          .filter((n) => !rules.hcServerThirdPool.some((t) => normalize(t) === normalize(n)))
          .filter((n) => !(w.hcConductor && normalize(w.hcConductor) === normalize(n)));
        for (let i = 0; i < 2 && fallback.length; i++) {
          const chosen = pickByFewest(fallback, timesThisMonth);
          if (!chosen) break;
          w.hcServers.push(chosen);
          bump(chosen);
          fallback.splice(fallback.indexOf(chosen), 1);
        }
      }

      // 3rd server from third pool (Aira, Wanying, Dino).
      const thirdPool = [...rules.hcServerThirdPool]
        .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
        .filter((n) => !isOnWorshipTeam(w, n))
        .filter((n) => !isAssignedAnywhere(w, n))
        .filter((n) => !rules.hcServerSkip?.some((s) => normalize(s) === normalize(n)))
        .filter((n) => !(w.hcConductor && normalize(w.hcConductor) === normalize(n)));

      if (w.hcServers.length >= 2 && thirdPool.length) {
        const chosen = pickByFewest(thirdPool, timesThisMonth);
        if (chosen) {
          w.hcServers.push(chosen);
          bump(chosen);
          if (normalize(chosen) === "dino") {
            // Enforce: remove Amy from worship team.
            for (const s of ["singers"] as const) {
              w[s] = w[s].filter((n) => normalize(n) !== "amy");
            }
          }
        }
      }

      while (w.hcServers.length < rules.hcServersPerWeek) {
        unresolved.push({ date: w.date, slot: "hcServers", reason: "Not enough HC servers" });
        break;
      }
    }
  }

  // ---------- 8. USHERS ----------
  if (!options.worshipOnly) {
    // Track usher pairs already used (this month + carried from last month) so
    // we vary combinations and don't keep the same two people together.
    const usedUsherPairs = new Set<string>();
    const pairKey = (a: string, b: string) =>
      [normalize(a), normalize(b)].sort().join("|");

    // Seed from previous month's usher pairings.
    if (options.previousRoster) {
      for (const pw of options.previousRoster.sundays || []) {
        const u = pw.ushers || [];
        for (let a = 0; a < u.length; a++) {
          for (let b = a + 1; b < u.length; b++) usedUsherPairs.add(pairKey(u[a], u[b]));
        }
      }
    }
    // Previous month's last Sunday ushers — avoid back-to-back into week 1.
    const prevMonthLastUshers: string[] =
      (options.previousRoster?.sundays || []).slice(-1)[0]?.ushers || [];

    for (const w of sundays) {
      const idx = sundays.findIndex((x) => x.date === w.date);
      const prevSunday = idx > 0 ? sundays[idx - 1] : undefined;
      const backToBackList = prevSunday ? prevSunday.ushers : idx === 0 ? prevMonthLastUshers : [];
      const usedNames = new Set<string>();

      const pickUsher = (pool: string[]): string | undefined => {
        const base = pool
          .filter((n) => !usedNames.has(normalize(n)))
          .filter((n) => !isUnavailable(n, w.date, false, rules, lookup))
          .filter((n) => !isOnWorshipTeam(w, n))
          .filter((n) => !isAssignedAnywhere(w, n))
          // No back-to-back with the previous service.
          .filter((n) => !backToBackList.some((p) => normalize(p) === normalize(n)));

        // Prefer candidates that don't recreate an already-used pair with anyone
        // already picked this week; fall back to base if that leaves no one.
        const noRepeatPair = base.filter(
          (n) => !w.ushers.some((u) => usedUsherPairs.has(pairKey(u, n)))
        );
        const eligible = noRepeatPair.length ? noRepeatPair : base;

        const chosen = pickByFewest(eligible, timesThisMonth);
        if (chosen) usedNames.add(normalize(chosen));
        return chosen;
      };

      // Pick from experts then young, filling up to ushersPerWeek.
      const experts = [...rules.usherExperts];
      const young = [...rules.usherYoung];

      const wanted = rules.ushersPerWeek;
      const expertsWanted = Math.min(2, Math.ceil(wanted / 2));
      const youngWanted = wanted - expertsWanted;

      for (let i = 0; i < expertsWanted; i++) {
        const c = pickUsher(experts); if (c) { w.ushers.push(c); bump(c); }
      }
      for (let i = 0; i < youngWanted; i++) {
        const c = pickUsher(young); if (c) { w.ushers.push(c); bump(c); }
      }
      // Fill remaining from whichever pool has capacity.
      while (w.ushers.length < wanted) {
        const c = pickUsher([...experts, ...young]);
        if (c) { w.ushers.push(c); bump(c); } else break;
      }
      // Record this week's pairs so future weeks vary.
      for (let a = 0; a < w.ushers.length; a++) {
        for (let b = a + 1; b < w.ushers.length; b++) {
          usedUsherPairs.add(pairKey(w.ushers[a], w.ushers[b]));
        }
      }
      if (w.ushers.length < wanted) {
        unresolved.push({ date: w.date, slot: "ushers", reason: "Not enough eligible ushers" });
      }
    }
  }

  // ---------- 9. COUNTING ----------
  if (!options.worshipOnly) {
    for (const w of [...saturdays, ...sundays]) {
      const isSat = w.day === "saturday";
      // Counting can overlap with ushers/HC servers (different time in service).
      // Only exclude people on worship team (they're busy during the whole service).
      const seniors = [...rules.countingSeniors]
        .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
        .filter((n) => !isOnWorshipTeam(w, n));
      const juniors = [...rules.countingJuniors]
        .filter((n) => !isUnavailable(n, w.date, isSat, rules, lookup))
        .filter((n) => !isOnWorshipTeam(w, n));

      const senior = pickByFewest(seniors, timesThisMonth);
      if (senior) { w.counting.push(senior); bump(senior); }

      // Junior that doesn't conflict with the senior (Karen + Wanying).
      const safeJuniors = juniors.filter((j) =>
        !rules.countingConflicts.some(([a, b]) => {
          const pair = [normalize(a), normalize(b)];
          return pair.includes(normalize(j)) && pair.includes(normalize(senior || ""));
        })
      );
      const junior = pickByFewest(safeJuniors.length ? safeJuniors : juniors, timesThisMonth);
      if (junior) { w.counting.push(junior); bump(junior); }

      while (w.counting.length < rules.countingTeamSize) {
        unresolved.push({ date: w.date, slot: "counting", reason: "Not enough counting team" });
        break;
      }
    }
  }

  // ---------- 10. TOILETS ----------
  if (!options.worshipOnly) {
    for (const w of sundays) {
      const mPool = capabilityPool(lookup, "toiletM")
        .filter((n) => !isUnavailable(n, w.date, false, rules, lookup))
        .filter((n) => !isAssignedAnywhere(w, n));
      const fPool = capabilityPool(lookup, "toiletF")
        .filter((n) => !isUnavailable(n, w.date, false, rules, lookup))
        .filter((n) => !isAssignedAnywhere(w, n));
      const m = pickByFewest(mPool, timesThisMonth);
      const f = pickByFewest(fPool, timesThisMonth);
      if (m) { w.toiletM = m; bump(m); }
      if (f) { w.toiletF = f; bump(f); }
    }
  }

  // ---------- 11. HOSPITALITY (fixed Team A / Team B rotation) ----------
  // Sundays only. First Sunday defaults to "none" (hospitality break); the
  // remaining active Sundays alternate A/B, continuing from the previous
  // month's last A/B serving. Weeks set to "none"/"combined" (recess,
  // special Sundays) don't consume rotation. Any week can be manually
  // switched to "none"/"combined" in the grid afterwards.
  // Hospitality allows overlaps, so no availability/clash filtering and no
  // fairness bumping — the full fixed team is always assigned.
  if (!options.worshipOnly) {
    const teamA = rules.hospitalityTeamA || [];
    const teamB = rules.hospitalityTeamB || [];
    const leadsWanted = rules.hospitalityLeadsPerWeek || 3;

    let nextTeam: "A" | "B" = "A";
    let leadOffsetA = 0;
    let leadOffsetB = 0;

    // Continue rotation + lead round-robin from where last month ended.
    if (options.previousRoster) {
      const prevSundays = [...(options.previousRoster.sundays || [])].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      const active = prevSundays.filter(
        (w) => w.hospitalityTeam === "A" || w.hospitalityTeam === "B"
      );
      const last = active[active.length - 1];
      if (last) nextTeam = last.hospitalityTeam === "A" ? "B" : "A";
      // Seed lead offsets: continue after the last serving's first lead so
      // the ^ setup duty rotates through every team member across months.
      for (const t of ["A", "B"] as const) {
        const servings = active.filter((w) => w.hospitalityTeam === t);
        const lastServing = servings[servings.length - 1];
        const members = t === "A" ? teamA : teamB;
        if (!members.length) continue;
        if (lastServing?.hospitalityLeads?.length) {
          const idx = members.findIndex(
            (m) => normalize(m) === normalize(lastServing.hospitalityLeads![0])
          );
          if (idx >= 0) {
            const off = (idx + lastServing.hospitalityLeads!.length) % members.length;
            if (t === "A") leadOffsetA = off;
            else leadOffsetB = off;
            continue;
          }
        }
        if (servings.length) {
          const off = (servings.length * leadsWanted) % members.length;
          if (t === "A") leadOffsetA = off;
          else leadOffsetB = off;
        }
      }
    }

    for (const w of sundays) {
      const weekIdx = weekIndexOfSunday(w.date);
      // First-week break (default; uncheck hospitalityBreakFirstWeek to disable).
      if (rules.hospitalityBreakFirstWeek && weekIdx === 1) {
        w.hospitalityTeam = "none";
        w.hospitality = [];
        w.hospitalityLeads = [];
        continue;
      }
      const team = nextTeam;
      const members = team === "A" ? teamA : teamB;
      w.hospitalityTeam = team;
      w.hospitality = [...members];
      const off = team === "A" ? leadOffsetA : leadOffsetB;
      const leads: string[] = [];
      for (let i = 0; i < leadsWanted && members.length; i++) {
        leads.push(members[(off + i) % members.length]);
      }
      w.hospitalityLeads = leads;
      if (team === "A") leadOffsetA = (leadOffsetA + leads.length) % (members.length || 1);
      else leadOffsetB = (leadOffsetB + leads.length) % (members.length || 1);
      nextTeam = team === "A" ? "B" : "A";
    }
    for (const w of saturdays) {
      w.hospitalityTeam = "none";
      w.hospitality = [];
      w.hospitalityLeads = [];
    }
  }

  // ---------- 12. KITCHEN & CAFE (Sundays where hospitality serves) ----------
  // Cafe is the fixed team of 5 on Team A/B weeks. Kitchen is the lead(s)
  // plus a fairness-rotated crew from the pool, totalling kitchenPerWeek.
  // "combined" gets kitchen only (observed Evangel Day pattern); "none"
  // (break/recess) and Saturdays get neither. Crews may overlap other roles,
  // so no clash filtering — only away-date filtering.
  if (!options.worshipOnly) {
    const cafeTeam = rules.cafeTeam || [];
    const kitchenLeads = rules.kitchenLeads || [];
    const kitchenPool = rules.kitchenPool || [];
    const kitchenWanted = Math.max(rules.kitchenPerWeek || 5, kitchenLeads.length);

    // Fairness baseline: kitchen appearances in the previous month.
    const kitchenCounts = new Map<string, number>();
    if (options.previousRoster) {
      const prevWeeks = [
        ...(options.previousRoster.saturdays || []),
        ...(options.previousRoster.sundays || []),
      ];
      for (const w of prevWeeks) {
        for (const n of w.kitchen || []) {
          const k = normalize(n);
          if (k) kitchenCounts.set(k, (kitchenCounts.get(k) || 0) + 1);
        }
      }
    }
    const bumpKitchen = (n: string) => {
      const k = normalize(n);
      if (k) kitchenCounts.set(k, (kitchenCounts.get(k) || 0) + 1);
    };

    for (const w of sundays) {
      const team = (w.hospitalityTeam || "").trim();
      if (team !== "A" && team !== "B" && team !== "combined") {
        w.kitchen = [];
        w.cafe = [];
        continue;
      }
      // Cafe: fixed team on A/B weeks only.
      w.cafe =
        team === "combined"
          ? []
          : cafeTeam.filter((m) => !isUnavailable(m, w.date, false, rules, lookup));
      // Kitchen: leads first, then fewest-appearances picks from the pool.
      const crew = kitchenLeads.filter((m) => !isUnavailable(m, w.date, false, rules, lookup));
      crew.forEach(bumpKitchen);
      const remaining = kitchenPool.filter(
        (m) =>
          !crew.some((c) => normalize(c) === normalize(m)) &&
          !isUnavailable(m, w.date, false, rules, lookup)
      );
      while (crew.length < kitchenWanted && remaining.length > 0) {
        const pick = pickByFewest(remaining, kitchenCounts);
        if (!pick) break;
        crew.push(pick);
        bumpKitchen(pick);
        remaining.splice(remaining.indexOf(pick), 1);
      }
      w.kitchen = crew;
      if (crew.length < kitchenWanted) {
        unresolved.push({
          date: w.date,
          slot: "kitchen",
          reason: `Only ${crew.length}/${kitchenWanted} kitchen crew available`,
        });
      }
    }
    for (const w of saturdays) {
      w.kitchen = [];
      w.cafe = [];
    }
  }

  return { roster, warnings: [], unresolved };
}

// Pick the candidate with the fewest assignments so far (fairness tiebreak).
// Counts are keyed by normalized name.
function pickByFewest(pool: string[], counts: Map<string, number>): string | undefined {
  if (pool.length === 0) return undefined;
  let best = pool[0];
  let bestCount = counts.get(normalize(best)) || 0;
  for (const n of pool.slice(1)) {
    const c = counts.get(normalize(n)) || 0;
    if (c < bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

// Convenience: returns the order of assignments for documentation/UX.
export const ASSIGNMENT_ORDER = [
  "preaching",
  "worshipLeader",
  "hcConductor",
  "hcSetup",
  "musicians",
  "singers",
  "sound",
  "camera",
  "hcServers",
  "ushers",
  "counting",
  "toilets",
  "hospitality",
  "kitchen",
  "cafe",
];
