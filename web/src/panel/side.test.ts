import assert from "node:assert/strict"
import { test } from "node:test"
import { besideSheet, toggled } from "./side.ts"

test("a panel folded to make room for the deputy sheet unfolds when the sheet closes, while one the reader folded stays folded", () => {
  assert.equal(besideSheet("open", true, true), "yielded")
  assert.equal(besideSheet("yielded", false, true), "open")
  assert.equal(besideSheet("yielded", true, false), "open")
  assert.equal(besideSheet("open", true, false), "open")
  assert.equal(besideSheet("folded", true, true), "folded")
  assert.equal(besideSheet("folded", false, true), "folded")
  assert.equal(besideSheet("yielded", true, true), "yielded")
})

test("the fold button opens a folded or yielded panel and folds an open one", () => {
  assert.deepEqual([toggled("open"), toggled("folded"), toggled("yielded")], ["folded", "open", "open"])
})
