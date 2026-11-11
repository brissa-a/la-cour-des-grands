import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import type { DeputyId } from "./deputyId.ts"
import type { EmptySeat, Seat, SeatPlan } from "./seats.ts"

export type Seated<P> = P & { readonly seat: Seat }

export type InOffice<P> = Seated<P> | (P & { readonly seat: null })

export type Sitting<P, S extends Seat = Seat> = {
  readonly deputies: readonly Seated<P>[]
  readonly byId: ReadonlyMap<DeputyId, Seated<P>>
  readonly emptySeats: readonly S[]
}

export type Office<P> = {
  readonly deputies: readonly InOffice<P>[]
  readonly byId: ReadonlyMap<DeputyId, InOffice<P>>
  readonly byConstituency: ReadonlyMap<ConstituencyCode, InOffice<P>>
  readonly sitting: Sitting<P, EmptySeat>
}

type Holder = { readonly id: DeputyId; readonly constituency: string }

export function officeOf<P extends Holder>(inOffice: readonly P[], { seatOf, emptySeats }: Pick<SeatPlan, "seatOf" | "emptySeats">): Office<P> {
  const deputies = inOffice.map((person): InOffice<P> => ({ ...person, seat: seatOf.get(person.id) ?? null }))
  const seated = deputies.flatMap(deputy => (deputy.seat === null ? [] : [deputy]))
  return {
    deputies,
    byId: new Map(deputies.map(deputy => [deputy.id, deputy])),
    byConstituency: byConstituency(deputies),
    sitting: { deputies: seated, byId: new Map(seated.map(deputy => [deputy.id, deputy])), emptySeats },
  }
}

function byConstituency<D extends Holder>(deputies: readonly D[]): ReadonlyMap<ConstituencyCode, D> {
  const map = new Map<ConstituencyCode, D>()
  for (const deputy of deputies) {
    const code = constituencyCode(deputy.constituency)
    if (code === null) {
      console.warn(`deputies/init.csv: ${deputy.id} has constituency ${deputy.constituency}`)
      continue
    }
    const holder = map.get(code)
    if (holder) console.warn(`deputies/init.csv: ${holder.id} and ${deputy.id} both hold ${code}`)
    else map.set(code, deputy)
  }
  return map
}
