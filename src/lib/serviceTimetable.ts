// Sunday service timetable printed at the bottom of the roster,
// replicated from the original Excel rosters (static reference info).

export interface TimetableRow {
  time: string;
  item: string;
}

export const SERVICE_TIMETABLE_LEFT: TimetableRow[] = [
  { time: "9.00am", item: "Worship team practice & sound check" },
  { time: "9.30am", item: "Pre-prayer" },
  { time: "9.30am", item: "Ushers in position" },
  { time: "10.00am", item: "Service starts with announcements" },
];

export const SERVICE_TIMETABLE_RIGHT: TimetableRow[] = [
  { time: "10.15am", item: "Ushers come in" },
  { time: "1.00pm", item: "Café team starts" },
  { time: "1.30pm", item: "Kitchen team starts. Start packing 2nd hall" },
  { time: "2.00pm", item: "Vacate 2nd hall" },
];
