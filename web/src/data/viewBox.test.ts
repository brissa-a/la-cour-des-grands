import assert from "node:assert/strict"
import { test } from "node:test"
import { parseViewBox, viewBoxAttribute, type ViewBox } from "./viewBox.ts"

// @ts-expect-error a box written by hand, whose size no reader checked before a fit divides by it
export const handMade: ViewBox = { x: 0, y: 0, width: 0, height: 1 }

test("a viewBox reads four numbers apart by spaces, commas or both, as svg writes them", () => {
  const room = { x: -1.1, y: -1.1, width: 2.2, height: 1.5 }
  assert.deepEqual(parseViewBox("-1.1 -1.1 2.2 1.5"), room)
  assert.deepEqual(parseViewBox(" -1.1,-1.1 , 2.2 \n 1.5 "), room)
  assert.deepEqual(parseViewBox("-12.5 +.25 1e12 25E-10"), { x: -12.5, y: 0.25, width: 1e12, height: 25e-10 })
})

test("a viewBox that is not exactly four finite numbers with a positive size is refused", () => {
  for (const text of ["", "0 0 1", "0 0 1 1 1", "0 0 1 a", "0,,1,1", "0 0 0x1 1", "0 0 Infinity 1", "0 0 1e999 1", "0 0 0 1", "0 0 1 0", "0 0 1 -1"])
    assert.equal(parseViewBox(text), null, text)
})

test("a viewBox written back for the svg element reads as the same box", () => {
  assert.equal(viewBoxAttribute(parseViewBox(" -1.1,-1.1 2.2  1.5") ?? assert.fail("viewBox")), "-1.1 -1.1 2.2 1.5")
})
