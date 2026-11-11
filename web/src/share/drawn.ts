import type { DeputyId } from "../data/deputyId.ts"
import { officeOf } from "../data/office.ts"
import { parseSeatRows, type SeatRow } from "../data/seats.ts"
import { parseHolders, rosterOn } from "../votes/roster.ts"
import { sittingOn } from "../votes/sitting.ts"
import type { Vote } from "../votes/votes.ts"

type Listed = { readonly id: DeputyId; readonly in_office: string; readonly constituency: string; readonly mandate_periods: string }

export type Drawn = (deputy: DeputyId, vote: Pick<Vote, "date"> | null) => boolean

export function drawnIn(people: readonly Listed[], seatRows: readonly SeatRow[]): Drawn {
  const inOffice = people.filter(person => person.in_office === "yes")
  const office = officeOf(inOffice, parseSeatRows(seatRows, new Set(inOffice.map(person => person.id))))
  const today = { ...office, people: new Map(people.map(person => [person.id, person])) }
  const holders = parseHolders(people)
  return (deputy, vote) => {
    const sitting = vote === null ? null : sittingOn(today, rosterOn(holders, vote.date))
    return (sitting ?? office.sitting).byId.has(deputy)
  }
}
