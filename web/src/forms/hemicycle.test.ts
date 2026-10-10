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
  return placeHemicycle(seatsOf({ deputies, emptySeats: [] }, { viewBox: "-1.1 -1.1 2.2 1.5", markup: "" })).lines
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
