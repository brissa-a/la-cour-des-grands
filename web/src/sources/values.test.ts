import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import type { FeatureStore, NumberFeature } from "../data/features.ts"
import { createFeatureCache, readNumbers } from "./values.ts"

const AGE: NumberFeature = { kind: "number", key: "f:age", file: "f", column: "age", title: "Âge" }

test("numbers are read once from their text, and a text that is not a finite number counts as no value", () => {
  const read = readNumbers(new Map([[deputyId("PA0"), "57"], [deputyId("PA1"), "57.5"], [deputyId("PA2"), "abc"], [deputyId("PA3"), "Infinity"]]))
  assert.deepEqual([...read], [[deputyId("PA0"), 57], [deputyId("PA1"), 57.5]])
})

test("a feature's values load once, are kept for synchronous reads, and a failed load is tried again", async () => {
  let calls = 0
  let fail = true
  const store: FeatureStore = {
    values: () => {
      calls++
      return fail ? Promise.reject(new Error("offline")) : Promise.resolve(new Map([[deputyId("PA0"), "40"]]))
    },
    valuesTable: () => Promise.resolve([]),
  }
  const cache = createFeatureCache(store)
  await assert.rejects(cache.load(AGE))
  assert.equal(cache.peek(AGE), undefined)
  fail = false
  const [first, second] = await Promise.all([cache.load(AGE), cache.load(AGE)])
  assert.equal(first, second)
  assert.equal(calls, 2)
  assert.equal(cache.peek(AGE), first)
})
