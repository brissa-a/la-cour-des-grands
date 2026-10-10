import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import type { NumberFeature } from "../data/features.ts"
import { MISSING } from "../sources/shapes.ts"
import { NEUTRAL } from "../sources/views.ts"
import { paintNumbers } from "./gradient.ts"
import { LAST } from "./paint.ts"
import { paintParts } from "./palette.ts"
import { paintWith } from "./registry.ts"

const A = deputyId("PA0")
const B = deputyId("PA1")
const C = deputyId("PA2")
const D = deputyId("PA3")

test("a palette ranks deputies by the position of their part, deputies outside every part last", () => {
  const part = (key: string, members: string[]) => ({ key, label: key, title: key, caption: null, color: key, members: members.map(deputyId) })
  const keys = new Map([[A, "x"], [B, "y"], [C, "z"]])
  const paint = paintParts({ title: "t", parts: [part("y", ["PA1"]), part("x", ["PA0"])], keyOf: id => keys.get(id) ?? MISSING, colorOf: () => "" })
  assert.deepEqual([A, B, C, D].map(paint.rank), [1, 0, LAST, LAST])
})

test("a gradient spreads the drawn deputies' range over its two colours, with evenly spaced round ticks, the mean and the missing count", () => {
  const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "f", column: "age", title: "Âge" }
  const ages = new Map([[A, 20], [B, 30], [C, 61], [deputyId("PA9"), 99]])
  const paint = paintNumbers({ feature: AGE, unit: "ans", drawn: [A, B, C, D], valueOf: id => ages.get(id) ?? null })
  assert.deepEqual([A, B, C, D].map(paint.colorOf), [
    "color-mix(in oklab, #7a2e0e 0.0%, #fde0c5)",
    "color-mix(in oklab, #7a2e0e 24.4%, #fde0c5)",
    "color-mix(in oklab, #7a2e0e 100.0%, #fde0c5)",
    NEUTRAL,
  ])
  assert.deepEqual([A, B, C, D].map(paint.rank), [20, 30, 61, LAST])
  assert.ok(paint.legend.kind === "ramp")
  const { min, max, mean, ticks, missing } = paint.legend
  assert.deepEqual({ min, max, mean, missing }, { min: 20, max: 61, mean: 37, missing: 1 })
  assert.deepEqual(ticks.map(t => t.value), [20, 30, 41, 51, 61])
  assert.equal(ticks[1]?.ratio, 10 / 41)
})

test("a paint reads the shape it paints and nothing else", () => {
  const parts = { title: "t", parts: [], keyOf: () => MISSING, colorOf: () => "" }
  assert.equal(paintWith("palette", { nominal: parts })?.legend.kind, "swatches")
  assert.equal(paintWith("gradient", {}), null)
})
