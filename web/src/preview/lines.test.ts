import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { paintParts } from "../paint/palette.ts"
import { readingOf, readSeats } from "../sources/read.ts"
import { seatsOf } from "../sources/seats.ts"
import { colorLine, layoutLine, layoutPlace } from "./lines.ts"

const PA0 = deputyId("PA0")
const seats = seatsOf({ deputies: [{ id: PA0, seat: { number: "1", x: 0, y: 0 } }], emptySeats: [] }, { viewBox: "0 0 1 1", markup: "" })
const category = (key: `${string}:${string}`): CategoryFeature => ({ kind: "category", key, file: "f", column: "c", title: "T", values: "v" })
const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "f", column: "age", title: "Âge" }

function read(feature: CategoryFeature) {
  const values = { kind: "category" as const, feature, valueOf: new Map([[PA0, "a"]]), table: [{ value: "a", label: "A", short: undefined, color: "#123" }] }
  const reading = readingOf(feature, { drawn: [PA0], values, vote: null, seats })
  assert.ok(reading && "nominal" in reading.data)
  return { reading, paint: paintParts(reading.data.nominal) }
}

test("the card gives the colour value with its dot, unless the card header already shows that feature", () => {
  assert.deepEqual(colorLine(read(category("f:c")), PA0), { label: "A", caption: null, missing: false, color: "#123" })
  assert.equal(colorLine(read(category("deputies/init.csv:group")), PA0), null)
})

test("the layout value is given only when the layout groups by another feature than the colour, and never for the room", () => {
  const colored = read(category("f:c"))
  const values = { kind: "number" as const, feature: AGE, valueOf: new Map([[PA0, 57]]) }
  const age = readingOf(AGE, { drawn: [PA0], values, vote: null, seats })
  assert.ok(age)
  assert.deepEqual(layoutLine(age, colored, PA0), { label: "57 ans", caption: null, missing: false })
  assert.equal(layoutLine(colored.reading, colored, PA0), null)
  assert.equal(layoutLine(readSeats(seats), colored, PA0), null)
  assert.equal(layoutLine(read(category("deputies/init.csv:department")).reading, colored, PA0), null)
  const part = { kind: "part" as const, part: { key: "a", label: "A", title: "A", caption: null, color: "", members: [PA0] }, within: "la colonne" }
  assert.equal(layoutPlace(age, colored, part), part)
  assert.equal(layoutPlace(colored.reading, colored, part), null)
  assert.equal(layoutPlace(age, colored, { kind: "seat", number: "1" }), null)
})
