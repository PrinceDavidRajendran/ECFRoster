import PDFDocument from "pdfkit";
import type { Roster, Rules, WeekAssignments } from "./types";
import {
  SERVICE_TIMETABLE_LEFT,
  SERVICE_TIMETABLE_RIGHT,
  type TimetableRow,
} from "./serviceTimetable";

// Generates the ECF Service Roster as a PDF (A4 landscape) and returns a Buffer.
// Styled to closely match the original printed roster: bold role labels, bold
// column headers, bold dates, the "*" third-HC-server marker, zebra rows, and
// the editable footer notes.

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  const mon = d.toLocaleString("en-AU", { month: "short" });
  return `${day}-${mon}`;
}

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleString("en-AU", { weekday: "long" });
}

function monthTitle(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleString("en-AU", { month: "long", year: "numeric" })
    .toUpperCase();
}

// A cell is a list of lines; each line is a list of styled segments.
type Seg = { t: string; b?: boolean }; // b = bold
type Line = Seg[];

interface Col {
  key: string;
  header: string;
  weight: number;
  align?: "left" | "center";
}

export function generateRosterPdf(roster: Roster, rules: Rules): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 22 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;
      const usableWidth = pageRight - pageLeft;

      // ---- Title band ---- (drawn after auto-fit below; fonts scale to fit)
      let y = doc.page.margins.top;

      // ---- Columns ----
      // Hospitality is widened: Team A/B names render as a 3-column sub-grid
      // (like the original Excel rosters) so rows stay short and the whole
      // month fits on one landscape page.
      const cols: Col[] = [
        { key: "date", header: "DATE", weight: 56, align: "center" },
        { key: "singers", header: "SINGERS", weight: 84 },
        { key: "musicians", header: "MUSICIANS", weight: 90 },
        { key: "media", header: "MEDIA", weight: 80 },
        { key: "preaching", header: "PREACHING", weight: 70 },
        { key: "hc", header: "HC & OFFERING", weight: 126 },
        { key: "ushers", header: "USHERS", weight: 76 },
        { key: "counting", header: "COUNTING", weight: 76 },
        { key: "toilets", header: "TOILETS", weight: 64 },
        { key: "hospitality", header: "HOSPITALITY", weight: 186 },
        { key: "kitchen", header: "KITCHEN", weight: 62 },
        { key: "cafe", header: "CAFE", weight: 62 },
      ];
      const totalWeight = cols.reduce((s, c) => s + c.weight, 0);
      const widths = cols.map((c) => (c.weight / totalWeight) * usableWidth);
      const xs: number[] = [];
      let acc = pageLeft;
      for (const w of widths) {
        xs.push(acc);
        acc += w;
      }

      const padX = 3;
      const hcInnerW = widths[cols.findIndex((c) => c.key === "hc")] - padX * 2;

      // Measure a string at any size (for fit estimation + wrapping).
      const measureAt = (t: string, bold: boolean, size: number): number => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
        return doc.widthOfString(t);
      };

      // Greedy-wrap "Prefix: name, name, …" so no line exceeds maxW.
      // Returns the lines as plain strings (first keeps the prefix).
      const wrapJoinAt = (
        prefix: string,
        names: string[],
        sep: string,
        maxW: number,
        size: number
      ): string[] => {
        const lines: string[] = [];
        let cur = prefix;
        for (const n of names) {
          const cand = cur === prefix ? cur + n : cur + sep + n;
          if (measureAt(cand, false, size) <= maxW) {
            cur = cand;
          } else {
            lines.push(cur);
            cur = n;
          }
        }
        lines.push(cur);
        return lines;
      };

      const weeksForFit = [...(roster.saturdays || []), ...(roster.sundays || [])].sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      // Line counts per column for height estimation (mirrors buildCells below).
      const hospLinesFor = (w: WeekAssignments): number => {
        const team = (w.hospitalityTeam || "").trim();
        const n = (w.hospitality || []).length;
        if (team === "none" || (!team && n === 0) || n === 0) return 1;
        return 1 + Math.ceil(n / 3);
      };
      const rowLinesFor = (w: WeekAssignments, size: number): number => {
        const servers = (w.hcServers || []).map((s, idx) => (idx === 2 ? `*${s}` : s));
        const serverLines = wrapJoinAt("HC Servers: ", servers, ", ", hcInnerW, size).length;
        return Math.max(
          2, // date
          (w.worshipLeader ? 1 : 0) + (w.singers || []).length,
          5, // musicians P/G/B/D/F
          2, // media S/Cam
          1, // preaching
          1 + serverLines + 2, // conductor + servers + setup label + setup
          (w.ushers || []).length,
          (w.counting || []).length,
          2, // toilets M/F
          hospLinesFor(w),
          (w.kitchen || []).length,
          (w.cafe || []).length
        );
      };
      const noteLines = (t: string | undefined, size: number): number => {
        if (!t) return 0;
        return Math.max(1, Math.ceil(measureAt(t, false, size) / usableWidth));
      };

      // Total height at scale s (s = 1 is full size). Everything — title,
      // rows, footer, timetable — scales uniformly.
      const totalHeightFor = (s: number): number => {
        const lh = 10.3 * s;
        const py = 3.5 * s;
        const ff = 7.5 * s;
        const footLH = ff * 1.35;
        let h = 22 * s + 15 * s; // title + header
        for (const w of weeksForFit) h += rowLinesFor(w, 8.0 * s) * lh + py * 2;
        h += 8 * s; // gap before footer
        h += 16 * s + 5 * s; // pack-up task table
        const f0 = rules.pdfFooter;
        h += noteLines(f0?.thirdServerNote, ff) * footLH;
        h += noteLines(f0?.boldNamesNote, ff) * footLH;
        h += noteLines(f0?.pleaseNote, ff) * footLH;
        h += 2 * s + noteLines(f0?.punctualityNote, ff) * footLH;
        h +=
          6 * s +
          11 * s +
          Math.max(SERVICE_TIMETABLE_LEFT.length, SERVICE_TIMETABLE_RIGHT.length) * 10.5 * s;
        return h;
      };

      // Auto-fit: shrink uniformly until everything fits on one page.
      const availableH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
      let fit = 1;
      while (fit > 0.5 && totalHeightFor(fit) > availableH) fit -= 0.025;
      fit = Math.max(0.5, fit);

      // ---- Scaled metrics ----
      const bodyFont = 8.0 * fit;
      const lineH = 10.3 * fit;
      const padY = 3.5 * fit;
      const headerH = 15 * fit;
      const titleH = 22 * fit;
      const footFont = 7.5 * fit;
      const taskH = 16 * fit;
      const ttFont = 7 * fit;
      const ttHeaderH = 11 * fit;
      const ttRowH = 10.5 * fit;

      // Body-size wrappers (buildCells below keeps its existing calls).
      const measure = (t: string, bold = false): number => measureAt(t, bold, bodyFont);
      const wrapJoin = (prefix: string, names: string[], sep: string, maxW: number): string[] =>
        wrapJoinAt(prefix, names, sep, maxW, bodyFont);

      // ---- Title band ----
      doc.rect(pageLeft, doc.page.margins.top, usableWidth, titleH).fill("#1f3a5f");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(13 * fit)
        .text(
          `EVANGEL CHRISTIAN FELLOWSHIP  \u2022  SERVICE ROSTER \u2014 ${monthTitle(roster.month)}`,
          pageLeft,
          doc.page.margins.top + 6 * fit,
          { width: usableWidth, align: "center" }
        );
      y = doc.page.margins.top + titleH;

      // ---- Header row ----
      const drawHeader = () => {
        doc.rect(pageLeft, y, usableWidth, headerH).fillAndStroke("#dbe5f1", "#4a4a4a");
        doc.fillColor("#1f3a5f").font("Helvetica-Bold").fontSize(7.8 * fit);
        cols.forEach((c, i) => {
          doc.text(c.header, xs[i] + padX, y + 4.5 * fit, { width: widths[i] - padX * 2, align: "center" });
        });
        doc.strokeColor("#4a4a4a").lineWidth(0.5);
        xs.forEach((x) => { if (x > pageLeft) { doc.moveTo(x, y).lineTo(x, y + headerH).stroke(); } });
        y += headerH;
      };
      drawHeader();

      // Build styled cell content for a week.
      const buildCells = (w: WeekAssignments): Record<string, Line[]> => {
        const L = (segs: Seg[]): Line => segs;
        const lv = (label: string, val: string): Line => [{ t: label + " ", b: true }, { t: val }];

        const singers: Line[] = [];
        if (w.worshipLeader) singers.push(L([{ t: w.worshipLeader, b: true }, { t: "  (WL)" }]));
        (w.singers || []).forEach((s) => singers.push(L([{ t: s }])));

        // HC servers: mark the 3rd one with "*" (stationed at the back).
        // Wrapped greedily so lines never overflow into the next column.
        const servers = (w.hcServers || []).map((s, idx) => (idx === 2 ? `*${s}` : s));
        const serverLines = wrapJoin("HC Servers: ", servers, ", ", hcInnerW).map(
          (ln, i): Line =>
            i === 0
              ? [{ t: "HC Servers: ", b: true }, { t: ln.slice("HC Servers: ".length) }]
              : [{ t: ln }]
        );

        // Hospitality: Team A/B header + names (^ = setup leads); BREAK for none.
        const hospitality: Line[] = [];
        {
          const team = (w.hospitalityTeam || "").trim();
          const hosp = w.hospitality || [];
          const leadSet = new Set((w.hospitalityLeads || []).map((s) => s.toLowerCase()));
          const withCaret = (s: string) => (leadSet.has(s.toLowerCase()) ? `${s}^` : s);
          if (team === "none" || (!team && hosp.length === 0)) {
            hospitality.push(L([{ t: "HOSPITALITY BREAK" }]));
          } else if (team === "combined") {
            hospitality.push(L([{ t: "Combined hospitality team", b: true }]));
            hosp.forEach((s) => hospitality.push(L([{ t: withCaret(s), b: leadSet.has(s.toLowerCase()) }])));
          } else if (team === "A" || team === "B") {
            hospitality.push(L([{ t: `Team ${team}`, b: true }]));
            hosp.forEach((s) => hospitality.push(L([{ t: withCaret(s), b: leadSet.has(s.toLowerCase()) }])));
          } else if (hosp.length > 0) {
            hosp.forEach((s) => hospitality.push(L([{ t: withCaret(s), b: leadSet.has(s.toLowerCase()) }])));
          }
        }

        return {
          date: [L([{ t: fmtDate(w.date), b: true }]), L([{ t: fmtDay(w.date) }])],
          singers,
          musicians: [
            lv("P:", w.piano || ""),
            lv("G:", w.guitar || ""),
            lv("B:", w.bass || ""),
            lv("D:", w.drums || ""),
            lv("F:", w.freeshow || ""),
          ],
          media: [lv("S:", w.sound || ""), lv("Cam:", w.camera || "")],
          preaching: [L([{ t: w.preaching || "", b: true }])],
          hc: [
            lv("Conductor:", w.hcConductor || ""),
            ...serverLines,
            L([{ t: "HC Setup:", b: true }]),
            L([{ t: (w.hcSetup || []).join(" / ") }]),
          ],
          // One name per line (like kitchen/cafe) so long pairs never
          // overflow into the next column.
          ushers: (w.ushers || []).map((s) => L([{ t: s }])),
          counting: (w.counting || []).map((s) => L([{ t: s }])),
          toilets: [lv("M:", w.toiletM || ""), lv("F:", w.toiletF || "")],
          hospitality,
          kitchen: (w.kitchen || []).map((s) => L([{ t: s }])),
          cafe: (w.cafe || []).map((s) => L([{ t: s }])),
        };
      };

      // Render one styled line (segments) within a cell.
      const drawLine = (segs: Line, x: number, yy: number, width: number, align: "left" | "center") => {
        if (align === "center" && segs.length === 1) {
          doc.font(segs[0].b ? "Helvetica-Bold" : "Helvetica").fontSize(bodyFont).fillColor("#000");
          doc.text(segs[0].t, x, yy, { width, align: "center", lineBreak: false });
          return;
        }
        let cx = x;
        for (const s of segs) {
          doc.font(s.b ? "Helvetica-Bold" : "Helvetica").fontSize(bodyFont).fillColor("#000");
          doc.text(s.t, cx, yy, { width: x + width - cx, align: "left", lineBreak: false });
          cx += doc.widthOfString(s.t);
        }
      };

      const weeks = [...(roster.saturdays || []), ...(roster.sundays || [])].sort(
        (a, b) => a.date.localeCompare(b.date)
      );

      const drawRow = (w: WeekAssignments, zebra: boolean) => {
        const cells = buildCells(w);
        // Hospitality renders as a 3-column sub-grid (title row + names),
        // so its height is 1 + ceil(names/3) lines instead of one line per name.
        const hospLines = cells.hospitality || [];
        const hospH = hospLines.length <= 1 ? hospLines.length : 1 + Math.ceil((hospLines.length - 1) / 3);
        const maxLines = Math.max(
          ...cols.map((c) => (c.key === "hospitality" ? hospH : (cells[c.key] || []).length))
        );
        const rowH = maxLines * lineH + padY * 2;

        if (y + rowH > doc.page.height - doc.page.margins.bottom - 76) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeader();
        }

        if (zebra) doc.rect(pageLeft, y, usableWidth, rowH).fill("#f4f7fb");

        doc.strokeColor("#9aa5b1").lineWidth(0.5);
        cols.forEach((c, i) => doc.rect(xs[i], y, widths[i], rowH).stroke());

        cols.forEach((c, i) => {
          if (c.key === "hospitality") {
            drawHospitality(cells.hospitality || [], xs[i] + padX, y + padY, widths[i] - padX * 2);
            return;
          }
          const lines = cells[c.key] || [];
          lines.forEach((ln, li) => {
            drawLine(ln, xs[i] + padX, y + padY + li * lineH, widths[i] - padX * 2, c.align || "left");
          });
        });
        y += rowH;
      };

      // Hospitality sub-grid: centred title on line 0, then names flowed
      // row-wise across 3 columns (matching the Excel Team A/B layout).
      const drawHospitality = (lines: Line[], x: number, yy: number, width: number) => {
        if (lines.length === 0) return;
        drawLine(lines[0], x, yy, width, "center");
        const names = lines.slice(1);
        if (names.length === 0) return;
        const colW = width / 3;
        names.forEach((ln, idx) => {
          const r = Math.floor(idx / 3);
          const col = idx % 3;
          drawLine(ln, x + col * colW, yy + (r + 1) * lineH, colW, "left");
        });
      };

      weeks.forEach((w, i) => drawRow(w, i % 2 === 1));

      // ---- Footer ----
      const f = rules.pdfFooter;
      y += 8 * fit;
      if (y > doc.page.height - doc.page.margins.bottom - 78) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      // Pack up / Bins task table.
      doc.strokeColor("#4a4a4a").lineWidth(0.5);
      doc.rect(pageLeft, y, usableWidth, taskH).stroke();
      const midX = pageLeft + usableWidth * 0.62;
      doc.moveTo(midX, y).lineTo(midX, y + taskH).stroke();
      doc.fillColor("#000").fontSize(8 * fit);
      doc.font("Helvetica-Bold").text("Pack up (wipe) tables+chairs/Urn+drinks: ", pageLeft + 4, y + 4.5 * fit, {
        continued: true,
      });
      doc.font("Helvetica").text(f?.packUp || "");
      doc.font("Helvetica-Bold").text("Bins: ", midX + 4, y + 4.5 * fit, { continued: true });
      doc.font("Helvetica").text(f?.bins || "");
      y += taskH + 5 * fit;

      // Notes — styled like the original printed roster:
      // - "*" and "^" lines in italic;
      // - "Please Note:" label in bold + underline, rest regular;
      // - PUNCTUALITY line centred with a bold first word.
      doc.fillColor("#222").fontSize(footFont);
      if (f?.thirdServerNote) {
        doc.font("Helvetica-Oblique").text(f.thirdServerNote, pageLeft, doc.y, { width: usableWidth });
      }
      if (f?.boldNamesNote) {
        doc.font("Helvetica-Oblique").text(f.boldNamesNote, pageLeft, doc.y, { width: usableWidth });
      }
      if (f?.pleaseNote) {
        const m = /^(Please Note:\s*)([\s\S]*)$/.exec(f.pleaseNote);
        if (m) {
          doc.font("Helvetica-Bold").text(m[1], pageLeft, doc.y, {
            width: usableWidth,
            underline: true,
            continued: true,
          });
          doc.font("Helvetica").text(m[2]);
        } else {
          doc.font("Helvetica").text(f.pleaseNote, pageLeft, doc.y, { width: usableWidth });
        }
      }
      if (f?.punctualityNote) {
        const note = f.punctualityNote;
        const y0 = doc.y + 2 * fit;
        doc.font("Helvetica").fontSize(footFont).fillColor("#222").text(note, pageLeft, y0, {
          width: usableWidth,
          align: "center",
        });
        // Overdraw the first word ("PUNCTUALITY") in bold at the centred
        // line start. Only when it fits on one line (no wrap).
        const first = /^(\S+)/.exec(note)?.[1];
        if (first) {
          doc.font("Helvetica").fontSize(footFont);
          const totalW = doc.widthOfString(note);
          if (totalW <= usableWidth) {
            const sx = pageLeft + (usableWidth - totalW) / 2;
            doc.font("Helvetica-Bold").text(first, sx, y0, { lineBreak: false });
          }
        }
      }

      // ---- Sunday service timetable (two tables, like the original) ----
      {
        const rows = Math.max(SERVICE_TIMETABLE_LEFT.length, SERVICE_TIMETABLE_RIGHT.length);
        const tableH = ttHeaderH + rows * ttRowH;
        y = doc.y + 6 * fit;
        if (y + tableH > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        const drawTimetable = (list: TimetableRow[], tx: number, tw: number) => {
          const timeW = tw * 0.28;
          const itemW = tw - timeW;
          const row = (ry: number, rh: number, time: string, item: string, header: boolean) => {
            doc.strokeColor("#4a4a4a").lineWidth(0.5);
            doc.rect(tx, ry, timeW, rh).stroke();
            doc.rect(tx + timeW, ry, itemW, rh).stroke();
            doc.fillColor("#000").font(header ? "Helvetica-Bold" : "Helvetica").fontSize(ttFont);
            doc.text(time, tx + 2, ry + 2.5 * fit, { width: timeW - 4, align: "center", lineBreak: false });
            doc.text(item, tx + timeW + 3, ry + 2.5 * fit, { width: itemW - 6, align: "left", lineBreak: false });
          };
          row(y, ttHeaderH, "Time", "Sunday Service", true);
          list.forEach((r, i) => row(y + ttHeaderH + i * ttRowH, ttRowH, r.time, r.item, false));
        };
        const sideMargin = usableWidth * 0.07;
        const centerGap = usableWidth * 0.03;
        const tableW = (usableWidth - sideMargin * 2 - centerGap) / 2;
        drawTimetable(SERVICE_TIMETABLE_LEFT, pageLeft + sideMargin, tableW);
        drawTimetable(SERVICE_TIMETABLE_RIGHT, pageLeft + sideMargin + tableW + centerGap, tableW);
        y += tableH;
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
