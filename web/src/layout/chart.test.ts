import assert from "node:assert/strict"
import { test } from "node:test"
import type { Coloring } from "../coloring/coloring.ts"
import type { Deputy, DeputyId } from "../data/assembly.ts"
import type { FeatureKey } from "../data/features.ts"
import { buildChart } from "./chart.ts"

function deputies(count: number): Deputy[] {
  return Array.from({ length: count }, (_, i) => ({ id: `PA${i}` as DeputyId, last_name: `N${i}` }) as Deputy)
}

function numberColoring(key: FeatureKey, values: Record<string, string>): Coloring {
  return {
    kind: "number", key, title: "n", gradient: ["#000", "#fff"], min: 0, max: 0, ticks: [], mean: 0, unit: "", missing: 0,
    colorOf: () => "", valueOf: id => values[id] ?? "",
  }
}

test("ages are binned by 5 years from the first multiple of 5, with a column for missing values", () => {
  const ds = deputies(4)
  const ages = numberColoring("deputies/init.csv:age", { PA0: "27", PA1: "29", PA2: "41" })
  const chart = buildChart(ages, ages, ds, 0.02)
  assert.deepEqual(
    chart.columns.map(c => [c.label, c.count]),
    [["25–29", 2], ["30–34", 0], ["35–39", 0], ["40–44", 1], ["Non renseigné", 1]],
  )
})

test("every deputy gets its own position inside the chart area", () => {
  const ds = deputies(569)
  const values = Object.fromEntries(ds.map((d, i) => [d.id, String(i % 3)]))
  const coloring: Coloring = {
    kind: "category", key: "f:c", title: "c", colorOf: () => "", valueOf: id => values[id] ?? "",
    items: ["0", "1", "2"].map(v => ({ value: v, label: v, title: v, color: "", count: 0 })),
  }
  const chart = buildChart(coloring, coloring, ds, 0.02)
  assert.equal(chart.positions.size, 569)
  assert.equal(new Set([...chart.positions.values()].map(({ x, y }) => `${x},${y}`)).size, 569)
  for (const { x, y } of chart.positions.values()) {
    assert.ok(x > -1 && x < 1.1 && y > -1 && y < 0.1, `${x},${y}`)
  }
})
