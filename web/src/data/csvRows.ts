import Papa from "papaparse"

export type Row<C extends string> = Readonly<Record<C, string>>

export type CsvRead<C extends string> = { readonly kind: "read"; readonly rows: Row<C>[] } | { readonly kind: "unreadable"; readonly reason: string }

export function readCsv<const C extends string, const O extends string = never>(
  path: string,
  text: string,
  columns: readonly C[],
  optionalColumns: readonly O[] = [],
): CsvRead<C | NoInfer<O>> {
  const { data, meta, errors } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const [error] = errors
  if (error) return { kind: "unreadable", reason: `${path}: ${error.message}` }
  const header = new Set(meta.fields)
  const missing = columns.filter(c => !header.has(c))
  if (missing.length) return { kind: "unreadable", reason: `${path}: missing columns ${missing.join(", ")}` }
  for (const column of optionalColumns) if (!header.has(column)) for (const row of data) row[column] = ""
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Papa reports any row with too few fields as an error, so with no error each row has every column of the header, which holds every required column, and each optional column the header lacks was just set to ""
  return { kind: "read", rows: data as Row<C | O>[] }
}

export function parseCsv<const C extends string, const O extends string = never>(
  path: string,
  text: string,
  columns: readonly C[],
  optionalColumns?: readonly O[],
): Row<C | NoInfer<O>>[] {
  const read = readCsv(path, text, columns, optionalColumns)
  if (read.kind === "unreadable") throw new Error(read.reason)
  return read.rows
}
