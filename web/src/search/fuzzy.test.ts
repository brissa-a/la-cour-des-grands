import assert from "node:assert/strict"
import { test } from "node:test"
import { FuzzyIndex } from "./fuzzy.ts"

function index() {
  const idx = new FuzzyIndex<string, string>()
  idx.add("a", "name", "Mélenchon")
  idx.add("b", "name", "Bourg-en-Bresse (01000)")
  idx.add("c", "name", "Paris 1er Arrondissement (75001)")
  idx.add("d", "name", "Rouen (76001)")
  return idx
}

test("tolerates typos and accents", () => {
  assert.equal(index().search("melanchon")[0]?.ref, "a")
})

test("matches word prefixes", () => {
  assert.equal(index().search("bour")[0]?.ref, "b")
})

test("codes match by exact prefix only", () => {
  assert.deepEqual(index().search("75001").map(r => r.ref), ["c"])
  assert.deepEqual(index().search("7600").map(r => r.ref), ["d"])
})

test("token slices point into the original value", () => {
  const [result] = index().search("bresse")
  const token = result?.matches[0]?.token
  assert.equal(token && token.value.slice(...token.slice), "Bresse")
})

test("words of a query add up", () => {
  const idx = new FuzzyIndex<string, string>()
  idx.add("x", "name", "Anne Martin")
  idx.add("y", "name", "Anne Durand")
  assert.equal(idx.search("anne durand")[0]?.ref, "y")
})
