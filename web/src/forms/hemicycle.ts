import type { DeputyId } from "../data/deputyId.ts"
import type { ViewBox } from "../data/viewBox.ts"
import { dots, type Glyph } from "../glyph/glyph.ts"
import type { Rect } from "../preview/placement.ts"
import type { Point, Seats } from "../sources/shapes.ts"
import { DOT_RADIUS, HUB_PX, NO_HOLLOW, type Fit, type FormSpec, type Frame, type Framed, type Scene } from "./form.ts"

const SNAP = 0.6 * 2.75 * DOT_RADIUS
const ROW_TOLERANCE = 0.025
// The hollow of seats/hemicycle.svg above its tribune and below the innermost seats, in the room's units.
const HUB: Rect = { left: -0.19, top: -0.25, right: 0.19, bottom: -0.13 }
// The foot of seats/hemicycle.svg's tribune, in the room's units: only the floor below it may run under a legend.
const TRIBUNE_FOOT = 0.26

export function placeHemicycle({ main: seats }: { readonly main: Seats }, { frame }: Framed): Scene {
  const fit = fitted(seats.box, frame)
  const { scale, offset } = fit
  return {
    card: "beside",
    radius: DOT_RADIUS * scale,
    snap: SNAP * scale,
    dots: new Map(Array.from(seats.seatOf, ([id, { x, y }]) => [id, { x: offset.x + scale * x, y: offset.y + scale * y }])),
    hollow: NO_HOLLOW,
    marks: [{ kind: "room", room: seats.room, empty: seats.empty, radius: DOT_RADIUS, fit }],
    hub: {
      box: { left: offset.x + scale * HUB.left, top: offset.y + scale * HUB.top, right: offset.x + scale * HUB.right, bottom: offset.y + scale * HUB.bottom },
      size: HUB_PX[frame.screen] * frame.px,
    },
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

export const hemicycle: FormSpec<{ readonly main: readonly ["seats"] }> = { label: "Hémicycle", glyph: GLYPH, slots: { main: ["seats"] }, ordered: false, place: placeHemicycle }

function fitted(box: ViewBox, { area, bleed }: Frame): Fit {
  const bottom = box.y + box.height
  const foot = Math.min(TRIBUNE_FOOT, bottom)
  const height = area.bottom - area.top
  const scale = Math.min((area.right - area.left) / box.width, height / (foot - box.y), (height + bleed) / box.height)
  const shownBottom = Math.max(foot, bottom - bleed / scale)
  const offset = { x: (area.left + area.right - scale * (2 * box.x + box.width)) / 2, y: (area.top + area.bottom - scale * (box.y + shownBottom)) / 2 }
  return { scale, offset }
}

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
