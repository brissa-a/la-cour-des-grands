import type { DeputyId } from "../data/deputyId.ts"
import type { Rect } from "../preview/placement.ts"
import type { Data, Part, Point, Room, Seat, Shape } from "../sources/shapes.ts"

export const DOT_RADIUS = 0.019

export type Frame = { readonly area: Rect; readonly px: number }

export type Order = (a: DeputyId, b: DeputyId) => number

export type Target = { readonly frame: Frame; readonly order: Order }

export type CardPolicy = "beside" | "above"

export type Lay = { readonly kind: "flat"; readonly lineHeight: number } | { readonly kind: "slanted"; readonly degrees: number }

export type Mark =
  | { readonly kind: "room"; readonly room: Room; readonly empty: readonly Seat[]; readonly radius: number }
  | { readonly kind: "rule"; readonly from: Point; readonly to: Point; readonly tone: "grid" | "base" }
  | { readonly kind: "tick"; readonly at: Point; readonly text: string; readonly size: number }
  | {
      readonly kind: "label"
      readonly at: Point
      readonly count: number
      readonly text: string
      readonly title: string
      readonly size: number
      readonly lay: Lay
    }

export type Where = { readonly kind: "part"; readonly part: Part; readonly within: string } | { readonly kind: "seat"; readonly number: string }

export type Scene = {
  readonly card: CardPolicy
  readonly box: Rect
  readonly pitch: number
  readonly radius: number
  readonly snap: number
  readonly dots: ReadonlyMap<DeputyId, Point>
  readonly marks: readonly Mark[]
  readonly lines: readonly (readonly DeputyId[])[]
  readonly where: (id: DeputyId) => Where | null
}

export type FormSpec<S extends Shape> = {
  readonly label: string
  readonly shapes: readonly [S, ...S[]]
  readonly place: (input: Data[S], target: Target) => Scene
}

export function defineForm<const S extends Shape>(spec: FormSpec<S>): FormSpec<S> {
  return spec
}
