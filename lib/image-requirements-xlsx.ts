import * as XLSX from "xlsx";

function splitRow(line: string): string[] {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = []; let current = ""; let escaped = false;
  for (const char of value) {
    if (char === "|" && !escaped) { cells.push(current); current = ""; escaped = false; continue; }
    if (char === "\\" && !escaped) { escaped = true; current += char; continue; }
    current += char; escaped = false;
  }
  cells.push(current);
  return cells.map(cell => cell.trim().replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n"));
}

export function imageRequirementsXlsxBase64(markdown: string): string {
  const lines = markdown.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const tableLines = lines.filter(line => line.startsWith("|") && line.endsWith("|"));
  const rows: string[][] = [];
  if (tableLines.length >= 2) {
    const header = splitRow(tableLines[0]);
    rows.push(header);
    for (const line of tableLines.slice(1)) {
      const cells = splitRow(line);
      if (cells.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
      if (cells.some(Boolean)) rows.push(header.map((_, index) => cells[index] ?? ""));
    }
  }
  if (rows.length < 2) rows.push(["图片需求表"], [markdown]);
  const urlColumns = rows[0].map((cell, index) => /url|链接/i.test(cell) ? index : -1).filter(index => index >= 0);
  for (const row of rows.slice(1)) for (const index of urlColumns) row[index] = row[index].replace(/^`|`$/g, "");
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = rows[0].map((_, index) => ({ wch: Math.min(48, Math.max(14, ...rows.slice(1).map(row => String(row[index] ?? "").length).slice(0, 50)) + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "设计需求表");
  const bytes = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  let binary = "";
  const data = new Uint8Array(bytes);
  for (let index = 0; index < data.length; index += 0x8000) binary += String.fromCharCode(...data.subarray(index, Math.min(index + 0x8000, data.length)));
  return btoa(binary);
}
