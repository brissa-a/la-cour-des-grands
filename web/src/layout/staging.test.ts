import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import { parseViewBox } from "../data/viewBox.ts"
import type { Frame, Order } from "../forms/form.ts"
import { arrange, arrangedPlaces } from "../forms/registry.ts"
import { readSeats } from "../sources/read.ts"
import { seatsOf } from "../sources/seats.ts"
import { HEMICYCLE } from "../view/view.ts"
import { dotMotion, motionOf, nextStaging, roomStaging, settleMs, transitionOf, waveFor, type Staging } from "./staging.ts"

const A = deputyId("PA0")
const B = deputyId("PA1")

const FRAME: Frame = { area: { left: 0, top: 0, right: 1, bottom: 1 }, px: 0.002, screen: "desktop" }

function seated(ids: readonly DeputyId[]) {
  return readSeats(seatsOf({ deputies: ids.map((id, i) => ({ id, seat: { number: String(i), x: i, y: 0 } })), emptySeats: [] }, { box: parseViewBox("0 0 1 1") ?? assert.fail("viewBox"), markup: "" }))
}

function staging(ids: readonly DeputyId[]): Staging {
  return roomStaging(seated(ids), FRAME)
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

test("the room places nobody before the stage is measured, then every seated deputy with the room, read the same way across refits", () => {
  const seats = seated([A, B])
  const unmeasured = roomStaging(seats, null)
  assert.deepEqual([unmeasured.scene.dots.size, unmeasured.scene.marks], [0, []])
  const measured = roomStaging(seats, FRAME)
  assert.deepEqual([[...measured.scene.dots.keys()], measured.scene.marks.map(mark => mark.kind)], [[A, B], ["room"]])
  assert.equal(measured.reading, unmeasured.reading)
})

test("a dot waits for its turn in the wave, and a refit before it starts waits only what remains", () => {
  assert.deepEqual(motionOf(10, 0, "full"), { delay: 0.12, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  assert.ok(Math.abs(motionOf(10, 50, "full").delay - 0.07) < 1e-12)
  assert.equal(motionOf(50, 0, "full").delay, 0.12)
})

test("a refit while a dot is in flight, from its first painted frame, keeps it moving and lands it when the wave planned", () => {
  const halfway = motionOf(10, 120 + 450, "full")
  assert.equal(halfway.delay, 0)
  assert.ok(Math.abs(halfway.duration - 0.45) < 1e-12)
  assert.equal(halfway.easing, "cubic-bezier(0, 0, 0.2, 1)")
  assert.deepEqual(motionOf(0, 1000 / 60, "full"), { delay: 0, duration: 0.9 - 1 / 60, easing: "cubic-bezier(0, 0, 0.2, 1)" })
})

test("a dot that started within the same frame, or has landed, moves again with the whole flight", () => {
  assert.deepEqual(motionOf(0, 5, "full"), { delay: 0, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  assert.deepEqual(motionOf(10, 120 + 900, "full"), { delay: 0, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
  assert.deepEqual(motionOf(3, Infinity, "full"), { delay: 0, duration: 0.9, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
})

test("under reduced motion every dot, and the room with it, moves at once, wherever it stands in the wave", () => {
  const timings = [motionOf(0, 0, "reduced"), motionOf(39, 0, "reduced"), motionOf(10, 120 + 450, "reduced")].map(({ delay, duration }) => [delay, duration])
  assert.deepEqual(timings, [[0, 0], [0, 0], [0, 0]])
})

test("the drawing settles when the last dot of the wave lands, and at once under reduced motion", () => {
  const landings = Array.from({ length: 100 }, (_, index) => {
    const { delay, duration } = motionOf(index, 0, "full")
    return (delay + duration) * 1000
  })
  assert.ok(Math.abs(settleMs("full") - Math.max(...landings)) < 1e-9)
  assert.equal(settleMs("reduced"), 0)
})

test("a motion is written as the css transition of its delay, duration and easing, in seconds", () => {
  assert.deepEqual(transitionOf({ delay: 0.12, duration: 0.45, easing: "ease" }), { transitionDelay: "0.12s", transitionDuration: "0.45s", transitionTimingFunction: "ease" })
})

function seatedAt(seats: Readonly<Record<string, string>>) {
  const deputies = Object.entries(seats).map(([id, number]) => ({ id: deputyId(id), seat: { number, x: Number(number), y: 0 } }))
  return readSeats(seatsOf({ deputies, emptySeats: [] }, { box: parseViewBox("0 0 4 1") ?? assert.fail("viewBox"), markup: "" }))
}

test("a new colour on the hemicycle, or its first arrangement after the room, keeps the wave it is in, so a refit moves the room and every dot with one timing", () => {
  const seats = seated([A, B])
  const room = roomStaging(seats, FRAME)
  const hemicycle = (order: Order) => arrangedPlaces(arrange(HEMICYCLE, () => seats, order) ?? assert.fail("hemicycle"))
  const wave = { places: room.places, at: 0, still: new Set<DeputyId>() }
  const scenes = { before: room.scene, after: room.scene }
  assert.equal(waveFor(wave, hemicycle(() => 0), scenes, 5000), wave)
  assert.equal(waveFor(wave, hemicycle(() => 1), scenes, 5000), wave)
  const landed = [0, 1, 39].map(index => dotMotion(wave, A, index, 5000, "full"))
  assert.deepEqual(landed.slice(1), [landed[0], landed[0]])
})

test("deputies moving to other seats start a new wave at that moment, while those who keep their seat, or just arrive, move with the room", () => {
  const before = roomStaging(seatedAt({ PA0: "0", PA1: "1", PA2: "2" }), FRAME)
  const after = roomStaging(seatedAt({ PA0: "0", PA1: "3", PA3: "2" }), FRAME)
  const wave = waveFor({ places: before.places, at: 0, still: new Set() }, after.places, { before: before.scene, after: after.scene }, 5000)
  assert.deepEqual([wave.at, [...wave.still]], [5000, [deputyId("PA0"), deputyId("PA3")]])
  assert.deepEqual(dotMotion(wave, deputyId("PA0"), 10, 5050, "full"), motionOf(0, 50, "full"))
  assert.deepEqual(dotMotion(wave, deputyId("PA1"), 10, 5050, "full"), motionOf(10, 50, "full"))
  const unseated = { ...after.scene, where: () => null }
  assert.deepEqual([...waveFor(wave, before.places, { before: unseated, after: unseated }, 6000).still], [])
})
