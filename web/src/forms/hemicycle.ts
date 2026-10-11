import type { DeputyId } from "../data/deputyId.ts"
import { dots, type Glyph } from "../glyph/glyph.ts"
import type { Point, Seats } from "../sources/shapes.ts"
import { DOT_RADIUS, NO_HOLLOW, type FormSpec, type Scene } from "./form.ts"

const SNAP = 0.6 * 2.75 * DOT_RADIUS
const ROW_TOLERANCE = 0.025

export function placeHemicycle({ main: seats }: { readonly main: Seats }): Scene {
  return {
    card: "beside",
    radius: DOT_RADIUS,
    snap: SNAP,
    dots: seats.seatOf,
    hollow: NO_HOLLOW,
    marks: [{ kind: "room", room: seats.room, empty: seats.empty, radius: DOT_RADIUS }],
    lines: rows(seats.seatOf),
    where: id => {
      const seat = seats.seatOf.get(id)
      return seat ? { kind: "seat", number: seat.number } : null
    },
  }
}

const GLYPH: Glyph = [
  { kind: "stroke", d: "M1.4 19.5A10.6 10.6 0 0 1 22.6 19.5", width: 1, opacity: 0.6 },
  ...dots(1.4, [[7.6, 19.5], [9.8, 15.69], [14.2, 15.69], [16.4, 19.5], [4.1, 19.5], [5.16, 15.55], [8.05, 12.66], [12, 11.6], [15.95, 12.66], [18.84, 15.55], [19.9, 19.5]]),
  { kind: "block", x: 10.6, y: 17.4, width: 2.8, height: 2.1, round: 0.4, opacity: 1 },
]

export const hemicycle: FormSpec<{ readonly main: readonly ["seats"] }> = { label: "Hémicycle", glyph: GLYPH, slots: { main: ["seats"] }, place: placeHemicycle }

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
