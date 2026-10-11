import assert from "node:assert/strict"
import { test } from "node:test"
import { step } from "./neighbours.ts"

test("an arrow moves along the line of the deputy it starts from, and stops at the line's ends", () => {
  const lines = [["a", "b"], ["c", "d", "e"]]
  assert.deepEqual([step(lines, "d", "left"), step(lines, "d", "right")], ["c", "e"])
  assert.deepEqual([step(lines, "c", "left"), step(lines, "e", "right"), step(lines, "z", "right")], [null, null, null])
})
