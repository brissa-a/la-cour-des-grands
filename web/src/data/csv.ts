import Papa from "papaparse"
import { fetchText } from "./source.ts"

export type Row<C extends string> = Readonly<Record<C, string>>

export async function loadCsv<const C extends string>(path: string, columns: readonly C[]): Promise<Row<C>[]> {
  const { data, meta, errors } = Papa.parse<Record<string, string>>(await fetchText(path), {
    header: true,
    skipEmptyLines: true,
  })
  if (errors.length) throw new Error(`${path}: ${errors[0]?.message}`)
  const missing = columns.filter(c => !meta.fields?.includes(c))
  if (missing.length) throw new Error(`${path}: missing columns ${missing.join(", ")}`)
  return data as Row<C>[]
}

export const LIST_SEPARATOR = "|"
