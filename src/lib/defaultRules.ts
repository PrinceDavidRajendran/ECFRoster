import type { Rules } from "./types";

// Default rules captured from the Word doc and the user's clarifications.
export const DEFAULT_RULES: Rules = {
  // Worship leader round-robin order.
  worshipLeaderCycle: ["Ps Ludwig", "Deepi", "Grace", "Lee", "Amy"],
  // Kept in the list but skipped during auto-rostering for now.
  worshipLeaderSkip: ["Adrian"],

  // HC conductors — Alvin is preferred; Chris/Donald alternate when available;
  // conductor cannot be on if they are preaching that service.
  hcConductorPriority: ["Alvin", "Chris", "Donald", "Dino"],
  hcConductorMax: 2, // top-priority conductor (Alvin) max 2 times per month
  hcConductorSaturday: ["Hock"], // Uncle Hock only does 1st Saturday.
  hcSetupPeople: ["Ezekiel", "Ammon"],

  // HC server pairs — first two servers are always a fixed pair.
  hcServerPairs: [
    ["Chris", "Karen"],
    ["Alvin", "Deepi"],
    ["Donald", "Puay Choo"],
    ["Lee", "Sally"],
  ],
  // Constraints: "noOtherRole" = only assign if not doing anything else that week.
  hcServerPairConstraints: { "Lee": "noOtherRole", "Deepi": "noOtherRole" },

  // Legacy pool for fallback / validation.
  hcServerPool: [
    "Chris",
    "Donald",
    "Karen",
    "Lee",
    "Sally",
    "Alvin",
    "Anne",
    "Francisca",
    "Hock",
    "Puay Choo",
    "Molly",
    "Deepi",
    "Rosalind",
    "Caroline",
    "Jullianne",
  ],
  // 3rd HC server comes from these people.
  hcServerThirdPool: ["Aira", "Wanying", "Dino"],
  // If Dino is the 3rd HC server, these people can't be on Worship that week.
  hcServerDinoConflicts: ["Amy"],

  // Preaching rotation per Sunday of the month.
  // wk1: Ludwig; wk2: Chris/Donald alternate; wk3: Ludwig; wk4: Donald; wk5: Grace.
  preachingRotation: [
    { week: 1, options: ["Ps Ludwig"] },
    { week: 2, options: ["Chris", "Donald"] },
    { week: 3, options: ["Ps Ludwig"] },
    { week: 4, options: ["Donald"] },
    { week: 5, options: ["Grace"] },
  ],

  // Ushers.
  usherExperts: ["Sally", "Anne", "Puay Choo", "Katherine", "Karen"],
  usherYoung: [
    "Jullianne",
    "Aira",
    "Alif",
    "Ammon",
    "Pax",
    "Richard",
    "Jarrod",
  ],
  usherMaxPerMonth: 2,
  usherBackToBackAllowed: false,

  // Counting.
  countingSeniors: ["Karen", "Hock", "Puay Choo", "Alvin"],
  countingJuniors: ["Katrina", "Francisca", "Wanying"],
  countingConflicts: [["Karen", "Wanying"]],

  // Not available on Saturday (1st-Sat service).
  saturdayUnavailable: [
    "Aira",
    "Jarrod",
    "Ammon",
    "Alif",
    "Molly",
    "Francisca",
  ],

  // Hard clashes with worship team in the same week.
  worshipTeamHardClashRoles: ["usher", "hcServer", "camera"],

  // Priority assignments.
  drumsPriority: ["Mathias"], // prefer for drums; only put on freeshow if no other role
  drumsPriorityMax: 3, // Mathias plays drums max 3 times per month

  // Exclusions.
  globalSkip: ["Adrian"], // on break — don't roster anywhere
  hcServerSkip: [], // people excluded from HC server duty entirely
  freeshowSkip: ["Dino"], // don't roster on freeshow

  // Counts.
  singersPerWeek: 2,
  singersMale: ["Lee", "Izaac", "Hock", "Pax"],
  singersFemale: ["Deepi", "Grace", "Jullianne", "Elizabeth", "Amy", "Suzanna"],
  hcServersPerWeek: 3,
  ushersPerWeek: 2,
  countingTeamSize: 2,

  // Hospitality: fixed teams on A/B rotation (observed JUL–SEP 2026).
  hospitalityTeamA: [
    "Molly", "Katrina", "Peter", "Deepi", "Katherine", "Aira",
    "Elizabeth", "Puay Choo", "Caroline", "Grace", "Suzanna",
  ],
  hospitalityTeamB: [
    "Rosalind", "Amy", "Jullianne", "Sally", "Wanying",
    "Karen", "Anne", "Ida", "Francisca",
  ],
  hospitalityCombinedHeads: ["Molly", "Rosalind", "Karen"],
  hospitalityLeadsPerWeek: 3,
  hospitalityBreakFirstWeek: true,

  // PDF footer text (editable).
  pdfFooter: {
    packUp: "Ezekiel, Zachary, Ezra, Abegail",
    bins: "Adam",
    thirdServerNote: "*Third HC server stationed at the back",
    boldNamesNote:
      "^ Names in bold to ensure setup completed, help with food preparation and help pack away main serving dishes/platters.",
    pleaseNote:
      "Please Note: If unable to fulfill your responsibility, please find a replacement and inform Dino, Worship Team please inform Deepi. Thank You.",
    punctualityNote:
      "PUNCTUALITY is being Present, Prepared, and Alert for Appointed times and seasons. Failing to be punctual hinders God's purposes in our lives and offends those who are then forced to wait for us......   (The Power For True Success)",
  },
};
