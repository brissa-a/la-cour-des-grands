import assert from "node:assert/strict"
import { test } from "node:test"
import { labelAttributes } from "./markAttributes.ts"

const AT = { x: 0.4, y: -0.2 }

test("an inline label runs from its point on the side its anchor names and is centred on it vertically, as half-rings measure its box", () => {
  assert.deepEqual(labelAttributes(AT, { kind: "inline", anchor: "start" }), { textAnchor: "start", dominantBaseline: "middle" })
  assert.deepEqual(labelAttributes(AT, { kind: "inline", anchor: "end" }), { textAnchor: "end", dominantBaseline: "middle" })
})

test("a slanted label ends at its point and turns about it, so its end stays under its column", () => {
  assert.deepEqual(labelAttributes(AT, { kind: "slanted", degrees: 45 }), { textAnchor: "end", transform: "rotate(-45 0.4 -0.2)" })
})

test("a flat label is centred on its point", () => {
  assert.deepEqual(labelAttributes(AT, { kind: "flat", lineHeight: 0.03 }), { textAnchor: "middle" })
})
