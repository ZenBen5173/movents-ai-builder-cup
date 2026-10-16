import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export type Block =
  | { type: "p"; text: string; bold?: boolean; muted?: boolean }
  | { type: "bullets"; items: string[] }
  | { type: "table"; head: string[]; rows: (string | number)[][]; widths?: number[]; totalRow?: boolean }
  | { type: "kv"; rows: [string, string][] };

export type DocModel = {
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  sections: { key?: string; title: string; blocks: Block[] }[];
  footer?: string;
};

// ------------------------------------------------------------------ DOCX

export async function renderDocx(doc: DocModel): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title, bold: true, size: 40, color: "1F2D5C" })] }));
  if (doc.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, color: "60646C", size: 22 })], spacing: { after: 200 } }));
  if (doc.meta?.length) children.push(kvTable(doc.meta));
  doc.sections.forEach((s, i) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 }, children: [new TextRun({ text: `${i + 1}. ${s.title}`, bold: true, color: "3A5BC7", size: 28 })] }));
    for (const b of s.blocks) {
      if (b.type === "p") children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: b.text, bold: b.bold, color: b.muted ? "60646C" : undefined, size: 21 })] }));
      if (b.type === "bullets") for (const it of b.items) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: it, size: 21 })] }));
      if (b.type === "kv") children.push(kvTable(b.rows));
      if (b.type === "table") children.push(dataTable(b.head, b.rows, b.totalRow));
    }
  });
  if (doc.footer) children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: doc.footer, italics: true, color: "80838D", size: 18 })] }));
  const d = new Document({ creator: "Movents", title: doc.title, sections: [{ properties: {}, children }] });
  return Packer.toBuffer(d);
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9E0" };
const borders = { top: border, bottom: border, left: border, right: border };

function kvTable(rows: [string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({ borders, width: { size: 30, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F0F0F3" }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20 })] })] }),
            new TableCell({ borders, width: { size: 70, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: v, size: 20 })] })] }),
          ],
        }),
    ),
  });
}

function dataTable(head: string[], rows: (string | number)[][], totalRow?: boolean) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((h) => new TableCell({ borders, shading: { type: ShadingType.CLEAR, color: "auto", fill: "3E63DD" }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })] })] })),
      }),
      ...rows.map(
        (r, i) =>
          new TableRow({
            children: r.map(
              (c) =>
                new TableCell({
                  borders,
                  shading: totalRow && i === rows.length - 1 ? { type: ShadingType.CLEAR, color: "auto", fill: "EDF2FE" } : undefined,
                  children: [new Paragraph({ alignment: typeof c === "number" ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: String(c), size: 18, bold: totalRow && i === rows.length - 1 })] })],
                }),
            ),
          }),
      ),
    ],
  });
}

// ------------------------------------------------------------------ PDF

const MAP: Record<string, string> = { "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "✓": "OK", "✗": "X", "×": "x", "·": "-", " ": " " };

/** Helvetica only speaks WinAnsi — map or drop anything else. */
function clean(s: string) {
  return [...s]
    .map((c) => {
      if (MAP[c] !== undefined) return MAP[c];
      const code = c.codePointAt(0)!;
      if (code < 0x100 || "—–•…‘’“”€".includes(c)) return c;
      return "";
    })
    .join("");
}

export async function renderPdf(doc: DocModel): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(doc.title));
  pdf.setCreator("Movents");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const ink = rgb(0.11, 0.13, 0.14);
  const muted = rgb(0.38, 0.39, 0.42);
  const brand = rgb(0.24, 0.39, 0.87);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const words = clean(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  const text = (t: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = o.size ?? 10;
    const f = o.f ?? font;
    const x = M + (o.indent ?? 0);
    for (const ln of wrap(t, f, size, W - M - x)) {
      ensure(size + 4);
      page.drawText(ln, { x, y: y - size, size, font: f, color: o.color ?? ink });
      y -= size + 4;
    }
    y -= o.gap ?? 4;
  };
  const table = (head: string[], rows: (string | number)[][], totalRow?: boolean, widths?: number[]) => {
    const total = W - 2 * M;
    const ws = widths ?? head.map(() => 1);
    const sum = ws.reduce((a, b) => a + b, 0);
    const cols = ws.map((w) => (w / sum) * total);
    const size = 8;
    const drawRow = (cells: (string | number)[], isHead: boolean, shade: boolean) => {
      const wrapped = cells.map((c, i) => wrap(String(c), isHead ? bold : font, size, cols[i] - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * (size + 3) + 8;
      ensure(h);
      let x = M;
      if (isHead || shade) page.drawRectangle({ x: M, y: y - h, width: total, height: h, color: isHead ? brand : rgb(0.93, 0.95, 1) });
      wrapped.forEach((lines, i) => {
        lines.forEach((ln, j) => {
          const isNum = typeof cells[i] === "number";
          const f = isHead || (shade && totalRow) ? bold : font;
          const tw = f.widthOfTextAtSize(ln, size);
          page.drawText(ln, { x: isNum ? x + cols[i] - 4 - tw : x + 4, y: y - 4 - size - j * (size + 3), size, font: f, color: isHead ? rgb(1, 1, 1) : ink });
        });
        x += cols[i];
      });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + total, y: y - h }, thickness: 0.5, color: rgb(0.85, 0.85, 0.88) });
      y -= h;
    };
    drawRow(head, true, false);
    rows.forEach((r, i) => drawRow(r, false, Boolean(totalRow && i === rows.length - 1)));
    y -= 8;
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: brand });
  text(doc.title, { size: 20, f: bold, color: rgb(0.12, 0.18, 0.36), gap: 2 });
  if (doc.subtitle) text(doc.subtitle, { size: 10, color: muted, gap: 10 });
  if (doc.meta?.length) table(["Field", "Detail"], doc.meta, false, [1, 2.4]);
  doc.sections.forEach((s, i) => {
    ensure(40);
    y -= 6;
    text(`${i + 1}. ${s.title}`, { size: 13, f: bold, color: brand, gap: 4 });
    for (const b of s.blocks) {
      if (b.type === "p") text(b.text, { f: b.bold ? bold : font, color: b.muted ? muted : ink });
      if (b.type === "bullets") for (const it of b.items) text(`•  ${it}`, { indent: 8, gap: 1 });
      if (b.type === "kv") table(["Item", "Detail"], b.rows, false, [1, 2.4]);
      if (b.type === "table") table(b.head, b.rows, b.totalRow, b.widths);
    }
  });
  if (doc.footer) text(doc.footer, { size: 8, color: muted });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(clean(`${doc.title}  ·  page ${i + 1} of ${pages.length}  ·  generated by Movents`), { x: M, y: 24, size: 7, font, color: muted });
  });
  return Buffer.from(await pdf.save());
}
