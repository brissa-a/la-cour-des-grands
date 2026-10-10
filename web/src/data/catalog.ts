import { isList, isRecord, type JsonRecord } from "./json.ts"
import { fetchText } from "./source.ts"

const CATALOG_FILE = "catalog.json"

const PLAIN_TYPES = ["text", "date", "code", "list", "link", "image"] as const

export type ColumnKind = { title: string } & (
  | { type: "category"; values: string }
  | { type: "reference"; entity: string }
  | { type: "number" }
  | { type: (typeof PLAIN_TYPES)[number] }
)

export type Feature = ColumnKind & { column: string }

export type ColumnsOf = { entity: string; feature: ColumnKind }

export type CatalogFile = { file: string; entity: string; features: Feature[]; columnsOf: ColumnsOf | null }

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

export function columnsValuesTablePath(catalog: Catalog, file: string): string {
  const feature = catalog.files.find(f => f.file === file)?.columnsOf?.feature
  if (feature?.type !== "category") throw invalid(`${file} has no category columns`)
  return feature.values
}

function catalogFile(value: unknown, index: number): CatalogFile {
  if (!isRecord(value) || typeof value.file !== "string") throw invalid(`file ${index} has no name`)
  const { file, entity } = value
  if (typeof entity !== "string") throw invalid(`${file} has no entity`)
  if (isList(value.features)) return { file, entity, features: value.features.map(item => catalogFeature(item, file)), columnsOf: null }
  if (isRecord(value.columnsOf)) return { file, entity, features: [], columnsOf: columnsOf(value.columnsOf, file) }
  throw invalid(`${file} lists neither features nor columnsOf`)
}

function catalogFeature(value: unknown, file: string): Feature {
  if (!isRecord(value) || typeof value.column !== "string") throw invalid(`${file} has a feature without column`)
  const { column } = value
  return { column, ...columnKind(value, `${file}:${column}`) }
}

function columnsOf(value: JsonRecord, file: string): ColumnsOf {
  if (typeof value.entity !== "string" || !isRecord(value.feature)) throw invalid(`${file} has columnsOf without entity or feature`)
  return { entity: value.entity, feature: columnKind(value.feature, `${file} columns`) }
}

function columnKind(value: JsonRecord, where: string): ColumnKind {
  const { title, type } = value
  if (typeof title !== "string") throw invalid(`${where} has no title`)
  if (type === "category") {
    if (typeof value.values !== "string") throw invalid(`${where} has no values table`)
    return { title, type, values: value.values }
  }
  if (type === "reference") {
    if (typeof value.entity !== "string") throw invalid(`${where} references no entity`)
    return { title, type, entity: value.entity }
  }
  if (type === "number") return { title, type }
  const plain = PLAIN_TYPES.find(known => known === type)
  if (plain === undefined) throw invalid(`${where} has an unknown type`)
  return { title, type: plain }
}

function invalid(reason: string): Error {
  return new Error(`${CATALOG_FILE}: ${reason}`)
}
