import type { Deputy, DeputyId } from "../data/assembly.ts"
import { LIST_SEPARATOR } from "../data/csv.ts"
import { FuzzyIndex, type Match, type SearchResult } from "./fuzzy.ts"

const WEIGHTS = {
  last_name: 1.1,
  first_name: 1.05,
  department: 1.05,
  department_number: 1.05,
  constituency_number: 1.05,
  group: 1,
  group_short: 1,
  communes: 1,
} as const

export type SearchColumn = keyof typeof WEIGHTS

export type DeputyMatch = Match<DeputyId, SearchColumn>
export type DeputyResult = SearchResult<DeputyId, SearchColumn>

export function createDeputySearch(deputies: Deputy[]): FuzzyIndex<DeputyId, SearchColumn> {
  const index = new FuzzyIndex<DeputyId, SearchColumn>()
  for (const deputy of deputies) {
    for (const column of ["last_name", "first_name", "department", "department_number", "constituency_number", "group"] as const) {
      index.add(deputy.id, column, deputy[column], WEIGHTS[column])
    }
    index.add(deputy.id, "group_short", deputy.politicalGroup.short, WEIGHTS.group_short)
  }
  return index
}

export function addCommunes(index: FuzzyIndex<DeputyId, SearchColumn>, communes: ReadonlyMap<DeputyId, string>, deputies: Deputy[]): void {
  for (const deputy of deputies) {
    for (const commune of communes.get(deputy.id)?.split(LIST_SEPARATOR) ?? []) {
      index.add(deputy.id, "communes", commune, WEIGHTS.communes)
    }
  }
}
