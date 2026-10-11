import type { ConstituencyCode } from "../address/codes.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { EmptySeat, Seat } from "../data/seats.ts"
import type { Roster } from "./roster.ts"

type Seated<P> = P & { readonly seat: Seat }

type Today<P> = {
  readonly byConstituency: ReadonlyMap<ConstituencyCode, Seated<P>>
  readonly emptySeats: readonly EmptySeat[]
  readonly people: ReadonlyMap<DeputyId, P>
}

export type PastSitting<P> = {
  readonly deputies: readonly Seated<P>[]
  readonly byId: ReadonlyMap<DeputyId, Seated<P>>
  readonly emptySeats: readonly Seat[]
  readonly unplaced: number
}

export function sittingOn<P extends { readonly id: DeputyId }>(today: Today<P>, roster: Roster): PastSitting<P> | null {
  const holders = new Map(Array.from(roster, ([constituency, id]) => [constituency, today.people.get(id)]))
  const deputies: Seated<P>[] = []
  const freedSeats: Seat[] = []
  let replaced = 0
  for (const [constituency, current] of today.byConstituency) {
    const past = holders.get(constituency)
    if (past?.id === current.id) deputies.push(current)
    else if (past) {
      replaced++
      deputies.push({ ...past, seat: current.seat })
    } else freedSeats.push(current.seat)
  }
  const vacantSeats = new Map(today.emptySeats.map(seat => [seat.constituency, seat]))
  const takenSeats = new Set<Seat>()
  let unplaced = 0
  for (const [constituency, past] of holders) {
    if (today.byConstituency.has(constituency)) continue
    const seat = vacantSeats.get(constituency)
    if (seat === undefined) unplaced++
    else if (past) {
      takenSeats.add(seat)
      deputies.push({ ...past, seat })
    }
  }
  if (replaced === 0 && freedSeats.length === 0 && takenSeats.size === 0 && unplaced === 0) return null
  const emptySeats = [...today.emptySeats.filter(seat => !takenSeats.has(seat)), ...freedSeats]
  return { deputies, byId: new Map(deputies.map(d => [d.id, d])), emptySeats, unplaced }
}
