import type { Catalog } from "../data/catalog.ts"
import { loadCsv } from "../data/csv.ts"
import { fetchText } from "../data/source.ts"
import type { CommuneCode } from "./codes.ts"
import { COMMUNE_COLUMNS, COMMUNE_TABLE, parseCommuneTable } from "./communes.ts"
import { CONTOURS_FILE, parseContours, type Contours } from "./contours.ts"
import type { LookupSources } from "./lookup.ts"
import { memoize } from "./memoize.ts"
import { parseRoll, ROLL_COLUMNS, rollFile } from "./roll.ts"

export function createLookupSources(catalog: Catalog): LookupSources | null {
  const listed = new Set(catalog.files.map(f => f.file))
  if (!listed.has(COMMUNE_TABLE)) return null
  const communes = memoize(() => logged(loadCsv(COMMUNE_TABLE, COMMUNE_COLUMNS).then(parseCommuneTable)))
  const contours = memoize(() =>
    listed.has(CONTOURS_FILE)
      ? logged(fetchText(CONTOURS_FILE).then(text => parseContours(JSON.parse(text))))
      : Promise.resolve<Contours>(new Map()),
  )
  const roll = memoize((commune: CommuneCode) => {
    const file = rollFile(commune)
    return listed.has(file) ? logged(loadCsv(file, ROLL_COLUMNS).then(rows => parseRoll(rows, file))) : Promise.resolve(null)
  })
  return { communes: () => communes(null), contours: () => contours(null), roll }
}

function logged<T>(promise: Promise<T>): Promise<T> {
  promise.catch((error: unknown) => console.error(error))
  return promise
}
