import PDFDocument from "pdfkit";
import type { Roster, Rules, WeekAssignments } from "./types";

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

      // ---- Title band ----
      const titleH = 22;
      doc.rect(pageLeft, doc.page.margins.top, usableWidth, titleH).fill("#1f3a5f");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(
          `EVANGEL CHRISTIAN FELLOWSHIP  \u2022  SERVICE ROSTER \u2014 ${monthTitle(roster.month)}`,
          pageLeft,
          doc.page.margins.top + 6,
          { width: usableWidth, align: "center" }
        );
      let y = doc.page.margins.top + titleH;

      // ---- Columns ----
      const cols: Col[] = [
        { key: "date", header: "DATE", weight: 62, align: "center" },
        { key: "singers", header: "SINGERS", weight: 92 },
        { key: "musicians", header: "MUSICIANS", weight: 98 },
        { key: "media", header: "MEDIA", weight: 88 },
        { key: "preaching", header: "PREACHING", weight: 70 },
        { key: "hc", header: "HC & OFFERING", weight: 150 },
        { key: "ushers", header: "USHERS", weight: 82 },
        { key: "counting", header: "COUNTING", weight: 82 },
        { key: "toilets", header: "TOILETS", weight: 66 },
        { key: "hospitality", header: "HOSPITALITY", weight: 110 },
        { key: "kitchen", header: "KITCHEN", weight: 68 },
        { key: "cafe", header: "CAFE", weight: 68 },
      ];
      const totalWeight = cols.reduce((s, c) => s + c.weight, 0);
      const widths = cols.map((c) => (c.weight / totalWeight) * usableWidth);
      const xs: number[] = [];
      let acc = pageLeft;
      for (const w of widths) {
        xs.push(acc);
        acc += w;
      }

      const bodyFont = 7.2;
      const lineH = 9.4;
      const padX = 3;
      const padY = 3.5;

      // ---- Header row ----
      const headerH = 15;
      const drawHeader = () => {
        doc.rect(pageLeft, y, usableWidth, headerH).fillAndStroke("#dbe5f1", "#4a4a4a");
        doc.fillColor("#1f3a5f").font("Helvetica-Bold").fontSize(7.6);
        cols.forEach((c, i) => {
          doc.text(c.header, xs[i] + padX, y + 4.5, { width: widths[i] - padX * 2, align: "center" });
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
        const servers = (w.hcServers || []).map((s, idx) => (idx === 2 ? `*${s}` : s));

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
            lv("HC Servers:", servers.join(", ")),
            lv("HC Setup:", (w.hcSetup || []).join(" / ")),
          ],
          ushers: [L([{ t: (w.ushers || []).join(", ") }])],
          counting: [L([{ t: (w.counting || []).join(", ") }])],
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
        const maxLines = Math.max(...cols.map((c) => (cells[c.key] || []).length));
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
          const lines = cells[c.key] || [];
          lines.forEach((ln, li) => {
            drawLine(ln, xs[i] + padX, y + padY + li * lineH, widths[i] - padX * 2, c.align || "left");
          });
        });
        y += rowH;
      };

      weeks.forEach((w, i) => drawRow(w, i % 2 === 1));

      // ---- Footer ----
      const f = rules.pdfFooter;
      y += 8;
      if (y > doc.page.height - doc.page.margins.bottom - 78) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      // Pack up / Bins task table.
      const taskH = 16;
      doc.strokeColor("#4a4a4a").lineWidth(0.5);
      doc.rect(pageLeft, y, usableWidth, taskH).stroke();
      const midX = pageLeft + usableWidth * 0.62;
      doc.moveTo(midX, y).lineTo(midX, y + taskH).stroke();
      doc.fillColor("#000").fontSize(8);
      doc.font("Helvetica-Bold").text("Pack up (wipe) tables+chairs/Urn+drinks: ", pageLeft + 4, y + 4.5, {
        continued: true,
      });
      doc.font("Helvetica").text(f?.packUp || "");
      doc.font("Helvetica-Bold").text("Bins: ", midX + 4, y + 4.5, { continued: true });
      doc.font("Helvetica").text(f?.bins || "");
      y += taskH + 5;

      // Notes.
      doc.fillColor("#222").fontSize(7);
      const notes = [f?.thirdServerNote, f?.boldNamesNote, f?.pleaseNote].filter(Boolean) as string[];
      notes.forEach((n) => {
        doc.font("Helvetica").text(n, pageLeft, doc.y, { width: usableWidth });
      });
      if (f?.punctualityNote) {
        doc.font("Helvetica-Oblique").fillColor("#444").text(f.punctualityNote, pageLeft, doc.y + 2, {
          width: usableWidth,
        });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
