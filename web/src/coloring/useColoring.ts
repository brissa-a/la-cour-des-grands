import { useEffect, useRef, useState } from "react"
import type { Deputy } from "../data/assembly.ts"
import type { ColorableFeature, FeatureKey, FeatureStore } from "../data/features.ts"
import { buildColoring, type FeatureColoring } from "./coloring.ts"

export function useColoring<C extends FeatureColoring | null>(
  store: FeatureStore,
  features: ColorableFeature[],
  deputies: readonly Deputy[],
  initial: C,
): [C | FeatureColoring, (key: FeatureKey) => void] {
  const [coloring, setColoring] = useState<C | FeatureColoring>(initial)
  const wanted = useRef<FeatureKey | null>(initial?.key ?? null)
  const latest = useRef(0)
  const counted = useRef(deputies)

  const build = (key: FeatureKey, over: readonly Deputy[]) => {
    const source = features.find(f => f.key === key)
    if (!source) return
    wanted.current = key
    const request = ++latest.current
    buildColoring(store, source, over).then(
      built => request === latest.current && setColoring(built),
      (error: unknown) => console.error(error),
    )
  }

  useEffect(() => {
    if (counted.current === deputies) return
    counted.current = deputies
    if (wanted.current !== null) build(wanted.current, deputies)
  }, [deputies])

  return [coloring, key => build(key, deputies)]
}
