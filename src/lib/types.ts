// Shared domain types for the ECF Roster app.
import type { ObjectId } from "mongodb";

// _id may come from Mongo as an ObjectId; client-facing code serializes to string.
export type Id = ObjectId | string;

export type Role = "admin" | "worship";

export interface User {
  _id?: Id;
  passwordHash: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

// Public-safe user object (no passwordHash).
export type SafeUser = Omit<User, "passwordHash">;

// Capability keys mirror the Excel reference columns.
export type CapabilityKey =
  | "singer"
  | "piano"
  | "guitar"
  | "bass"
  | "drums"
  | "freeshow"
  | "strings"
  | "sound"
  | "camera"
  | "worshipLeader"
  | "preaching"
  | "hcConductor"
  | "hcServer"
  | "hcSetup"
  | "usher"
  | "counting"
  | "toiletM"
  | "toiletF"
  | "kitchen"
  | "cafe"
  | "vacuum"
  | "hospitality"
  | "bins";

export interface AwayDate {
  from: string; // ISO date (yyyy-mm-dd)
  to?: string; // optional, inclusive
  note?: string;
}

// A person's absence entered when starting a month's roster. Ranges may spill
// into the next month; overlapping entries are carried forward automatically.
export interface MonthAbsence {
  personName: string;
  from: string; // ISO date (yyyy-mm-dd)
  to?: string; // optional, inclusive; omit for a single day
  note?: string;
}

export interface Person {
  _id?: Id;
  name: string;
  active: boolean;
  capabilities: CapabilityKey[];
  awayDates: AwayDate[];
  notes?: string;
}

// All rule knobs live in a single doc for easy editing in the admin UI.
export interface Rules {
  _id?: Id;
  // Worship leader round-robin (in priority order).
  worshipLeaderCycle: string[];
  worshipLeaderSkip: string[]; // keep in list but don't auto-roster (e.g. Adrian)

  // HC conductors, in priority order. Sat-1st has its own list.
  hcConductorPriority: string[];
  hcConductorMax: number; // max times per month for the top-priority conductor
  hcConductorSaturday: string[]; // for 1st-Saturday service
  hcSetupPeople: string[]; // fixed (e.g. Ezekiel/Ammon)

  // HC server pairs (first two servers are always a fixed pair).
  hcServerPairs: [string, string][]; // e.g. ["Chris","Karen"], ["Alvin","Deepi"], ...
  hcServerPairConstraints: Record<string, string>; // person → constraint: "noOtherRole" means only assign if not doing anything else
  hcServerThirdPool: string[]; // Aira / Wanying / Dino
  hcServerDinoConflicts: string[]; // Amy can't be on worship if Dino is 3rd
  // Legacy pool kept for fallback / validation.
  hcServerPool: string[];

  // Preaching rotation (1st..5th Sunday). Multiple options per slot = alternation.
  preachingRotation: { week: number; options: string[] }[];

  // Usher rules.
  usherExperts: string[];
  usherYoung: string[];
  usherMaxPerMonth: number;
  usherBackToBackAllowed: boolean;

  // Counting rules.
  countingSeniors: string[];
  countingJuniors: string[];
  countingConflicts: [string, string][]; // pairs that must never be together (e.g. Karen, Wanying)

  // Saturday-unavailable (1st-Sat service).
  saturdayUnavailable: string[];

  // People who appear on Worship team should generally not also be on Ushers/HC same week.
  worshipTeamHardClashRoles: ("usher" | "hcServer" | "camera" | "counting")[];

  // Priority assignments.
  drumsPriority: string[]; // prefer these people for drums (e.g. Mathias)
  drumsPriorityMax: number; // max times per month for priority drummer (e.g. 3)

  // Exclusions.
  globalSkip: string[]; // people on break — kept in list but never auto-rostered
  hcServerSkip: string[]; // people excluded from HC server duty
  freeshowSkip: string[]; // people excluded from freeshow

  // Counts per week.
  singersPerWeek: number;
  singersMale: string[]; // male singers for gender balance
  singersFemale: string[]; // female singers for gender balance
  hcServersPerWeek: number;
  ushersPerWeek: number;
  countingTeamSize: number;

