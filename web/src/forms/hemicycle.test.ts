import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { parseViewBox } from "../data/viewBox.ts"
import { step } from "../preview/neighbours.ts"
import type { Rect } from "../preview/placement.ts"
import { seatsOf } from "../sources/seats.ts"
import type { Frame } from "./form.ts"
import { placeHemicycle } from "./hemicycle.ts"

const arc = (radius: number, degrees: number) => {
  const angle = (degrees * Math.PI) / 180
  return { x: radius * Math.cos(angle), y: -radius * Math.sin(angle) }
}

const over = (area: Rect): { readonly frame: Frame } => ({ frame: { area, px: 0.002, screen: "desktop" } })

function lines(seats: Record<string, { x: number; y: number }>) {
  const deputies = Object.entries(seats).map(([id, point], i) => ({ id: deputyId(id), seat: { number: String(i), ...point } }))
  const box = parseViewBox("-1.1 -1.1 2.2 1.5") ?? assert.fail("viewBox")
  return placeHemicycle({ main: seatsOf({ deputies, emptySeats: [] }, { box, markup: "" }) }, over({ left: 0, top: 0, right: 0.66, bottom: 0.45 })).lines
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

const BOX = parseViewBox("-3 -3 4 2") ?? assert.fail("viewBox")

test("the hemicycle fits its room's box to the free area, filling the tighter side and centred on the other, room and empty seats through the same fit", () => {
  const empty = { number: "2", x: 0.1, y: -2.5 }
  const seats = seatsOf({ deputies: [{ id: id("a"), seat: { number: "1", x: -0.5, y: -1.5 } }], emptySeats: [empty] }, { box: BOX, markup: "<path/>" })
  const wide = placeHemicycle({ main: seats }, over({ left: 1, top: 1, right: 17, bottom: 5 }))
  assert.deepEqual(wide.dots.get(id("a")), { x: 10, y: 4 })
  assert.deepEqual(wide.marks, [{ kind: "room", room: "<path/>", empty: [empty], radius: 0.019, fit: { scale: 2, offset: { x: 11, y: 7 } } }])
  assert.deepEqual(wide.where(id("a")), { kind: "seat", number: "1" })
  const tall = placeHemicycle({ main: seats }, over({ left: 1, top: 1, right: 5, bottom: 17 }))
  assert.deepEqual(tall.dots.get(id("a")), { x: 3.5, y: 9.5 })
})

test("hemicycle dots and their pointer reach keep the size tuned at the room's own scale, and scale with the fit", () => {
  const seats = seatsOf({ deputies: [], emptySeats: [] }, { box: BOX, markup: "" })
  const reach = (area: Rect) => {
    const { radius, snap } = placeHemicycle({ main: seats }, over(area))
    return { radius: Math.round(radius * 1e6) / 1e6, snap: Math.round(snap * 1e6) / 1e6 }
  }
  assert.deepEqual(reach({ left: -3, top: -3, right: 1, bottom: -1 }), { radius: 0.019, snap: 0.03135 })
  assert.deepEqual(reach({ left: 1, top: 1, right: 17, bottom: 5 }), { radius: 0.038, snap: 0.0627 })
})
