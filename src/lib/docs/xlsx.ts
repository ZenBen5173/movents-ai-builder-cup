import "server-only";
import ExcelJS from "exceljs";
import { budgetTotals, type Bundle } from "./builders";

const BRAND = "FF3E63DD";

function header(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  row.alignment = { vertical: "middle" };
  row.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function budgetXlsx(b: NonNullable<Bundle>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Movents";
  const pct = b.university?.sop.budget_rules.contingency_pct ?? 10;
  const ws = wb.addWorksheet("Budget");
  ws.columns = [
    { header: "Category", key: "category", width: 18 },
    { header: "Item", key: "description", width: 52 },
    { header: "Vendor", key: "vendor", width: 34 },
    { header: "Quote link", key: "link", width: 40 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Unit cost (RM)", key: "unit", width: 14 },
    { header: "Estimated (RM)", key: "est", width: 15 },
    { header: "Actual (RM)", key: "act", width: 13 },
    { header: "Variance (RM)", key: "var", width: 14 },
    { header: "Funding source", key: "fund", width: 20 },
  ];
  header(ws);
  b.lines.forEach((l, i) => {
    const r = i + 2;
    const v = b.vendors.find((x) => x.id === l.vendor_id);
    ws.addRow({
      category: l.category,
      description: l.description,
      vendor: v?.name ?? "",
      link: l.source_url ? { text: l.source_url, hyperlink: l.source_url } : "",
      qty: l.qty,
      unit: l.unit_cost,
      est: { formula: `E${r}*F${r}`, result: l.estimated },
      act: l.actual ?? null,
      var: { formula: `IF(H${r}="","",H${r}-G${r})`, result: l.actual != null ? l.actual - l.estimated : "" },
      fund: l.funding_source,
    });
  });
  const last = b.lines.length + 1;
  const t = budgetTotals(b.lines, pct);
  const sumRow = (label: string, formula: string, result: number, bold = false) => {
    const row = ws.addRow({ description: label, est: { formula, result } });
    if (bold) row.font = { bold: true };
    return row;
  };
  ws.addRow({});
  const s = sumRow("Subtotal", `SUM(G2:G${last})`, t.subtotal, true).number;
  const c = sumRow(`Contingency (${pct}%)`, `ROUND(G${s}*${pct / 100},2)`, t.contingency).number;
  const tot = sumRow("TOTAL incl. contingency", `G${s}+G${c}`, t.total, true);
  tot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF2FE" } };
  const capRow = ws.addRow({ description: "Budget cap", est: b.event.budget_cap });
  ws.addRow({ description: "Within cap?", est: { formula: `IF(G${tot.number}<=G${capRow.number},"YES","NO, OVER")`, result: t.total <= b.event.budget_cap ? "YES" : "NO, OVER" } }).font = { bold: true };
  ws.addRow({ description: "Actual spend", act: { formula: `SUM(H2:H${last})`, result: t.actual } });
  ws.addRow({ description: "Approved budget", est: b.event.approved_budget ?? b.event.budget_cap });
  ws.getColumn("unit").numFmt = "#,##0.00";
  ws.getColumn("est").numFmt = "#,##0.00";
  ws.getColumn("act").numFmt = "#,##0.00";
  ws.getColumn("var").numFmt = "#,##0.00";

  const q = wb.addWorksheet("Supplier quotes");
  q.columns = [
    { header: "Category", key: "category", width: 14 },
    { header: "Supplier", key: "name", width: 44 },
    { header: "Unit price (RM)", key: "price", width: 15 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Rating", key: "rating", width: 8 },
    { header: "Selected", key: "sel", width: 10 },
    { header: "Source", key: "source", width: 11 },
    { header: "Link", key: "url", width: 60 },
    { header: "Evidence", key: "snippet", width: 70 },
  ];
  header(q);
  for (const v of b.vendors) {
    q.addRow({ category: v.category, name: v.name, price: v.unit_price, unit: v.unit, rating: v.rating, sel: v.selected ? "YES" : "", source: v.source, url: v.url ? { text: v.url, hyperlink: v.url } : "", snippet: v.snippet ?? "" });
  }
  q.getColumn("price").numFmt = "#,##0.00";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function budgetCsv(b: NonNullable<Bundle>) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const pct = b.university?.sop.budget_rules.contingency_pct ?? 10;
  const t = budgetTotals(b.lines, pct);
  const rows = [
    ["Category", "Item", "Vendor", "Quote link", "Qty", "Unit cost", "Estimated", "Actual", "Funding source"],
    ...b.lines.map((l) => [l.category, l.description, b.vendors.find((v) => v.id === l.vendor_id)?.name ?? "", l.source_url ?? "", l.qty, l.unit_cost, l.estimated, l.actual ?? "", l.funding_source]),
    [],
    ["", "Subtotal", "", "", "", "", t.subtotal],
    ["", `Contingency ${pct}%`, "", "", "", "", t.contingency],
    ["", "Total", "", "", "", "", t.total],
    ["", "Cap", "", "", "", "", b.event.budget_cap],
  ];
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function riskXlsx(b: NonNullable<Bundle>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Risk register");
  ws.columns = [
    { header: "#", key: "n", width: 5 },
    { header: "Category", key: "category", width: 16 },
    { header: "Risk", key: "description", width: 50 },
    { header: "Likelihood (1-5)", key: "l", width: 15 },
    { header: "Impact (1-5)", key: "i", width: 12 },
    { header: "Score", key: "score", width: 8 },
    { header: "Mitigation", key: "mitigation", width: 60 },
    { header: "Contingency", key: "contingency", width: 50 },
    { header: "Owner", key: "owner", width: 22 },
  ];
  header(ws);
  b.risks.forEach((r, idx) => {
    const row = ws.addRow({ n: idx + 1, category: r.category, description: r.description, l: r.likelihood, i: r.impact, score: { formula: `D${idx + 2}*E${idx + 2}`, result: r.likelihood * r.impact }, mitigation: r.mitigation, contingency: r.contingency, owner: b.users.find((u) => u.id === r.owner_id)?.name ?? "" });
    const score = r.likelihood * r.impact;
    row.getCell("score").fill = { type: "pattern", pattern: "solid", fgColor: { argb: score >= 12 ? "FFFFCDCE" : score >= 6 ? "FFFFEE9C" : "FFDAF1DB" } };
    row.alignment = { wrapText: true, vertical: "top" };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
