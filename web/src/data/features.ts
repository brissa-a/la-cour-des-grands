import type { Assembly, DeputyId } from "./assembly.ts"
import type { Feature } from "./catalog.ts"
import { loadCsv, type Row } from "./csv.ts"

export type FeatureKey = `${string}:${string}`

export type ColorableFeature = {
  key: FeatureKey
  file: string
  column: string
  feature: Extract<Feature, { type: "category" | "number" }>
}

export type ValueRow = { value: string; label: string; short: string | undefined; color: string | undefined }

const INIT_FILE = "deputies/init.csv"

export function featureKey(file: string, column: string): FeatureKey {
  return `${file}:${column}`
}

export function colorableFeatures(assembly: Assembly, hidden: ReadonlySet<FeatureKey>): ColorableFeature[] {
  return assembly.catalog.files.flatMap(file =>
    file.entity === "deputy" && "features" in file
      ? file.features.flatMap((feature): ColorableFeature[] => {
          const key = featureKey(file.file, feature.column)
          if (hidden.has(key) || (feature.type !== "category" && feature.type !== "number")) return []
          return [{ key, file: file.file, column: feature.column, feature }]
        })
      : [],
  )
}

export function createFeatureStore(assembly: Assembly) {
  const files = new Map<string, Promise<ReadonlyMap<DeputyId, Readonly<Record<string, string>>>>>([
    [INIT_FILE, Promise.resolve(assembly.initRows)],
  ])
  const tables = new Map<string, Promise<ValueRow[]>>()

  const fileRows = (file: string) => {
    let rows = files.get(file)
    if (!rows) {
      rows = loadCsv(file, ["deputy_id"]).then(r => new Map(r.map(row => [row.deputy_id as DeputyId, row])))
      files.set(file, rows)
    }
    return rows
  }

  return {
    async values(feature: ColorableFeature): Promise<ReadonlyMap<DeputyId, string>> {
      const rows = await fileRows(feature.file)
      const values = new Map<DeputyId, string>()
      for (const [id, row] of rows) {
        const value = row[feature.column]
        if (value) values.set(id, value)
      }
      return values
    },

    valuesTable(path: string): Promise<ValueRow[]> {
      let table = tables.get(path)
      if (!table) {
        table = loadCsv(path, ["value", "label_fr"]).then(rows =>
          rows.map((row: Row<"value" | "label_fr"> & Partial<Row<"short_fr" | "color">>) => ({
            value: row.value,
            label: row.label_fr,
            short: row.short_fr || undefined,
            color: row.color || undefined,
          })),
        )
        tables.set(path, table)
      }
      return table
    },
  }
}

export type FeatureStore = ReturnType<typeof createFeatureStore>