  // Hospitality: two fixed teams on A/B rotation. First Sunday of the month
  // defaults to a break ("none"); any week can be manually set to "none" or
  // "combined" (special Sundays, e.g. Evangel Day).
  hospitalityTeamA: string[]; // 11 people, head = Molly
  hospitalityTeamB: string[]; // 9 people, head = Rosalind
  hospitalityCombinedHeads: string[]; // e.g. ["Molly","Rosalind","Karen"]
  hospitalityLeadsPerWeek: number; // ^ setup leads per serving (3)
  hospitalityBreakFirstWeek: boolean; // default first Sunday to "none"

  // Kitchen & Cafe (observed JUL–SEP 2026). Cafe is a fixed team of 5 every
  // serving Sunday. Kitchen is the lead(s) + a fairness-rotated crew from the
  // pool, totalling kitchenPerWeek. Served only when hospitality serves
  // (team A/B; "combined" gets kitchen only, "none" gets neither).
  kitchenLeads: string[]; // e.g. ["David"] — on every kitchen week
  kitchenPool: string[]; // rotation pool for the remaining crew
  kitchenPerWeek: number; // total kitchen crew per week (incl. leads)
  cafeTeam: string[]; // fixed 5, e.g. Elizabeth/Aira/Richard/Jarrod/Ammon

  // PDF footer text (editable, shown at the bottom of the printed roster).
  pdfFooter: {
    packUp: string; // e.g. "Ezekiel, Zachary, Ezra, Abegail"
    bins: string; // e.g. "Adam (2, 16, 30 AUG - both)"
    thirdServerNote: string;
    boldNamesNote: string;
    pleaseNote: string;
    punctualityNote: string;
  };
}

export type RosterStatus =
  | "DRAFT"
  | "WORSHIP_FILLED"
  | "SERVICE_FILLED"
  | "APPROVED";

// One week's assignments. Keys are role-slot names.
// Date is the Sunday of that week. Saturday (if present) is keyed by the Sat date.
export interface WeekAssignments {
  date: string; // ISO date of the service day
  day: "saturday" | "sunday";
  preaching?: string;
  worshipLeader?: string;
  singers: string[];
  piano?: string;
  guitar?: string;
  bass?: string;
  drums?: string;
  freeshow?: string;
  strings?: string;
  sound?: string;
  camera?: string;
  hcConductor?: string;
  hcServers: string[];
  hcSetup: string[];
  counting: string[];
  ushers: string[];
  toiletM?: string;
  toiletF?: string;
  // Hospitality: full team list for the week + which team served.
  // hospitalityTeam: "A" | "B" | "combined" | "none" (undefined = not set).
  // hospitalityLeads: subset of hospitality (^ setup leads, usually 3).
  hospitality?: string[];
  hospitalityTeam?: string;
  hospitalityLeads?: string[];
  // Kitchen & Cafe crews (5 each on serving Sundays; see Rules).
  kitchen?: string[];
  cafe?: string[];
}

export interface Warning {
  date: string;
  slot: string;
  message: string;
  severity: "hard" | "soft";
}

export interface AuditEntry {
  at: string; // ISO timestamp
  by: string; // user email
  action: string;
  detail?: string;
}

export interface Roster {
  _id?: Id;
  month: string; // "YYYY-MM"
  status: RosterStatus;
  saturdays: WeekAssignments[];
  sundays: WeekAssignments[];
  warnings: Warning[];
  auditLog: AuditEntry[];
  absences?: MonthAbsence[]; // people away this month; blocks auto-rostering
  createdAt: Date;
  updatedAt: Date;
}

// One-time password-reset token (tokenHash = SHA-256 of the raw token).
export interface PasswordReset {
  _id?: Id;
  email: string; // lower-cased user email
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
}

export interface Settings {
  _id?: Id;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  singer: "Singer",
  piano: "Piano",
  guitar: "Guitar",
  bass: "Bass",
  drums: "Drums",
  freeshow: "Freeshow (F)",
  strings: "Strings",
  sound: "Sound",
  camera: "Camera",
  worshipLeader: "Worship Leader",
  preaching: "Preaching",
  hcConductor: "HC Conductor",
  hcServer: "HC Server",
  hcSetup: "HC Setup",
  usher: "Usher",
  counting: "Counting",
  toiletM: "Toilet (M)",
  toiletF: "Toilet (F)",
  kitchen: "Kitchen",
  cafe: "Café",
  vacuum: "Vacuum",
  hospitality: "Hospitality",
  bins: "Bins",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  worship: "Worship Coordinator",
};
