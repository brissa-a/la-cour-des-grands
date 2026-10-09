import { atLeastTwo, communeCode, constituencyList, type AtLeastTwo, type CommuneCode, type ConstituencyCode } from "./codes.ts"

export const COMMUNE_TABLE = "communes/constituencies.csv"

export const COMMUNE_COLUMNS = ["commune_code", "constituencies"] as const

export type CommuneConstituencies =
  | { kind: "single"; constituency: ConstituencyCode }
  | { kind: "split"; constituencies: AtLeastTwo<ConstituencyCode> }

export type CommuneTable = ReadonlyMap<CommuneCode, CommuneConstituencies>

export function parseCommuneTable(rows: readonly { commune_code: string; constituencies: string }[]): CommuneTable {
  const table = new Map<CommuneCode, CommuneConstituencies>()
  for (const row of rows) {
    const code = communeCode(row.commune_code)
    if (code === null) throw new Error(`${COMMUNE_TABLE}: invalid commune code "${row.commune_code}"`)
    const list = constituencyList(row.constituencies, `${COMMUNE_TABLE} ${code}`)
    const split = atLeastTwo(list)
    table.set(code, split ? { kind: "split", constituencies: split } : { kind: "single", constituency: list[0]! })
  }
  return table
}
