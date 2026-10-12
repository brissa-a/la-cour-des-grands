import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { parseViewBox } from "../data/viewBox.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import type { Point } from "../sources/shapes.ts"
import { seatsOf } from "../sources/seats.ts"
import { labelAttributes, nameAttributes, roomAttributes, RULE_CLASS, type RoomMark } from "./markAttributes.ts"

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

function transformed(css: string, point: Point): Point {
  const steps = [...css.matchAll(/(translate|scale)\(([^)]*)\)/g)].map(([, kind = "", args = ""]) => {
    const [a = NaN, b = a] = args.split(",").map(arg => Number.parseFloat(arg))
    return kind === "translate" ? (p: Point) => ({ x: p.x + a, y: p.y + b }) : (p: Point) => ({ x: p.x * a, y: p.y * b })
  })
  return steps.reduceRight((p, step) => step(p), point)
}

test("the room's outline and empty seats, drawn through its fit, land on the dots placed for the same seats, at the dots' size", () => {
  const box = parseViewBox("-3 -3 4 2") ?? assert.fail("viewBox")
  const seat = { number: "1", x: -0.5, y: -1.5 }
  const seats = seatsOf({ deputies: [{ id: deputyId("a"), seat }], emptySeats: [] }, { box, markup: "" })
  const scene = placeHemicycle({ main: seats }, { frame: { area: { left: 1, top: 1, right: 17, bottom: 5 }, px: 0.01, screen: "desktop" } })
  const room = scene.marks.find((mark): mark is RoomMark => mark.kind === "room") ?? assert.fail("room")
  const scale = 100
  const drawn = roomAttributes(room, scale)
  const onScreen = (point: Point) => transformed(drawn.room, transformed(drawn.fit, point))
  const { cx, cy, r } = drawn.seat(seat)
  const center = onScreen({ x: cx, y: cy })
  const outline = onScreen(transformed(drawn.background, seat))
  const dot = scene.dots.get(deputyId("a")) ?? assert.fail("dot")
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
  assert.ok(near(center.x, dot.x) && near(center.y, dot.y), JSON.stringify({ center, dot }))
  assert.ok(near(outline.x, dot.x) && near(outline.y, dot.y), JSON.stringify({ outline, dot }))
  assert.ok(near(onScreen({ x: cx + r, y: cy }).x - center.x, scene.radius))
})
