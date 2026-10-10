import type { DeputyId } from "../data/deputyId.ts"
import type { CategoryFeature, ColorableFeature, FeatureKey, FeatureStore, NumberFeature, ValueRow } from "../data/features.ts"

export type CategoryValues = {
  readonly kind: "category"
  readonly feature: CategoryFeature
  readonly valueOf: ReadonlyMap<DeputyId, string>
  readonly table: readonly ValueRow[]
}

export type NumberValues = {
  readonly kind: "number"
  readonly feature: NumberFeature
  readonly valueOf: ReadonlyMap<DeputyId, number>
}

export type FeatureValues = CategoryValues | NumberValues

export type FeatureCache = {
  peek: (feature: ColorableFeature) => FeatureValues | undefined
  load: (feature: ColorableFeature) => Promise<FeatureValues>
}

export function createFeatureCache(store: FeatureStore): FeatureCache {
  const loaded = new Map<FeatureKey, FeatureValues>()
  const pending = new Map<FeatureKey, Promise<FeatureValues>>()
  return {
    peek: feature => loaded.get(feature.key),
    load: feature => {
      const known = pending.get(feature.key)
      if (known) return known
      const promise = loadValues(store, feature).then(values => {
        loaded.set(feature.key, values)
        return values
      })
      pending.set(feature.key, promise)
      promise.catch(() => pending.delete(feature.key))
      return promise
    },
  }
}

async function loadValues(store: FeatureStore, feature: ColorableFeature): Promise<FeatureValues> {
  const values = await store.values(feature)
  switch (feature.kind) {
    case "category":
      return { kind: "category", feature, valueOf: values, table: await store.valuesTable(feature.values) }
    case "number":
      return { kind: "number", feature, valueOf: readNumbers(values) }
  }
}

export function readNumbers(values: ReadonlyMap<DeputyId, string>): ReadonlyMap<DeputyId, number> {
  const numbers = new Map<DeputyId, number>()
  for (const [id, text] of values) {
    const value = Number(text)
    if (Number.isFinite(value)) numbers.set(id, value)
  }
  return numbers
}
