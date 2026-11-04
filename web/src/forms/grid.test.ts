import assert from "node:assert/strict"
import { test } from "node:test"
import { bestGeometry, gridStep } from "./grid.ts"

test("columns take the width that gives the largest dots, the narrowest of equally good widths", () => {
  assert.deepEqual(bestGeometry(1, 100, { width: 10, height: 10, tickWidth: 0, overhangs: [] }), { across: 9, gap: 2, rows: 12, pitch: 10 / 12 })
})

test("columns grow up to 30 dots wide when a short area leaves the width free", () => {
  assert.deepEqual(bestGeometry(1, 30, { width: 100, height: 1, tickWidth: 0, overhangs: [] }), { across: 30, gap: 8, rows: 1, pitch: 1 })
})

test("a slanted label overhanging to the left of its column narrows the dots until it fits in the area", () => {
  assert.deepEqual(bestGeometry(2, 4, { width: 10, height: 10, tickWidth: 0, overhangs: [0, 9] }), { across: 1, gap: 1, rows: 4, pitch: 1 / 1.5 })
})

test("grid lines fall every round count of deputies that whole rows hold, about a quarter of the tallest column apart", () => {
  assert.equal(gridStep(9, 10), 3)
  assert.equal(gridStep(8, 5), 2)
  assert.equal(gridStep(40, 1), 10)
})

test("without such a round count, grid lines fall every quarter of the rows, at least every row", () => {
  assert.equal(gridStep(12, 7), 3)
  assert.equal(gridStep(1, 7), 1)
})
