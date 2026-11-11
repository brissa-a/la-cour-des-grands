import type { DeputyId } from "../data/deputyId.ts"
import type { Seat } from "../data/seats.ts"

export type ShownSeat =
  | { readonly kind: "drawn"; readonly seat: Seat; readonly among: number }
  | { readonly kind: "today"; readonly seat: Seat }
  | { readonly kind: "unassigned" }
  | { readonly kind: "none" }

type Drawn = { readonly byId: ReadonlyMap<DeputyId, { readonly seat: Seat }>; readonly deputies: readonly unknown[] }

export function shownSeat(id: DeputyId, drawn: Drawn, inOffice: ReadonlyMap<DeputyId, { readonly seat: Seat | null }>): ShownSeat {
  const seated = drawn.byId.get(id)
  if (seated !== undefined) return { kind: "drawn", seat: seated.seat, among: drawn.deputies.length }
  const holder = inOffice.get(id)
  if (holder === undefined) return { kind: "none" }
  return holder.seat === null ? { kind: "unassigned" } : { kind: "today", seat: holder.seat }
}

export function seatFact(seat: ShownSeat): string | null {
  switch (seat.kind) {
    case "drawn":
    case "today":
      return `n° ${seat.seat.number}`
    case "unassigned":
      return "Pas encore attribué"
    case "none":
      return null
  }
}
