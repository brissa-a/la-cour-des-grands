import assert from "node:assert/strict"
import { test } from "node:test"
import type { Coloring } from "../coloring/coloring.ts"
import { deputyId } from "../data/deputyId.ts"
import type { FeatureKey } from "../data/features.ts"
import { buildChart, type ChartFrame } from "./chart.ts"

const PX = 0.002
const WIDE: ChartFrame = { area: { left: -1, top: -0.8, right: 1.8, bottom: 0.2 }, px: PX }
const NARROW: ChartFrame = { area: { left: 0, top: 0, right: 0.7, bottom: 0.8 }, px: PX }
const SHORT: ChartFrame = { area: { left: 0, top: 0, right: 0.7, bottom: 0.28 }, px: PX }
const NARROWEST_CHAR_EM = 0.5

function deputies(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: deputyId(`PA${i}`), last_name: `N${i}` }))
}

function numberColoring(key: FeatureKey, values: Record<string, string>, unit: string): Coloring {
  return {
    kind: "number", key, title: "n", gradient: ["#000", "#fff"], min: 0, max: 0, ticks: [], mean: 0, unit, missing: 0,
    colorOf: () => "", valueOf: id => values[id] ?? "",
  }
}

function categories(sizes: Record<string, number>) {
  const ds = deputies(Object.values(sizes).reduce((sum, n) => sum + n, 0))
  const labels = Object.entries(sizes).flatMap(([label, size]) => Array.from({ length: size }, () => label))
  const values = Object.fromEntries(ds.map((d, i) => [d.id, labels[i] ?? ""]))
  const coloring: Coloring = {
    kind: "category", key: "f:c", title: "c", colorOf: () => "", valueOf: id => values[id] ?? "",
    items: Object.keys(sizes).map(v => ({ value: v, label: v, title: v, color: "", count: 0 })),
  }
  return { coloring, deputies: ds }
}

const VOTE = { Pour: 296, Contre: 224, Abstention: 41, "Non-votant": 1, Absent: 15 }
const LONG = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`Collectivité d'outre-mer n° ${i + 1}`, i === 0 ? 97 : 20]))
const MANY = { "Non renseigné": 3, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`${25 + 5 * i}–${29 + 5 * i} ans`, 45])) }

test("ages are binned by 5 years from the first multiple of 5, marked in years, with a column for missing values", () => {
  const ds = deputies(4)
  const ages = numberColoring("deputies/init.csv:age", { PA0: "27", PA1: "29", PA2: "41" }, "ans")
  const chart = buildChart(ages, ages, ds, 0.02, WIDE)
  assert.deepEqual(
    chart.columns.map(c => [c.label, c.count]),
    [["25–29 ans", 2], ["30–34 ans", 0], ["35–39 ans", 0], ["40–44 ans", 1], ["Non renseigné", 1]],
  )
})

for (const [name, frame] of [["wide", WIDE], ["narrow", NARROW]] as const) {
  test(`in a ${name} area, the chart fills the limiting side and keeps every dot, the axis and the labels inside`, () => {
    const { coloring, deputies: ds } = categories(VOTE)
    const chart = buildChart(coloring, coloring, ds, 0.02, frame)
    const { area } = frame
    const points = [...chart.positions.values()]
    assert.equal(new Set(points.map(({ x, y }) => `${x},${y}`)).size, ds.length)
    for (const { x, y } of points) {
      assert.ok(x - chart.radius >= area.left && x + chart.radius <= area.right, `x ${x}`)
      assert.ok(y - chart.radius >= area.top && y + chart.radius <= chart.baseline, `y ${y}`)
    }
    const first = chart.columns[0]
    const last = chart.columns.at(-1)
    assert.ok(first && last)
    const axisLeft = first.x - chart.pitch
    const axisRight = last.x + last.width + chart.pitch
    assert.ok(axisLeft - chart.fontSize * 2 >= area.left && axisRight <= area.right)
    const lowest = chart.labels.kind === "flat" ? chart.labels.y + chart.labels.lineHeight : chart.labels.y
    assert.ok(lowest < area.bottom)
    const top = Math.min(...points.map(p => p.y)) - chart.pitch / 2
    const heightUsed = (chart.baseline - top) / (area.bottom - area.top)
    const widthUsed = (axisRight - axisLeft) / (area.right - area.left)
    assert.ok(Math.max(heightUsed, widthUsed) > 0.85, `height ${heightUsed}, width ${widthUsed}`)
  })
}

test("column labels lie flat under wide columns and slant when the columns are too narrow for them", () => {
  const vote = categories(VOTE)
  const many = categories(MANY)
  assert.equal(buildChart(vote.coloring, vote.coloring, vote.deputies, 0.02, WIDE).labels.kind, "flat")
  assert.equal(buildChart(many.coloring, many.coloring, many.deputies, 0.02, NARROW).labels.kind, "slanted")
})

test("slanted labels keep their whole length inside the area, to the left and below", () => {
  const { coloring, deputies: ds } = categories(MANY)
  const { columns, fontSize, labels } = buildChart(coloring, coloring, ds, 0.02, NARROW)
  assert.ok(labels.kind === "slanted")
  const slant = Math.sin((labels.degrees * Math.PI) / 180)
  const starts = columns.map(column => {
    const length = `${column.count} ${column.label}`.length * NARROWEST_CHAR_EM * fontSize
    return { label: column.label, x: column.x + column.width / 2 - slant * length, y: labels.y + slant * length }
  })
  for (const { label, x, y } of starts) assert.ok(x >= NARROW.area.left && y <= NARROW.area.bottom, `${label}: ${x}, ${y}`)
})

test("slanted labels shrink just enough for neighbouring labels to sit a line apart, and keep their full size when the columns leave room", () => {
  const { coloring, deputies: ds } = categories(LONG)
  const crowded = buildChart(coloring, coloring, ds, 0.02, NARROW)
  const [first, second] = crowded.columns
  assert.ok(first && second && crowded.labels.kind === "slanted")
  const apart = (second.x - first.x) * Math.sin((crowded.labels.degrees * Math.PI) / 180)
  assert.ok(apart >= crowded.fontSize && apart <= 1.25 * crowded.fontSize, `${apart} apart for ${crowded.fontSize}`)
  assert.equal(buildChart(coloring, coloring, ds, 0.02, WIDE).fontSize, 12 * PX)
})

test("in a short area, long labels give up size so the dots keep most of the height and stay inside", () => {
  const { coloring, deputies: ds } = categories(LONG)
  const chart = buildChart(coloring, coloring, ds, 0.02, SHORT)
  const { area } = SHORT
  assert.ok(chart.baseline - area.top >= 0.5 * (area.bottom - area.top), `baseline ${chart.baseline}`)
  for (const { y } of chart.positions.values()) assert.ok(y - chart.radius >= area.top, `y ${y}`)
})
