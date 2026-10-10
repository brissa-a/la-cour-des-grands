import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { readingOf } from "./read.ts"
import { seatsOf } from "./seats.ts"

const PA0 = deputyId("PA0")
const PA1 = deputyId("PA1")
const seats = seatsOf({ deputies: [], emptySeats: [] }, { viewBox: "0 0 1 1", markup: "" })
const number = (key: `${string}:${string}`): NumberFeature => ({ kind: "number", key, file: "f", column: "c", title: "Titre" })
const CATEGORY: CategoryFeature = { kind: "category", key: "f:c", file: "f", column: "c", title: "Titre", values: "v" }

function lines(feature: NumberFeature) {
  const values = { kind: "number" as const, feature, valueOf: new Map([[PA0, 57.25]]) }
  const reading = readingOf(feature, { drawn: [PA0, PA1], values, vote: null, seats })
  assert.ok(reading)
  return [reading.lineOf(PA0), reading.lineOf(PA1)]
}

test("a value gets its feature title only when its shape does not tell the feature", () => {
  assert.deepEqual(lines(number("deputies/init.csv:age")), [
    { label: "57,3 ans", caption: null, missing: false },
    { label: "Non renseigné", caption: "Titre", missing: true },
  ])
  assert.deepEqual(lines(number("f:c")), [
    { label: "57,3", caption: "Titre", missing: false },
    { label: "Non renseigné", caption: "Titre", missing: true },
  ])
  const PA2 = deputyId("PA2")
  const table = [
    { value: "a", label: "Alpha", short: "A", color: undefined },
    { value: "b", label: "Bravo", short: undefined, color: undefined },
  ]
  const values = { kind: "category" as const, feature: CATEGORY, valueOf: new Map([[PA0, "b"], [PA2, "a"]]), table }
  const category = readingOf(CATEGORY, { drawn: [PA0, PA1], values, vote: null, seats })
  assert.deepEqual([category?.lineOf(PA0), category?.lineOf(PA1), category?.lineOf(PA2)], [
    { label: "Bravo", caption: null, missing: false },
    { label: "Non renseigné", caption: "Titre", missing: true },
    { label: "a", caption: null, missing: false },
  ])
})

test("a feature is read only from its own values", () => {
  const numbers = { kind: "number" as const, feature: number("f:c"), valueOf: new Map([[PA0, 1]]) }
  const categories = { kind: "category" as const, feature: CATEGORY, valueOf: new Map([[PA0, "a"]]), table: [] }
  const read = (feature: NumberFeature | CategoryFeature, values: typeof numbers | typeof categories | null) =>
    readingOf(feature, { drawn: [PA0], values, vote: null, seats }) !== null
  assert.deepEqual(
    [read(number("f:c"), numbers), read(number("f:other"), numbers), read(number("f:c"), null), read(number("f:c"), categories)],
    [true, false, false, false],
  )
  assert.deepEqual(
    [read(CATEGORY, categories), read({ ...CATEGORY, key: "f:other" }, categories), read(CATEGORY, null), read(CATEGORY, numbers)],
    [true, false, false, false],
  )
})

test("a vote is read once its positions are loaded", () => {
  assert.equal(readingOf({ kind: "vote" }, { drawn: [PA0], values: null, vote: null, seats }), null)
})

test("the room box is the svg viewBox and its pitch the distance between its two closest seats, empty ones included", () => {
  const seat = (number: string, x: number, y: number) => ({ number, x, y })
  const room = seatsOf(
    { deputies: [{ id: PA0, seat: seat("1", 0, 0) }, { id: PA1, seat: seat("2", 0.25, 0) }], emptySeats: [seat("3", 0.5, 0), seat("4", 0.5, 0.125)] },
    { viewBox: " -1.1,-1.1 2.2  1.5", markup: "<path/>" },
  )
  assert.deepEqual(room.box, { left: -1.1, top: -1.1, right: -1.1 + 2.2, bottom: -1.1 + 1.5 })
  assert.equal(room.pitch, 0.125)
  assert.equal(room.seatOf.get(PA1)?.number, "2")
  assert.equal(room.room, "<path/>")
})
