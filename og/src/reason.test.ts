import assert from "node:assert/strict"
import { test } from "node:test"
import { reasonOf } from "./reason.ts"

test("a logged reason is the error's message, or says the thrown value was not an error", () => {
  assert.equal(reasonOf(new TypeError("fetch failed")), "fetch failed")
  assert.equal(reasonOf("fetch failed"), "unknown error")
})
