import type { ConstituencyCode } from "../address/codes.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { InOffice, Seated, Sitting } from "../data/office.ts"
import type { EmptySeat, Seat } from "../data/seats.ts"
import type { Roster } from "./roster.ts"

type Today<P> = {
  readonly byConstituency: ReadonlyMap<ConstituencyCode, InOffice<P>>
  readonly sitting: { readonly emptySeats: readonly EmptySeat[] }
  readonly people: ReadonlyMap<DeputyId, P>
}

export const UNDRAWN_REASONS = ["vacant", "unseated", "unseatedSuccessor"] as const

export type UndrawnReason = (typeof UNDRAWN_REASONS)[number]

export type Unplaced = Readonly<Record<UndrawnReason, number>>

export type PastSitting<P> = Sitting<P> & { readonly unplaced: Unplaced }

export function sittingOn<P extends { readonly id: DeputyId }>(today: Today<P>, roster: Roster): PastSitting<P> | null {
  const holders = new Map(Array.from(roster, ([constituency, id]) => [constituency, today.people.get(id)]))
  const deputies: Seated<P>[] = []
  const freedSeats: Seat[] = []
  const unplaced: Record<UndrawnReason, number> = { vacant: 0, unseated: 0, unseatedSuccessor: 0 }
  let replaced = false
  for (const [constituency, current] of today.byConstituency) {
    const past = holders.get(constituency)
    if (current.seat === null) {
      if (past?.id === current.id) unplaced.unseated++
      else if (past) unplaced.unseatedSuccessor++
    } else if (past?.id === current.id) deputies.push(current)
    else if (past) {
      replaced = true
      deputies.push({ ...past, seat: current.seat })
    } else freedSeats.push(current.seat)
  }
  const vacantSeats = new Map(today.sitting.emptySeats.map(seat => [seat.constituency, seat]))
  const takenSeats = new Set<Seat>()
  for (const [constituency, past] of holders) {
    if (today.byConstituency.has(constituency)) continue
    const seat = vacantSeats.get(constituency)
    if (seat === undefined) unplaced.vacant++
    else if (past) {
      takenSeats.add(seat)
      deputies.push({ ...past, seat })
    }
  }
  if (!replaced && freedSeats.length === 0 && takenSeats.size === 0 && UNDRAWN_REASONS.every(reason => unplaced[reason] === 0)) return null
  const emptySeats = [...today.sitting.emptySeats.filter(seat => !takenSeats.has(seat)), ...freedSeats]
  return { deputies, byId: new Map(deputies.map(d => [d.id, d])), emptySeats, unplaced }
}
