import { loadCatalog } from "../data/catalog.ts"
import { loadCsv } from "../data/csv.ts"
import { deputyId } from "../data/deputyId.ts"
import { colorableFeatures, INIT_FILE } from "../data/features.ts"
import { SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS, SEATS_FILE } from "../data/seats.ts"
import type { ReadText } from "../data/source.ts"
import { DEFAULT_COLOR_FEATURE, HIDDEN_FEATURES } from "../sources/views.ts"
import { defaultColoring } from "../view/view.ts"
import { loadVoteIndex } from "../votes/sources.ts"
import { drawnIn } from "./drawn.ts"
import type { Known } from "./query.ts"
import type { TextData } from "./texts.ts"

export type ShareData = Known & TextData

const PEOPLE_COLUMNS = ["deputy_id", "first_name", "last_name", "in_office", "constituency", "mandate_periods"] as const

export async function loadShareData(read: ReadText): Promise<ShareData> {
  const catalog = await loadCatalog(read)
  const features = colorableFeatures(catalog, HIDDEN_FEATURES)
  const defaultColor = defaultColoring(features, DEFAULT_COLOR_FEATURE)
  if (!defaultColor) throw new Error(`catalog.json: no feature ${DEFAULT_COLOR_FEATURE}`)
  const [rows, seatRows, votes] = await Promise.all([
    loadCsv(read, INIT_FILE, PEOPLE_COLUMNS),
    loadCsv(read, SEATS_FILE, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS),
    loadVoteIndex(read, catalog),
  ])
  const people = rows.map(row => ({ ...row, id: deputyId(row.deputy_id) }))
  return {
    features,
    defaultColor,
    people: new Map(people.map(({ id, first_name, last_name }) => [id, { first_name, last_name }])),
    votes,
    generated: catalog.generated,
    drawn: drawnIn(people, seatRows),
  }
}
