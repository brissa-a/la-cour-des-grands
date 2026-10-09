import assert from "node:assert/strict"
import { test } from "node:test"
import { constituencyCode, type AtLeastTwo, type ConstituencyCode } from "./codes.ts"
import { contains, distanceMeters, rank, type Ring, type Shape } from "./geometry.ts"

const square = (west: number, south: number, east: number, north: number): Ring => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]

const code = (value: string): ConstituencyCode => constituencyCode(value)!

test("a point is inside an outer ring unless it is in one of its holes", () => {
  const withHole: Shape = [{ outer: square(0, 0, 4, 4), holes: [square(1, 1, 2, 2)] }]
  assert.equal(contains(withHole, [3, 3]), true)
  assert.equal(contains(withHole, [5, 3]), false)
  assert.equal(contains(withHole, [1.5, 1.5]), false)
})

test("a shape covers each of its parts, and overlapping parts never cancel each other out", () => {
  const overlapping: Shape = [
    { outer: square(0, 0, 2, 2), holes: [] },
    { outer: square(1, 1, 3, 3), holes: [] },
  ]
  for (const point of [[0.5, 0.5], [1.5, 1.5], [2.5, 2.5]] as const) assert.equal(contains(overlapping, point), true)
})

test("distance is measured in metres in a plane local to the point", () => {
  const strip: Shape = [{ outer: square(10, 44, 11, 46), holes: [] }]
  assert.ok(Math.abs(distanceMeters(strip, [11.001, 45]) - 78.7) < 0.5)
  assert.equal(distanceMeters(strip, [10.5, 45]), 0)
})

test("a point inside a hole is as far as the hole's edge", () => {
  const withHole: Shape = [{ outer: square(0, 44, 1, 46), holes: [square(0.4, 44.9, 0.6, 45.1)] }]
  assert.ok(Math.abs(distanceMeters(withHole, [0.5, 45]) - 0.1 * Math.cos(Math.PI / 4) * 111_320) < 1)
})

test("a zero-length segment counts as its vertex", () => {
  const degenerate: Shape = [{ outer: [[0, 45], [0, 45], [0, 45], [0, 45]], holes: [] }]
  assert.ok(Math.abs(distanceMeters(degenerate, [0, 45.001]) - 111.32) < 0.01)
})

test("candidates are ranked by distance, ties keeping candidate order", () => {
  const candidates: AtLeastTwo<ConstituencyCode> = [code("33-1"), code("33-2"), code("33-3")]
  const shapes = new Map<ConstituencyCode, Shape>([
    [code("33-1"), [{ outer: square(1, 45, 2, 46), holes: [] }]],
    [code("33-2"), [{ outer: square(0, 45, 1, 46), holes: [] }]],
    [code("33-3"), [{ outer: square(1, 45, 2, 46), holes: [] }]],
  ])
  assert.deepEqual(
    rank([0.5, 45.5], shapes, candidates)?.map(r => r.constituency),
    ["33-2", "33-1", "33-3"],
  )
  shapes.delete(code("33-3"))
  assert.equal(rank([0.5, 45.5], shapes, candidates), null)
})
