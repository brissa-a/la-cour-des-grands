import type { Deputy, DeputyId } from "../data/assembly.ts"
import type { ColorableFeature, FeatureKey, FeatureStore } from "../data/features.ts"
import { NEUTRAL, PALETTE, numberView } from "./views.ts"

export const MISSING = ""

export type LegendItem = { value: string; label: string; title: string; color: string; count: number }

type ColoringBase = {
  key: FeatureKey
  title: string
  colorOf: (id: DeputyId) => string
  valueOf: (id: DeputyId) => string
}

export type Coloring =
  | (ColoringBase & { kind: "category"; items: LegendItem[] })
  | (ColoringBase & {
      kind: "number"
      gradient: readonly [string, string]
      ticks: { value: number; ratio: number }[]
      mean: number
      unit: string
      missing: number
    })

export async function buildColoring(store: FeatureStore, source: ColorableFeature, deputies: Deputy[]): Promise<Coloring> {
  const values = await store.values(source)
  const valueOf = (id: DeputyId) => values.get(id) ?? MISSING
  const base = { key: source.key, title: source.feature.title, valueOf }
  const { feature } = source
  if (feature.type === "category") {
    const table = await store.valuesTable(feature.values)
    const colors = new Map(table.map((row, i) => [row.value, row.color ?? PALETTE[i % PALETTE.length] ?? NEUTRAL]))
    const counts = new Map<string, number>()
    for (const d of deputies) counts.set(valueOf(d.id), (counts.get(valueOf(d.id)) ?? 0) + 1)
    const items = table
      .map(row => ({ value: row.value, label: row.short ?? row.label, title: row.label, color: colors.get(row.value) ?? NEUTRAL, count: counts.get(row.value) ?? 0 }))
      .filter(item => item.count > 0)
    const missing = counts.get(MISSING) ?? 0
    if (missing) items.push({ value: MISSING, label: "Non renseigné", title: "Non renseigné", color: NEUTRAL, count: missing })
    return { ...base, kind: "category", items, colorOf: id => colors.get(valueOf(id)) ?? NEUTRAL }
  }

  const view = numberView(source.key)
  const numbers = deputies.flatMap(d => (values.has(d.id) ? [Number(values.get(d.id))] : []))
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const span = max - min || 1
  const ratio = (n: number) => (n - min) / span
  const [from, to] = view.gradient
  return {
    ...base,
    kind: "number",
    gradient: view.gradient,
    ticks: Array.from({ length: view.ticks }, (_, i) => {
      const value = Math.round(min + (span * i) / (view.ticks - 1))
      return { value, ratio: ratio(value) }
    }),
    mean: numbers.reduce((sum, n) => sum + n, 0) / numbers.length,
    unit: view.unit,
    missing: deputies.length - numbers.length,
    colorOf: id => {
      const value = values.get(id)
      if (value === undefined) return NEUTRAL
      return `color-mix(in oklab, ${to} ${(ratio(Number(value)) * 100).toFixed(1)}%, ${from})`
    },
  }
}
