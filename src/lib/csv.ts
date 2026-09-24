/**
 * RFC 4180 CSV parsing: quoted fields, escaped quotes (""), commas and line
 * breaks inside quotes, CRLF/LF line endings and a leading UTF-8 BOM (as
 * written by Excel). Returns rows of raw string cells.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop blank lines (e.g. a trailing newline or spacing rows).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface CsvRecord {
  /** 1-based line number in the file (header is line 1), for error messages. */
  line: number;
  values: Record<string, string>;
}

/**
 * Parses CSV with a header row into records keyed by normalised header
 * ("Batch Tracked" → "batch_tracked"). Cells are trimmed.
 */
export function parseCsvRecords(text: string): { headers: string[]; records: CsvRecord[] } {
  const [header = [], ...body] = parseCsv(text);
  const headers = header.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const records = body.map((cells, index) => ({
    line: index + 2,
    values: Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])),
  }));
  return { headers, records };
}
