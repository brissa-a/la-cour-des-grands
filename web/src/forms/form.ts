import type { DeputyId } from "../data/deputyId.ts"
import type { Glyph } from "../glyph/glyph.ts"
import type { Rect } from "../preview/placement.ts"
import type { Data, Part, Point, Room, Seat, Shape } from "../sources/shapes.ts"

export const DOT_RADIUS = 0.019

export const NO_HOLLOW: ReadonlySet<DeputyId> = new Set()

export type Screen = "desktop" | "phone"

// From the approved mockups: the outcome at the heart of the arc is 26/21 of the half rings' counts.
export const HUB_PX: Readonly<Record<Screen, number>> = { desktop: 26, phone: 17 }

export type Frame = { readonly area: Rect; readonly px: number; readonly screen: Screen }

export type Order = (a: DeputyId, b: DeputyId) => number

export type Framing = { readonly kind: "unmeasured" } | { readonly kind: "cramped" } | { readonly kind: "fitted"; readonly frame: Frame }

export type Framed = { readonly frame: Frame }

export type Target = Framed & { readonly order: Order }

export type CardPolicy = "beside" | "above"

export type Anchor = "start" | "end"

export type Tone = "grid" | "base" | "leader"

export type Fit = { readonly scale: number; readonly offset: Point }

export type Lay =
  | { readonly kind: "flat"; readonly lineHeight: number }
  | { readonly kind: "slanted"; readonly degrees: number }
  | { readonly kind: "inline"; readonly anchor: Anchor; readonly gap: number; readonly textSize: number }

export type Mark =
  | { readonly kind: "room"; readonly room: Room; readonly empty: readonly Seat[]; readonly radius: number; readonly fit: Fit }
  | { readonly kind: "rule"; readonly from: Point; readonly to: Point; readonly tone: Tone }
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

export type Hub = { readonly box: Rect; readonly size: number }

export type Where = { readonly kind: "part"; readonly part: Part; readonly within: string } | { readonly kind: "seat"; readonly number: string }

export type Scene = {
  readonly card: CardPolicy
  readonly radius: number
  readonly snap: number
  readonly dots: ReadonlyMap<DeputyId, Point>
  readonly hollow: ReadonlySet<DeputyId>
  readonly marks: readonly Mark[]
  readonly hub: Hub | null
  readonly lines: readonly (readonly DeputyId[])[]
  readonly where: (id: DeputyId) => Where | null
}

export type Shapes<S extends Shape = Shape> = readonly [S, ...S[]]

export type ShapeIn<T> = T extends Shapes<infer S> ? S : never

export type Slots<S extends Shape = Shape> = { readonly main: Shapes<S> } & { readonly [slot: string]: Shapes<S> }

export type Inputs<X extends Slots> = { readonly [K in keyof X]: Data[ShapeIn<X[K]>] }

type Placer<X extends Slots> =
  | { readonly ordered: true; readonly place: (inputs: Inputs<X>, target: Target) => Scene }
  | { readonly ordered: false; readonly place: (inputs: Inputs<X>, target: Framed) => Scene }

export type FormSpec<X extends Slots> = { readonly label: string; readonly glyph: Glyph; readonly slots: X } & Placer<X>

export function defineForm<const X extends Slots<Exclude<Shape, "seats">>>(spec: FormSpec<X>): FormSpec<X> {
  return spec
}
