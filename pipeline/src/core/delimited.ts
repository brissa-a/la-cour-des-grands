export function parseDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let rowStarted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      rowStarted = true;
    } else if (c === separator) {
      row.push(field);
      field = "";
      rowStarted = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      rowStarted = false;
    } else {
      field += c;
      rowStarted = true;
    }
  }
  if (quoted) throw new Error("Unterminated quoted field");
  if (rowStarted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseDelimitedLine(line: string, separator: string): string[] {
  const rows = parseDelimited(line, separator);
  if (rows.length !== 1) throw new Error(`Expected one record, got ${rows.length}: ${line.slice(0, 120)}`);
  return rows[0]!;
}

export function columnIndexes<const C extends string>(header: readonly string[], columns: readonly C[]): Record<C, number> {
  const indexes = {} as Record<C, number>;
  for (const column of columns) {
    const index = header.indexOf(column);
    if (index === -1) throw new Error(`Missing column ${column} in header: ${header.join(", ")}`);
    indexes[column] = index;
  }
  return indexes;
}

export function readTable<const C extends string>(text: string, separator: string, columns: readonly C[]): Record<C, string>[] {
  const [header, ...rows] = parseDelimited(text.replace(/^﻿/, ""), separator);
  if (header === undefined) throw new Error("Empty table");
  const indexes = columnIndexes(header, columns);
  return rows.map((row, i) => {
    if (row.length !== header.length) {
      throw new Error(`Row ${i + 2} has ${row.length} fields, expected ${header.length}: ${row.join(separator).slice(0, 120)}`);
    }
    const record = {} as Record<C, string>;
    for (const column of columns) record[column] = row[indexes[column]]!;
    return record;
  });
}
