import assert from "node:assert/strict"
import { test } from "node:test"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { SEAT, VOTE } from "./shapes.ts"
import { featuresOf, loadedValues, loadMissing } from "./useFeatureValues.ts"
import type { FeatureCache, FeatureValues } from "./values.ts"

const AGE: NumberFeature = { kind: "number", key: "f:age", file: "f", column: "age", title: "Âge" }
const GROUP: CategoryFeature = { kind: "category", key: "f:group", file: "f", column: "group", title: "Groupe", values: "v" }

test("loaded values keep the same map until one is loaded, dropped or replaced, so no reading is redone for nothing", () => {
  const loaded = new Map<string, FeatureValues>()
  const cache = { peek: (feature: NumberFeature | CategoryFeature) => loaded.get(feature.key) }
  const none = loadedValues(cache, [AGE], new Map())
  assert.equal(loadedValues(cache, [AGE], none), none)
  const ages: FeatureValues = { kind: "number", feature: AGE, valueOf: new Map() }
  loaded.set(AGE.key, ages)
  const withAges = loadedValues(cache, [AGE], none)
  assert.deepEqual([...withAges], [[AGE.key, ages]])
  assert.equal(loadedValues(cache, [AGE], withAges), withAges)
  loaded.set(GROUP.key, { kind: "category", feature: GROUP, valueOf: new Map(), table: [] })
  assert.deepEqual([...loadedValues(cache, [GROUP], withAges).keys()], [GROUP.key])
  assert.equal(loadedValues(cache, [], withAges).size, 0)
  const newer: FeatureValues = { kind: "number", feature: AGE, valueOf: new Map() }
  loaded.set(AGE.key, newer)
  assert.equal(loadedValues(cache, [AGE], withAges).get(AGE.key), newer)
})

test("only feature sources have values to load; the vote and the seats come with their own data", () => {
  assert.deepEqual(featuresOf([GROUP, VOTE, AGE, SEAT]), [GROUP, AGE])
})

test("only features not loaded yet are fetched, and a fetch that lands after the view moved on asks for no new reading", async () => {
  const ages: FeatureValues = { kind: "number", feature: AGE, valueOf: new Map() }
  const groups: FeatureValues = { kind: "category", feature: GROUP, valueOf: new Map(), table: [] }
  const fetched: string[] = []
  const landing: ((values: FeatureValues) => void)[] = []
  const cache: FeatureCache = {
    peek: feature => (feature.key === AGE.key ? ages : undefined),
    load: feature => {
      fetched.push(feature.key)
      return new Promise(resolve => landing.push(resolve))
    },
  }
  const settled = () => new Promise(resolve => setImmediate(resolve))
  let readings = 0
  loadMissing(cache, [AGE, GROUP], () => readings++)
  assert.deepEqual(fetched, [GROUP.key])
  landing.shift()?.(groups)
  await settled()
  assert.equal(readings, 1)
  const movedOn = loadMissing(cache, [GROUP], () => readings++)
  movedOn()
  landing.shift()?.(groups)
  await settled()
  assert.equal(readings, 1)
})
