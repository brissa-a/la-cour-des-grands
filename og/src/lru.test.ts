import assert from "node:assert/strict"
import { test } from "node:test"
import { sizedLru } from "./lru.ts"

test("eviction takes the preferred entries first, each group from the least recently used, and stops once under the bound", () => {
  const lru = sizedLru<string>()
  for (const key of ["new-a", "old-a", "new-b", "old-b"]) lru.set(key, 10)
  lru.touch("old-a")
  assert.deepEqual(lru.evict(30, key => key.startsWith("old")), ["old-b"])
  assert.deepEqual(lru.evict(10, key => key.startsWith("old")), ["old-a", "new-a"])
  assert.deepEqual(lru.evict(10, () => false), [])
  assert.equal(lru.bytes(), 10)
})

test("an entry set again counts once, at its new size, and becomes the most recent", () => {
  const lru = sizedLru<string>()
  lru.set("a", 10)
  lru.set("b", 10)
  lru.set("a", 4)
  assert.equal(lru.bytes(), 14)
  assert.deepEqual(lru.evict(4, () => false), ["b"])
})

test("touching an entry keeps its size and moves it last; touching or deleting an unknown one changes nothing", () => {
  const lru = sizedLru<string>()
  lru.set("a", 10)
  lru.set("b", 5)
  lru.touch("a")
  lru.touch("missing")
  lru.delete("missing")
  assert.equal(lru.bytes(), 15)
  assert.deepEqual(lru.evict(10, () => false), ["b"])
  lru.deleteWhere(key => key === "a")
  assert.equal(lru.bytes(), 0)
})
