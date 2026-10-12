import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import type { CategoryFeature, FeatureStore, NumberFeature, ValueRow } from "../data/features.ts"
import { createFeatureCache, readNumbers } from "./values.ts"

const AGE: NumberFeature = { kind: "number", key: "f:age", file: "f", column: "age", title: "Âge" }
const GROUP: CategoryFeature = { kind: "category", key: "f:group", file: "f", column: "group", title: "Groupe", values: "v" }

test("numbers are read once from their text, and a text that is not a finite number counts as no value", () => {
  const read = readNumbers(new Map([[deputyId("PA0"), "57"], [deputyId("PA1"), "57.5"], [deputyId("PA2"), "abc"], [deputyId("PA3"), "Infinity"]]))
  assert.deepEqual([...read], [[deputyId("PA0"), 57], [deputyId("PA1"), 57.5]])
})

test("a category's values come with its own values table, and a number's values are read as numbers", async () => {
  const groups: ValueRow[] = [{ value: "RN", label: "Rassemblement national", short: "RN", color: "#0d378a" }]
  const store: FeatureStore = {
    values: feature => Promise.resolve(new Map([[deputyId("PA0"), feature.kind === "number" ? "40" : "RN"]])),
    valuesTable: path => Promise.resolve(path === GROUP.values ? groups : []),
  }
  const cache = createFeatureCache(store)
  assert.deepEqual(await cache.load(GROUP), { kind: "category", feature: GROUP, valueOf: new Map([[deputyId("PA0"), "RN"]]), table: groups })
  assert.deepEqual(await cache.load(AGE), { kind: "number", feature: AGE, valueOf: new Map([[deputyId("PA0"), 40]]) })
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

test("a feature is told failed from the moment its load fails, before its caller hears of it, until it is tried again", async () => {
  let fail = true
  const store: FeatureStore = {
    values: () => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(new Map())),
    valuesTable: () => Promise.resolve([]),
  }
  const cache = createFeatureCache(store)
  assert.equal(cache.failed(AGE), false)
  const toldOnFailure = await cache.load(AGE).then(
    () => null,
    () => cache.failed(AGE),
  )
  assert.equal(toldOnFailure, true)
  assert.equal(cache.failed(GROUP), false)
  fail = false
  const retry = cache.load(AGE)
  assert.equal(cache.failed(AGE), false)
  await retry
  assert.equal(cache.failed(AGE), false)
})
