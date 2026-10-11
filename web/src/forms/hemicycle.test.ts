import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { step } from "../preview/neighbours.ts"
import { seatsOf } from "../sources/seats.ts"
import { placeHemicycle } from "./hemicycle.ts"

const arc = (radius: number, degrees: number) => {
  const angle = (degrees * Math.PI) / 180
  return { x: radius * Math.cos(angle), y: -radius * Math.sin(angle) }
}

function lines(seats: Record<string, { x: number; y: number }>) {
  const deputies = Object.entries(seats).map(([id, point], i) => ({ id: deputyId(id), seat: { number: String(i), ...point } }))
  return placeHemicycle({ main: seatsOf({ deputies, emptySeats: [] }, { viewBox: "-1.1 -1.1 2.2 1.5", markup: "" }) }).lines
}

const id = deputyId

test("hemicycle neighbours follow the row, left towards the left wing", () => {
  const rows = lines({ a: arc(0.5, 30), b: arc(0.5, 40), c: arc(0.5, 50), outer: arc(0.56, 41), near: arc(0.52, 45) })
  assert.equal(step(rows, id("b"), "left"), id("near"))
  assert.equal(step(rows, id("near"), "left"), id("c"))
  assert.equal(step(rows, id("b"), "right"), id("a"))
  assert.equal(step(rows, id("c"), "left"), null)
  assert.equal(step(rows, id("outer"), "left"), null)
})

test("seats on the bottom row step along their own wing", () => {
  const rows = lines({ leftEnd: { x: -0.375, y: 0 }, leftNext: arc(0.375, 172), rightEnd: { x: 0.375, y: 0.001 }, rightNext: arc(0.375, 8) })
  assert.equal(step(rows, id("leftEnd"), "left"), null)
  assert.equal(step(rows, id("leftEnd"), "right"), id("leftNext"))
  assert.equal(step(rows, id("rightEnd"), "right"), null)
  assert.equal(step(rows, id("rightEnd"), "left"), id("rightNext"))
})

test("the hemicycle seats each deputy on their seat, draws the room with its empty seats, and tells each deputy's seat", () => {
  const empty = { number: "2", x: 0.1, y: -0.5 }
  const seats = seatsOf({ deputies: [{ id: id("a"), seat: { number: "1", ...arc(0.5, 30) } }], emptySeats: [empty] }, { viewBox: "0 0 1 1", markup: "<path/>" })
  const scene = placeHemicycle({ main: seats })
  assert.deepEqual(scene.dots.get(id("a")), { number: "1", ...arc(0.5, 30) })
  assert.deepEqual(scene.marks, [{ kind: "room", room: "<path/>", empty: [empty], radius: scene.radius }])
  assert.deepEqual(scene.where(id("a")), { kind: "seat", number: "1" })
})

test("hemicycle dots keep the size and pointer reach tuned on the hemicycle they replace", () => {
  const scene = placeHemicycle({ main: seatsOf({ deputies: [], emptySeats: [] }, { viewBox: "0 0 1 1", markup: "" }) })
  assert.deepEqual({ radius: scene.radius, snap: Math.round(scene.snap * 1e6) / 1e6 }, { radius: 0.019, snap: 0.03135 })
})
