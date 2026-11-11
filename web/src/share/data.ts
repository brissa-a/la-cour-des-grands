import { loadCatalog } from "../data/catalog.ts"
import { parseCsv } from "../data/csvRows.ts"
import { deputyId } from "../data/deputyId.ts"
import { colorableFeatures, INIT_FILE } from "../data/features.ts"
import type { ReadText } from "../data/source.ts"
import { DEFAULT_COLOR_FEATURE, HIDDEN_FEATURES } from "../sources/views.ts"
import { defaultColoring } from "../view/view.ts"
import { loadVoteIndex } from "../votes/sources.ts"
import { readDrawing } from "./drawn.ts"
import type { Known } from "./query.ts"
import type { TextData } from "./texts.ts"

export type ShareData = Known & TextData

const NAME_COLUMNS = ["deputy_id", "first_name", "last_name"] as const

export async function loadShareData(read: ReadText): Promise<ShareData> {
  const catalog = await loadCatalog(read)
  const features = colorableFeatures(catalog, HIDDEN_FEATURES)
  const defaultColor = defaultColoring(features, DEFAULT_COLOR_FEATURE)
  if (!defaultColor) throw new Error(`catalog.json: no feature ${DEFAULT_COLOR_FEATURE}`)
  const init = read(INIT_FILE)
  const [rows, drawing, votes] = await Promise.all([
    init.then(text => parseCsv(INIT_FILE, text, NAME_COLUMNS)),
    init.then(text => readDrawing(read, text)),
    loadVoteIndex(read, catalog),
  ])
  return {
    features,
    defaultColor,
    people: new Map(rows.map(({ deputy_id, first_name, last_name }) => [deputyId(deputy_id), { first_name, last_name }])),
    votes,
    generated: catalog.generated,
    drawing,
  }
}
