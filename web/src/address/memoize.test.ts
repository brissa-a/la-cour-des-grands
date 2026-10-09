import assert from "node:assert/strict"
import { test } from "node:test"
import { memoize } from "./memoize.ts"

test("a load is shared while it lives and retried once it has failed", async () => {
  let attempts = 0
  const load = memoize(async (key: string) => {
    attempts++
    if (attempts === 1) throw new Error("offline")
    return `${key} ${attempts}`
  })
  await assert.rejects(load("a"))
  const pending = load("a")
  assert.equal(load("a"), pending)
  assert.equal(await pending, "a 2")
  assert.equal(await load("a"), "a 2")
  assert.equal(await load("b"), "b 3")
})
