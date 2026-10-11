import { useEffect, useRef, useState } from "react"
import type { ColorableFeature, FeatureKey } from "../data/features.ts"
import type { Source } from "./shapes.ts"
import type { FeatureCache, FeatureValues } from "./values.ts"

export function featuresOf(sources: readonly Source[]): ColorableFeature[] {
  return sources.flatMap(source => {
    switch (source.kind) {
      case "category":
      case "number":
        return [source]
      case "vote":
      case "seat":
        return []
    }
  })
}

export function useFeatureValues(cache: FeatureCache, features: readonly ColorableFeature[]): ReadonlyMap<FeatureKey, FeatureValues> {
  const [, setLoads] = useState(0)
  const keys = features.map(feature => feature.key).join("\n")
  const last = useRef<ReadonlyMap<FeatureKey, FeatureValues>>(new Map())
  last.current = loadedValues(cache, features, last.current)

  useEffect(() => loadMissing(cache, features, () => setLoads(count => count + 1)), [cache, keys])

  return last.current
}

export function loadMissing(cache: FeatureCache, features: readonly ColorableFeature[], loaded: () => void): () => void {
  let current = true
  for (const feature of features)
    if (!cache.peek(feature))
      cache.load(feature).then(
        () => current && loaded(),
        (error: unknown) => console.error(error),
      )
  return () => {
    current = false
  }
}

export function loadedValues(
  cache: Pick<FeatureCache, "peek">,
  features: readonly ColorableFeature[],
  last: ReadonlyMap<FeatureKey, FeatureValues>,
): ReadonlyMap<FeatureKey, FeatureValues> {
  const loaded = features.flatMap((feature): [FeatureKey, FeatureValues][] => {
    const values = cache.peek(feature)
    return values ? [[feature.key, values]] : []
  })
  return loaded.length === last.size && loaded.every(([key, values]) => last.get(key) === values) ? last : new Map(loaded)
}
