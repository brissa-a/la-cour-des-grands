import { isList, isRecord } from "./json.ts"
import { fetchText } from "./source.ts"

const CATALOG_FILE = "catalog.json"

const PLAIN_TYPES = ["text", "date", "code", "list", "link", "image"] as const

type FeatureBase = { column: string; title: string }

export type CategoryFeature = FeatureBase & {
  type: "category"
  values: string
}

export type Feature =
  | CategoryFeature
  | (FeatureBase & { type: "reference"; entity: string })
  | (FeatureBase & { type: "number" })
  | (FeatureBase & { type: (typeof PLAIN_TYPES)[number] })

export type CatalogFile = { file: string; entity: string; features: Feature[] }

export type Catalog = { files: CatalogFile[] }

export async function loadCatalog(): Promise<Catalog> {
  return parseCatalog(JSON.parse(await fetchText(CATALOG_FILE)))
}

export function parseCatalog(json: unknown): Catalog {
  if (!isRecord(json) || !isList(json.files)) throw invalid("no files list")
  return { files: json.files.map(catalogFile) }
}

export function valuesTablePath(catalog: Catalog, file: string, column: string): string {
  const feature = catalog.files.find(f => f.file === file)?.features.find(f => f.column === column)
  if (feature?.type !== "category") throw invalid(`no category feature ${file}:${column}`)
  return feature.values
}

function catalogFile(value: unknown, index: number): CatalogFile {
  if (!isRecord(value) || typeof value.file !== "string") throw invalid(`file ${index} has no name`)
  const { file, entity } = value
  if (typeof entity !== "string") throw invalid(`${file} has no entity`)
  if (isList(value.features)) return { file, entity, features: value.features.map(item => catalogFeature(item, file)) }
  if (isRecord(value.columnsOf)) return { file, entity, features: [] }
  throw invalid(`${file} lists neither features nor columnsOf`)
}

function catalogFeature(value: unknown, file: string): Feature {
  if (!isRecord(value) || typeof value.column !== "string" || typeof value.title !== "string") throw invalid(`${file} has a feature without column or title`)
  const { column, title, type } = value
  const where = `${file}:${column}`
  if (type === "category") {
    if (typeof value.values !== "string") throw invalid(`${where} has no values table`)
    return { column, title, type, values: value.values }
  }
  if (type === "reference") {
    if (typeof value.entity !== "string") throw invalid(`${where} references no entity`)
    return { column, title, type, entity: value.entity }
  }
  if (type === "number") return { column, title, type }
  const plain = PLAIN_TYPES.find(known => known === type)
  if (plain === undefined) throw invalid(`${where} has an unknown type`)
  return { column, title, type: plain }
}

function invalid(reason: string): Error {
  return new Error(`${CATALOG_FILE}: ${reason}`)
}
