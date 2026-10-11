import type { DeputyId } from "../data/deputyId.ts"
import type { Point, Seats } from "../sources/shapes.ts"
import { DOT_RADIUS, type FormSpec, type Scene } from "./form.ts"

const SNAP = 0.6 * 2.75 * DOT_RADIUS
const ROW_TOLERANCE = 0.025

export function placeHemicycle({ main: seats }: { readonly main: Seats }): Scene {
  return {
    card: "beside",
    radius: DOT_RADIUS,
    snap: SNAP,
    dots: seats.seatOf,
    marks: [{ kind: "room", room: seats.room, empty: seats.empty, radius: DOT_RADIUS }],
    lines: rows(seats.seatOf),
    where: id => {
      const seat = seats.seatOf.get(id)
      return seat ? { kind: "seat", number: seat.number } : null
    },
  }
}

export const hemicycle: FormSpec<{ readonly main: readonly ["seats"] }> = { label: "Hémicycle", slots: { main: ["seats"] }, place: placeHemicycle }

function rows(seatOf: ReadonlyMap<DeputyId, Point>): DeputyId[][] {
  const polar = Array.from(seatOf, ([id, { x, y }]) => ({ id, radius: Math.hypot(x, y), along: -Math.atan2(Math.abs(y), x) }))
  polar.sort((a, b) => a.radius - b.radius)
  const rows: (typeof polar)[] = []
  let row: typeof polar = []
  for (const seat of polar) {
    const first = row[0]
    if (first === undefined || seat.radius - first.radius > ROW_TOLERANCE) {
      row = []
      rows.push(row)
    }
    row.push(seat)
  }
  return rows.map(seatsInRow => seatsInRow.sort((a, b) => a.along - b.along).map(seat => seat.id))
}
