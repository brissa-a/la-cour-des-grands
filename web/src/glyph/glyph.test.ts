import assert from "node:assert/strict"
import { test } from "node:test"
import { dots, each, type GlyphPart } from "./glyph.ts"

// @ts-expect-error a stroke whose path does not start where it draws, such as an empty one that draws nothing
export const blank: GlyphPart = { kind: "stroke", d: "", width: 1, opacity: 1 }

test("a glyph drawn from pairs keeps one part per pair, in their order, the first one included", () => {
  assert.deepEqual(dots(1.5, [[1, 2], [3, 4]]), [
    { kind: "dot", x: 1, y: 2, r: 1.5 },
    { kind: "dot", x: 3, y: 4, r: 1.5 },
  ])
  assert.deepEqual(each([[5, 0.5]], ([x, opacity]) => ({ kind: "block", x, y: 0, width: 1, height: 1, round: 0, opacity })), [
    { kind: "block", x: 5, y: 0, width: 1, height: 1, round: 0, opacity: 0.5 },
  ])
})
