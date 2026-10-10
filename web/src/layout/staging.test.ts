import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import { readSeats } from "../sources/read.ts"
import { seatsOf } from "../sources/seats.ts"
import { nextStaging, staggerDelay, type Staging } from "./staging.ts"

const A = deputyId("PA0")
const B = deputyId("PA1")

function staging(ids: readonly DeputyId[]): Staging {
  const seats = seatsOf({ deputies: ids.map((id, i) => ({ id, seat: { number: String(i), x: i, y: 0 } })), emptySeats: [] }, { viewBox: "0 0 1 1", markup: "" })
  const reading = readSeats(seats)
  return { scene: placeHemicycle(seats), reading, arrangement: reading }
}

test("while a layout's inputs load, the last scene stays if it still places every drawn deputy, otherwise the room is shown", () => {
  const placed = staging([A])
  const last = staging([A])
  const room = staging([A, B])
  assert.equal(nextStaging(placed, last, room, [A]), placed)
  assert.equal(nextStaging(null, last, room, [A]), last)
  assert.equal(nextStaging(null, last, room, [A, B]), room)
  assert.equal(nextStaging(null, null, room, [A]), room)
})

test("a refit keeps each dot's turn in the wave: a dot not yet started waits only what remains, one already moving goes at once", () => {
  assert.equal(staggerDelay(10, 0), 0.12)
  assert.ok(Math.abs(staggerDelay(10, 50) - 0.07) < 1e-12)
  assert.equal(staggerDelay(10, 500), 0)
  assert.equal(staggerDelay(50, 0), 0.12)
  assert.equal(staggerDelay(3, Infinity), 0)
})
