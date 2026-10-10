import type { ConstituencyCode } from "../address/codes.ts"
import type { DeputyId, Seat } from "../data/assembly.ts"
import type { Roster } from "./roster.ts"

type Seated<P> = P & { readonly seat: Seat }

type Today<P> = {
  readonly byConstituency: ReadonlyMap<ConstituencyCode, Seated<P>>
  readonly emptySeats: readonly Seat[]
  readonly people: ReadonlyMap<DeputyId, P>
}

export type PastSitting<P> = {
  readonly deputies: readonly Seated<P>[]
  readonly byId: ReadonlyMap<DeputyId, Seated<P>>
  readonly emptySeats: readonly Seat[]
  readonly unplaced: number
}

export function sittingOn<P extends { readonly id: DeputyId }>(today: Today<P>, roster: Roster): PastSitting<P> {
  const deputies: Seated<P>[] = []
  const emptySeats: Seat[] = [...today.emptySeats]
  for (const [constituency, current] of today.byConstituency) {
    const holder = roster.get(constituency)
    const past = holder === undefined || holder === current.id ? undefined : today.people.get(holder)
    if (holder === current.id) deputies.push(current)
    else if (past) deputies.push({ ...past, seat: current.seat })
    else emptySeats.push(current.seat)
  }
  const unplaced = Array.from(roster.keys()).filter(constituency => !today.byConstituency.has(constituency)).length
  return { deputies, byId: new Map(deputies.map(d => [d.id, d])), emptySeats, unplaced }
}
