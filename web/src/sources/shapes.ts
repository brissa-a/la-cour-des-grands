import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { Rect } from "../preview/placement.ts"

export const MISSING = ""

export const NOT_GIVEN = "Non renseigné"

export type Point = { readonly x: number; readonly y: number }

export type Line = { readonly label: string; readonly caption: string | null; readonly missing: boolean }

export type Part = {
  readonly key: string
  readonly label: string
  readonly title: string
  readonly caption: string | null
  readonly color: string
  readonly members: readonly DeputyId[]
}

export type Parts = {
  readonly title: string
  readonly parts: readonly Part[]
  readonly keyOf: (id: DeputyId) => string
  readonly colorOf: (id: DeputyId) => string
}

export type Numbers = {
  readonly feature: NumberFeature
  readonly unit: string
  readonly drawn: readonly DeputyId[]
  readonly valueOf: (id: DeputyId) => number | null
}

export type Room = string & { readonly __brand: "Room" }

export type Seat = Point & { readonly number: string }

export type Seats = {
  readonly seatOf: ReadonlyMap<DeputyId, Seat>
  readonly empty: readonly Seat[]
  readonly room: Room
  readonly box: Rect
  readonly pitch: number
}

export type Data = {
  readonly nominal: Parts
  readonly ordinal: Parts
  readonly numbers: Numbers
  readonly seats: Seats
}

export type Shape = keyof Data

export type VoteSource = { readonly kind: "vote" }

export type SeatSource = { readonly kind: "seat" }

export type Source = CategoryFeature | NumberFeature | VoteSource | SeatSource

export type SourceKind = Source["kind"]

export const OFFERS = {
  category: ["nominal"],
  number: ["ordinal", "numbers"],
  vote: ["nominal"],
  seat: ["seats"],
} as const satisfies Readonly<Record<SourceKind, readonly Shape[]>>

type KindsFor<S extends Shape> = { [K in SourceKind]: [(typeof OFFERS)[K][number] & S] extends [never] ? never : K }[SourceKind]

export type SourceOf<K extends SourceKind> = Extract<Source, { readonly kind: K }>

export type SourceFor<S extends Shape> = SourceOf<KindsFor<S>>

export type Offered<K extends SourceKind> = { readonly [S in (typeof OFFERS)[K][number]]: Data[S] }

export type Reading<K extends SourceKind = SourceKind> = K extends SourceKind
  ? { readonly source: SourceOf<K>; readonly data: Offered<K>; readonly lineOf: (id: DeputyId) => Line | null }
  : never

export const VOTE: VoteSource = { kind: "vote" }

export const SEAT: SeatSource = { kind: "seat" }

export function sourceKey(source: Source): string {
  switch (source.kind) {
    case "category":
    case "number":
      return source.key
    case "vote":
    case "seat":
      return source.kind
  }
}
