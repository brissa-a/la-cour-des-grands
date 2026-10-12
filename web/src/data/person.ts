import type { Row } from "./csv.ts"
import type { DeputyId } from "./deputyId.ts"

export const INIT_COLUMNS = [
  "deputy_id", "photo", "last_name", "first_name", "civility", "birth_date", "age", "in_office",
  "constituency", "department", "department_number", "constituency_number", "mandate_periods", "group",
] as const

export type InitRow = Row<(typeof INIT_COLUMNS)[number]>

export const CIVILITIES = ["M.", "Mme"] as const

export type Civility = (typeof CIVILITIES)[number]

export type Group = { name: string; short: string; color: string; seatCount: number }

export type Person = Omit<InitRow, "civility"> & { civility: Civility; id: DeputyId; politicalGroup: Group }

export type ConstituencyLabel = Pick<InitRow, "department" | "department_number" | "constituency_number">
