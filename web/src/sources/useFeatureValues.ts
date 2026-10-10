import { useEffect, useState } from "react"
import type { ColorableFeature } from "../data/features.ts"
import type { Source } from "./shapes.ts"
import type { FeatureCache, FeatureValues } from "./values.ts"

export function featureOf(source: Source): ColorableFeature | null {
  switch (source.kind) {
    case "category":
    case "number":
      return source
    case "vote":
    case "seat":
      return null
  }
}

export function useFeatureValues(cache: FeatureCache, feature: ColorableFeature | null): FeatureValues | null {
  const [, setLoaded] = useState(0)
  const ready = feature && cache.peek(feature)

  useEffect(() => {
    if (feature === null || cache.peek(feature)) return
    let current = true
    cache.load(feature).then(
      () => current && setLoaded(count => count + 1),
      (error: unknown) => console.error(error),
    )
    return () => {
      current = false
    }
  }, [cache, feature])

  return ready ?? null
}
