import assert from "node:assert/strict"
import { test } from "node:test"
import { textEm } from "./text.ts"

const widths = (chars: readonly string[]) => chars.map(textEm)

test("each kind of character takes its class's width, and a text is as wide as its characters together", () => {
  assert.deepEqual(widths([" ", ".", ",", "-", "’", "'", "i", "f", "l"]), [0.3, 0.48, 0.48, 0.48, 0.48, 0.48, 0.48, 0.48, 0.48])
  assert.deepEqual(widths(["m", "w", "M", "W", "&"]), [1, 1, 1, 1, 1])
  assert.deepEqual(widths(["0", "4", "5", "9"]), [0.68, 0.68, 0.68, 0.68])
  assert.deepEqual(widths(["a", "o", "é", "z"]), [0.62, 0.62, 0.62, 0.62])
  assert.deepEqual(widths(["A", "P", "É", "Z"]), [0.78, 0.78, 0.78, 0.78])
  assert.equal(textEm("12 Pour"), 0.68 + 0.68 + 0.3 + 0.78 + 0.62 + 0.62 + 0.48)
})

test("punctuation outside the narrow class, on either side of the digits, is measured as a lowercase letter rather than a digit", () => {
  assert.deepEqual(widths(["(", "/", "!", "?", "@"]), [0.62, 0.62, 0.62, 0.62, 0.62])
})
