import { useRef, useState } from "react"
import type { Deputy } from "../data/assembly.ts"
import type { ColorableFeature, FeatureKey, FeatureStore } from "../data/features.ts"
import { buildColoring, type Coloring } from "./coloring.ts"

export function useColoring<C extends Coloring | null>(
  store: FeatureStore,
  features: ColorableFeature[],
  deputies: Deputy[],
  initial: C,
): [C | Coloring, (key: FeatureKey) => void] {
  const [coloring, setColoring] = useState<C | Coloring>(initial)
  const requested = useRef(initial?.key)

  const request = (key: FeatureKey) => {
    const source = features.find(f => f.key === key)
    if (!source) return
    requested.current = key
    buildColoring(store, source, deputies).then(
      built => requested.current === built.key && setColoring(built),
      (error: unknown) => console.error(error),
    )
  }

  return [coloring, request]
}
