import type { DeputyId } from "../data/deputyId.ts"
import type { ColoredPart, Data, Shape } from "../sources/shapes.ts"

export const LAST = Number.MAX_SAFE_INTEGER

export type Tick = { readonly value: number; readonly ratio: number }

export type Legend =
  | { readonly kind: "swatches"; readonly title: string; readonly swatches: readonly ColoredPart[]; readonly keyOf: (id: DeputyId) => string }
  | {
      readonly kind: "ramp"
      readonly title: string
      readonly unit: string
      readonly gradient: readonly [string, string]
      readonly min: number
      readonly max: number
      readonly mean: number
      readonly ticks: readonly Tick[]
      readonly missing: number
      readonly valueOf: (id: DeputyId) => number | null
    }

export type Paint = {
  readonly colorOf: (id: DeputyId) => string
  readonly rank: (id: DeputyId) => number
  readonly legend: Legend
}

export type PaintSpec<S extends Shape> = {
  readonly label: string
  readonly shapes: readonly [S, ...S[]]
  readonly paint: (input: Data[S]) => Paint
}

export function definePaint<const S extends Shape>(spec: PaintSpec<S>): PaintSpec<S> {
  return spec
}
