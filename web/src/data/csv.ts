import { parseCsv, type Row } from "./csvRows.ts"
import { fetchText } from "./source.ts"

export type { Row }

export async function loadCsv<const C extends string, const O extends string = never>(
  path: string,
  columns: readonly C[],
  optionalColumns?: readonly O[],
): Promise<Row<C | NoInfer<O>>[]> {
  return parseCsv(path, await fetchText(path), columns, optionalColumns)
}
