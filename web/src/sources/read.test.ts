import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { isoDate } from "../data/isoDate.ts"
import { voteId } from "../votes/voteId.ts"
import { readingOf } from "./read.ts"
import { seatsOf } from "./seats.ts"
import { MISSING, VOTE } from "./shapes.ts"

const PA0 = deputyId("PA0")
const PA1 = deputyId("PA1")
const seats = seatsOf({ deputies: [], emptySeats: [] }, { viewBox: "0 0 1 1", markup: "" })
const number = (key: `${string}:${string}`): NumberFeature => ({ kind: "number", key, file: "f", column: "c", title: "Titre" })
const CATEGORY: CategoryFeature = { kind: "category", key: "f:c", file: "f", column: "c", title: "Titre", values: "v" }

function lines(feature: NumberFeature) {
  const values = { kind: "number" as const, feature, valueOf: new Map([[PA0, 57.25]]) }
  const reading = readingOf(feature, { drawn: [PA0, PA1], values: new Map([[feature.key, values]]), vote: null, seats })
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
  const category = readingOf(CATEGORY, { drawn: [PA0, PA1], values: new Map([[CATEGORY.key, values]]), vote: null, seats })
  assert.deepEqual([category?.lineOf(PA0), category?.lineOf(PA1), category?.lineOf(PA2)], [
    { label: "Bravo", caption: null, missing: false },
    { label: "Non renseigné", caption: "Titre", missing: true },
    { label: "a", caption: null, missing: false },
  ])
})

test("a feature is read only from values loaded under its key and of its kind", () => {
  const numbers = { kind: "number" as const, feature: number("f:c"), valueOf: new Map([[PA0, 1]]) }
  const categories = { kind: "category" as const, feature: CATEGORY, valueOf: new Map([[PA0, "a"]]), table: [] }
  const read = (feature: NumberFeature | CategoryFeature, values: typeof numbers | typeof categories | null) =>
    readingOf(feature, { drawn: [PA0], values: new Map(values ? [["f:c", values]] : []), vote: null, seats }) !== null
  assert.deepEqual(
    [read(number("f:c"), numbers), read(number("f:other"), numbers), read(number("f:c"), null), read(number("f:c"), categories)],
    [true, false, false, false],
  )
  assert.deepEqual(
    [read(CATEGORY, categories), read({ ...CATEGORY, key: "f:other" }, categories), read(CATEGORY, null), read(CATEGORY, numbers)],
    [true, false, false, false],
  )
})

test("a vote is read once its positions are loaded, each drawn deputy by their position", () => {
  assert.equal(readingOf(VOTE, { drawn: [PA0], values: new Map(), vote: null, seats }), null)
  const id = voteId("VTANR5L17V1")
  const date = isoDate("2024-10-08")
  assert.ok(id && date)
  const vote = { id, number: 1, date, title: "t", kind: "ordinary" as const, result: "adopted" as const, major: true, bill: null, file: "f", url: "u" }
  const label = { for: "Pour", against: "Contre", abstain: "Abstention", not_voting: "Non-votant", absent: "Absent" }
  const positions = new Map([[PA0, "for" as const]])
  const loaded = { vote, table: { order: ["for", "against"] as const, label }, reading: { roster: new Map(), positions, tally: { for: 1, against: 0, abstain: 0, not_voting: 0, absent: 0 } } }
  const reading = readingOf(VOTE, { drawn: [PA0, PA1], values: new Map(), vote: loaded, seats })
  assert.ok(reading && "nominal" in reading.data)
  assert.deepEqual(reading.data.nominal.parts.map(part => [part.key, part.members]), [["for", [PA0]], [MISSING, [PA1]]])
  assert.deepEqual([reading.lineOf(PA0), reading.lineOf(PA1)], [
    { label: "Pour", caption: null, missing: false },
    { label: "Non renseigné", caption: "Scrutin n° 1", missing: true },
  ])
})
