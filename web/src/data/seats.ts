import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import type { Row } from "./csv.ts"
import { deputyId, type DeputyId } from "./deputyId.ts"

export const SEATS_FILE = "seats/hemicycle.csv"

export const SEAT_COLUMNS = ["seat", "x", "y", "deputy", "constituency"] as const

type SeatRow = Row<(typeof SEAT_COLUMNS)[number]>

export type Seat = { number: string; x: number; y: number }

export type EmptySeat = Seat & { readonly constituency: ConstituencyCode | null }

export type SeatPlan = { readonly seatOf: ReadonlyMap<DeputyId, Seat>; readonly emptySeats: readonly EmptySeat[] }

export function readSeats(rows: readonly SeatRow[]): SeatPlan {
  const seatOf = new Map<DeputyId, Seat>()
  const emptySeats: EmptySeat[] = []
  for (const row of rows) {
    const seat = { number: row.seat, x: Number(row.x), y: Number(row.y) }
    const constituency = seatConstituency(row)
    if (row.deputy) seatOf.set(deputyId(row.deputy), seat)
    else emptySeats.push({ ...seat, constituency })
  }
  return { seatOf, emptySeats }
}

function seatConstituency({ seat, constituency }: SeatRow): ConstituencyCode | null {
  if (constituency === "") return null
  const code = constituencyCode(constituency)
  if (code === null) throw new Error(`${SEATS_FILE}: seat ${seat} has constituency "${constituency}"`)
  return code
}
