import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import { readSeats } from "../sources/read.ts"
import { seatsOf } from "../sources/seats.ts"
import { motionOf, nextStaging, type Staging } from "./staging.ts"

const A = deputyId("PA0")
const B = deputyId("PA1")

function staging(ids: readonly DeputyId[]): Staging {
  const seats = seatsOf({ deputies: ids.map((id, i) => ({ id, seat: { number: String(i), x: i, y: 0 } })), emptySeats: [] }, { viewBox: "0 0 1 1", markup: "" })
  return { scene: placeHemicycle(seats), reading: readSeats(seats), arrangement: null }
}

test("the first scene that places every drawn deputy is shown, otherwise the room", () => {
  const placed = staging([A])
  const last = staging([A])
  const room = staging([A, B])
  assert.equal(nextStaging([placed, last], room, [A]), placed)
  assert.equal(nextStaging([null, last], room, [A]), last)
  assert.equal(nextStaging([placed, last], room, [A, B]), room)
  assert.equal(nextStaging([null, null], room, [A]), room)
})

test("a dot waits for its turn in the wave, and a refit before it starts waits only what remains", () => {
  assert.deepEqual(motionOf(10, 0), { delay: 0.12, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  assert.ok(Math.abs(motionOf(10, 50).delay - 0.07) < 1e-12)
  assert.equal(motionOf(50, 0).delay, 0.12)
})

test("a refit while a dot is in flight keeps it moving and lands it when the wave planned", () => {
  const halfway = motionOf(10, 120 + 450)
  assert.equal(halfway.delay, 0)
  assert.ok(Math.abs(halfway.duration - 0.45) < 1e-12)
  assert.equal(halfway.easing, "cubic-bezier(0, 0, 0.2, 1)")
})

test("a dot that started within the same frame, or has landed, moves again with the whole flight", () => {
  assert.deepEqual(motionOf(0, 5), { delay: 0, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  assert.deepEqual(motionOf(10, 120 + 900), { delay: 0, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  assert.deepEqual(motionOf(3, Infinity), { delay: 0, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
})
