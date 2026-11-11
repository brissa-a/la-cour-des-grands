import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import type { Row } from "./csv.ts"
import { deputyId, type DeputyId } from "./deputyId.ts"

export const SEATS_FILE = "seats/hemicycle.csv"

export const SEAT_COLUMNS = ["seat", "x", "y", "deputy"] as const

export const SEAT_OPTIONAL_COLUMNS = ["constituency"] as const

type SeatRow = Row<(typeof SEAT_COLUMNS)[number] | (typeof SEAT_OPTIONAL_COLUMNS)[number]>

export type Seat = { number: string; x: number; y: number }

export type EmptySeat = Seat & { readonly constituency: ConstituencyCode | null }

export type SeatProblem =
  | { readonly kind: "invalid coordinate"; readonly seat: string; readonly axis: "x" | "y"; readonly cell: string }
  | { readonly kind: "deputy not in office"; readonly seat: string; readonly cell: string }
  | { readonly kind: "repeated deputy"; readonly seat: string; readonly deputy: DeputyId; readonly firstSeat: string }
  | { readonly kind: "invalid constituency"; readonly seat: string; readonly cell: string }
  | { readonly kind: "repeated constituency"; readonly seat: string; readonly constituency: ConstituencyCode; readonly firstSeat: string }

export type SeatPlan = {
  readonly seatOf: ReadonlyMap<DeputyId, Seat>
  readonly emptySeats: readonly EmptySeat[]
  readonly problems: readonly SeatProblem[]
}

export function parseSeatRows(rows: readonly SeatRow[], inOffice: ReadonlySet<DeputyId>): SeatPlan {
  const seatOf = new Map<DeputyId, Seat>()
  const emptySeats: EmptySeat[] = []
  const constituencySeat = new Map<ConstituencyCode, string>()
  const problems: SeatProblem[] = []
  for (const row of rows) {
    const x = coordinate(row.x)
    const y = coordinate(row.y)
    if (x === null || y === null) {
      const axis = x === null ? "x" : "y"
      problems.push({ kind: "invalid coordinate", seat: row.seat, axis, cell: row[axis] })
      continue
    }
    const seat = { number: row.seat, x, y }
    if (row.deputy === "") {
      emptySeats.push({ ...seat, constituency: claimConstituency(row, constituencySeat, problems) })
      continue
    }
    const deputy = deputyId(row.deputy)
    if (!inOffice.has(deputy)) {
      problems.push({ kind: "deputy not in office", seat: row.seat, cell: row.deputy })
      continue
    }
    const first = seatOf.get(deputy)
    if (first) {
      problems.push({ kind: "repeated deputy", seat: row.seat, deputy, firstSeat: first.number })
      continue
    }
    claimConstituency(row, constituencySeat, problems)
    seatOf.set(deputy, seat)
  }
  return { seatOf, emptySeats, problems }
}

export function seatProblemWarning(problem: SeatProblem): string {
  const seat = `${SEATS_FILE}: seat ${problem.seat}`
  switch (problem.kind) {
    case "invalid coordinate":
      return `${seat} dropped, its ${problem.axis} is "${problem.cell}"`
    case "deputy not in office":
      return `${seat} dropped, its deputy "${problem.cell}" is not in office in deputies/init.csv`
    case "repeated deputy":
      return `${seat} dropped, deputy ${problem.deputy} is already on seat ${problem.firstSeat}`
    case "invalid constituency":
      return `${seat} kept without its constituency "${problem.cell}", which is not a constituency code`
    case "repeated constituency":
      return `${seat} kept without its constituency ${problem.constituency}, which is already on seat ${problem.firstSeat}`
  }
}

function coordinate(cell: string): number | null {
  const value = cell.trim() === "" ? NaN : Number(cell)
  return Number.isFinite(value) ? value : null
}

function claimConstituency({ seat, constituency }: SeatRow, constituencySeat: Map<ConstituencyCode, string>, problems: SeatProblem[]): ConstituencyCode | null {
  if (constituency === "") return null
  const code = constituencyCode(constituency)
  if (code === null) {
    problems.push({ kind: "invalid constituency", seat, cell: constituency })
    return null
  }
  const firstSeat = constituencySeat.get(code)
  if (firstSeat !== undefined) {
    problems.push({ kind: "repeated constituency", seat, constituency: code, firstSeat })
    return null
  }
  constituencySeat.set(code, seat)
  return code
}
