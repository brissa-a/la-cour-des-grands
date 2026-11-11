import { readCsv } from "../data/csvRows.ts"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import { INIT_FILE } from "../data/features.ts"
import { officeOf } from "../data/office.ts"
import { parseSeatRows, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS, SEATS_FILE } from "../data/seats.ts"
import type { ReadText } from "../data/source.ts"
import { readHolders, rosterOn } from "../votes/roster.ts"
import { sittingOn } from "../votes/sitting.ts"
import type { Vote } from "../votes/votes.ts"

export type Drawn = (deputy: DeputyId, vote: Pick<Vote, "date"> | null) => boolean

export type Drawing = { readonly kind: "known"; readonly drawn: Drawn } | { readonly kind: "unknown"; readonly reason: string }

const MANDATE_COLUMNS = ["deputy_id", "in_office", "constituency", "mandate_periods"] as const

export async function readDrawing(read: ReadText, init: string): Promise<Drawing> {
  let seatsText: string
  try {
    seatsText = await read(SEATS_FILE)
  } catch (error) {
    return { kind: "unknown", reason: error instanceof Error ? error.message : SEATS_FILE }
  }
  const seats = readCsv(SEATS_FILE, seatsText, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS)
  if (seats.kind === "unreadable") return { kind: "unknown", reason: seats.reason }
  const listed = readCsv(INIT_FILE, init, MANDATE_COLUMNS)
  if (listed.kind === "unreadable") return { kind: "unknown", reason: listed.reason }
  const people = listed.rows.map(row => ({ ...row, id: deputyId(row.deputy_id) }))
  const holders = readHolders(people)
  if (holders.kind === "unreadable") return { kind: "unknown", reason: holders.reason }
  const inOffice = people.filter(person => person.in_office === "yes")
  const office = officeOf(inOffice, parseSeatRows(seats.rows, new Set(inOffice.map(person => person.id))))
  const today = { ...office, people: new Map(people.map(person => [person.id, person])) }
  return {
    kind: "known",
    drawn: (deputy, vote) => {
      const sitting = vote === null ? null : sittingOn(today, rosterOn(holders.holders, vote.date))
      return (sitting ?? office.sitting).byId.has(deputy)
    },
  }
}
