import { fetchText } from "./source.ts"

export type Entity = "deputy" | "vote" | "seat" | "commune" | "address"

type FeatureBase = { column: string; title: string }

export type CategoryFeature = FeatureBase & {
  type: "category"
  values: string
}

export type Feature =
  | CategoryFeature
  | (FeatureBase & { type: "reference"; entity: Entity })
  | (FeatureBase & { type: "number" })
  | (FeatureBase & { type: "text" | "date" | "code" | "list" | "link" | "image" })

type FileBase = {
  file: string
  entity: Entity
  key: string
  rows: number
  size: number
  gzipSize: number
}

export type CatalogFile =
  | (FileBase & { features: Feature[]; layout?: { background: string }; geometry?: "MultiPolygon" })
  | (FileBase & { columnsOf: { entity: Entity; count: number; feature: Feature } })

export type Catalog = { generated: string; files: CatalogFile[] }

export async function loadCatalog(): Promise<Catalog> {
  return JSON.parse(await fetchText("catalog.json")) as Catalog
}

export function valuesTablePath(catalog: Catalog, file: string, column: string): string {
  const entry = catalog.files.find(f => f.file === file)
  const feature = entry && "features" in entry ? entry.features.find(f => f.column === column) : undefined
  if (feature?.type !== "category") throw new Error(`catalog.json: no category feature ${file}:${column}`)
  return feature.values
}
