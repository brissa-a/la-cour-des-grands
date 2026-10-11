import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { labelAttributes, nameAttributes, RULE_CLASS } from "./markAttributes.ts"

const AT = { x: 0.4, y: -0.2 }

test("an inline label runs from its point on the side its anchor names and is centred on it vertically, as half-rings measure its box", () => {
  assert.deepEqual(labelAttributes(AT, { kind: "inline", anchor: "start", gap: 0.01, textSize: 0.025 }), { textAnchor: "start", dominantBaseline: "middle" })
  assert.deepEqual(labelAttributes(AT, { kind: "inline", anchor: "end", gap: 0.01, textSize: 0.025 }), { textAnchor: "end", dominantBaseline: "middle" })
})

test("a slanted label ends at its point and turns about it, so its end stays under its column", () => {
  assert.deepEqual(labelAttributes(AT, { kind: "slanted", degrees: 45 }), { textAnchor: "end", transform: "rotate(-45 0.4 -0.2)" })
})

test("a flat label is centred on its point", () => {
  assert.deepEqual(labelAttributes(AT, { kind: "flat", lineHeight: 0.03 }), { textAnchor: "middle" })
})

test("an inline label's name follows its count after the gap its lay gives, in the name's own size", () => {
  assert.deepEqual(nameAttributes(AT, { kind: "inline", anchor: "end", gap: 0.01, textSize: 0.025 }), { dx: 0.01, style: { fontSize: 0.025 } })
})

test("a flat label's name goes one line below its count, back under its point", () => {
  assert.deepEqual(nameAttributes(AT, { kind: "flat", lineHeight: 0.03 }), { x: 0.4, dy: 0.03 })
})

test("a slanted label's name has no span of its own, so it follows its count after a space, in the same size and turn", () => {
  assert.equal(nameAttributes(AT, { kind: "slanted", degrees: 45 }), null)
})

test("the base line and the leaders each have a class that the stylesheet styles inside the chart, so neither falls back to a grid line", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8")
  const classes = [RULE_CLASS.base, RULE_CLASS.leader]
  assert.equal(new Set(classes).size, classes.length)
  for (const name of classes) assert.ok(name && css.includes(`.chart-axes .${name} {`), String(name))
})
