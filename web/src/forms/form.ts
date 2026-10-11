import type { DeputyId } from "../data/deputyId.ts"
import type { Rect } from "../preview/placement.ts"
import type { Data, Part, Point, Room, Seat, Shape } from "../sources/shapes.ts"

export const DOT_RADIUS = 0.019

export const NO_HOLLOW: ReadonlySet<DeputyId> = new Set()

export type Frame = { readonly area: Rect; readonly px: number }

export type Order = (a: DeputyId, b: DeputyId) => number

export type Target = { readonly frame: Frame; readonly order: Order }

export type CardPolicy = "beside" | "above"

export type Anchor = "start" | "end"

export type Lay =
  | { readonly kind: "flat"; readonly lineHeight: number }
  | { readonly kind: "slanted"; readonly degrees: number }
  | { readonly kind: "inline"; readonly anchor: Anchor }

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
  readonly radius: number
  readonly snap: number
  readonly dots: ReadonlyMap<DeputyId, Point>
  readonly hollow: ReadonlySet<DeputyId>
  readonly marks: readonly Mark[]
  readonly lines: readonly (readonly DeputyId[])[]
  readonly where: (id: DeputyId) => Where | null
}

export type Shapes<S extends Shape = Shape> = readonly [S, ...S[]]

export type ShapeIn<T> = T extends Shapes<infer S> ? S : never

export type Slots<S extends Shape = Shape> = { readonly main: Shapes<S> } & { readonly [slot: string]: Shapes<S> }

export type Inputs<X extends Slots> = { readonly [K in keyof X]: Data[ShapeIn<X[K]>] }

export type FormSpec<X extends Slots> = {
  readonly label: string
  readonly slots: X
  readonly place: (inputs: Inputs<X>, target: Target) => Scene
}

export function defineForm<const X extends Slots<Exclude<Shape, "seats">>>(spec: FormSpec<X>): FormSpec<X> {
  return spec
}
