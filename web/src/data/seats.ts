import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import type { Row } from "./csv.ts"
import { deputyId, type DeputyId } from "./deputyId.ts"

export const SEATS_FILE = "seats/hemicycle.csv"

export const SEAT_COLUMNS = ["seat", "x", "y", "deputy", "constituency"] as const

type SeatRow = Row<(typeof SEAT_COLUMNS)[number]>

export type Seat = { number: string; x: number; y: number }

export type EmptySeat = Seat & { readonly constituency: ConstituencyCode | null }

export type SeatPlan = { readonly seatOf: ReadonlyMap<DeputyId, Seat>; readonly emptySeats: readonly EmptySeat[] }

export function parseSeatRows(rows: readonly SeatRow[]): SeatPlan {
  const seatOf = new Map<DeputyId, Seat>()
  const emptySeats: EmptySeat[] = []
  const constituencySeat = new Map<ConstituencyCode, string>()
  for (const row of rows) {
    const seat = { number: row.seat, x: coordinate(row, "x"), y: coordinate(row, "y") }
    const constituency = seatConstituency(row)
    if (constituency) {
      const other = constituencySeat.get(constituency)
      if (other !== undefined) throw new Error(`${SEATS_FILE}: constituency ${constituency} is on seats ${other} and ${row.seat}`)
      constituencySeat.set(constituency, row.seat)
    }
    if (row.deputy) {
      const id = deputyId(row.deputy)
      const other = seatOf.get(id)
      if (other) throw new Error(`${SEATS_FILE}: deputy ${row.deputy} is on seats ${other.number} and ${row.seat}`)
      seatOf.set(id, seat)
    } else emptySeats.push({ ...seat, constituency })
  }
  return { seatOf, emptySeats }
}

function coordinate(row: SeatRow, axis: "x" | "y"): number {
  const cell = row[axis]
  const value = cell.trim() === "" ? NaN : Number(cell)
  if (!Number.isFinite(value)) throw new Error(`${SEATS_FILE}: seat ${row.seat} has ${axis} "${cell}"`)
  return value
}

function seatConstituency({ seat, constituency }: SeatRow): ConstituencyCode | null {
  if (constituency === "") return null
  const code = constituencyCode(constituency)
  if (code === null) throw new Error(`${SEATS_FILE}: seat ${seat} has constituency "${constituency}"`)
  return code
}
