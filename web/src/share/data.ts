import { loadCatalog } from "../data/catalog.ts"
import { loadCsv } from "../data/csv.ts"
import { deputyId } from "../data/deputyId.ts"
import { colorableFeatures, INIT_FILE } from "../data/features.ts"
import type { ReadText } from "../data/source.ts"
import { HIDDEN_FEATURES } from "../sources/views.ts"
import { loadVoteIndex } from "../votes/sources.ts"
import type { Known } from "./query.ts"
import type { TextData } from "./texts.ts"

export type ShareData = Known & TextData

const NAME_COLUMNS = ["deputy_id", "first_name", "last_name"] as const

export async function loadShareData(read: ReadText): Promise<ShareData> {
  const catalog = await loadCatalog(read)
  const [rows, votes] = await Promise.all([loadCsv(read, INIT_FILE, NAME_COLUMNS), loadVoteIndex(read, catalog)])
  return {
    features: colorableFeatures(catalog, HIDDEN_FEATURES),
    people: new Map(rows.map(({ deputy_id, first_name, last_name }) => [deputyId(deputy_id), { first_name, last_name }])),
    votes,
    generated: catalog.generated,
  }
}
