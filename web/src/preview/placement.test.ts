import assert from "node:assert/strict"
import { test } from "node:test"
import { ARROW_INSET, GAP, placeAbove, placeBeside, type PlacementInput, type Point } from "./placement.ts"

const bounds = { left: 0, top: 0, right: 1000, bottom: 800 }

function input(overrides: Partial<PlacementInput>): PlacementInput {
  return {
    anchor: { x: 500, y: 400, radius: 15 },
    width: 200,
    height: 80,
    bounds,
    obstacles: [],
    dots: [],
    dotRadius: 10,
    keep: null,
    ...overrides,
  }
}

function grid(left: number, top: number, right: number, bottom: number): Point[] {
  const dots: Point[] = []
  for (let x = left; x <= right; x += 20) for (let y = top; y <= bottom; y += 20) dots.push({ x, y })
  return dots
}

test("picks the side covering the fewest dots", () => {
  const dots = [...grid(200, 300, 480, 500), ...grid(520, 300, 800, 500), ...grid(300, 420, 700, 600)]
  const placement = placeBeside(input({ dots }))
  assert.equal(placement.side, "above")
  assert.equal(placement.top + 80, 400 - 15 - GAP)
})

test("skips sides that overlap an obstacle or leave the bounds", () => {
  const anchor = { x: 900, y: 400, radius: 15 }
  const obstacles = [{ left: 0, top: 0, right: 1000, bottom: 380 }]
  const placement = placeBeside(input({ anchor, obstacles, dots: grid(600, 400, 880, 480) }))
  assert.equal(placement.side, "below")
})

test("keeps the previous side while it stays clear", () => {
  const dots = grid(520, 300, 800, 500)
  assert.equal(placeBeside(input({ dots })).side !== "right", true)
  assert.equal(placeBeside(input({ dots, keep: "right" })).side, "right")
})

test("slides along the free axis and keeps the arrow facing the anchor", () => {
  const anchor = { x: 40, y: 400, radius: 15 }
  const placement = placeBeside(input({ anchor, keep: "below" }))
  assert.equal(placement.side, "below")
  assert.equal(placement.left, 0)
  assert.equal(placement.arrow, 40)
  assert.ok(placement.arrow >= ARROW_INSET)
})

test("above the columns, the card clears the highest dot it overhangs", () => {
  const column = (x: number, top: number) => grid(x, top, x, 700)
  const dots = [...column(460, 300), ...column(500, 420), ...column(540, 200)]
  const anchor = { x: 500, y: 420, radius: 12 }
  const placement = placeAbove(input({ anchor, dots, width: 120 }))
  assert.equal(placement.side, "above")
  const right = placement.left + 120
  const overhung = dots.filter(d => d.x + 10 > placement.left && d.x - 10 < right && d.y < anchor.y)
  const bottom = placement.top + 80
  assert.ok(overhung.every(d => d.y - 10 >= bottom + GAP))
  assert.equal(placement.leader, anchor.y - anchor.radius - bottom)
})
