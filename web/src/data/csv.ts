import { parseCsv, type Row } from "./csvRows.ts"
import type { ReadText } from "./source.ts"

export type { Row }

export async function loadCsv<const C extends string, const O extends string = never>(
  read: ReadText,
  path: string,
  columns: readonly C[],
  optionalColumns?: readonly O[],
): Promise<Row<C | NoInfer<O>>[]> {
  return parseCsv(path, await read(path), columns, optionalColumns)
}
