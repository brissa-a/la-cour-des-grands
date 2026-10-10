import type { Background } from "../data/assembly.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { Rect } from "../preview/placement.ts"
import type { Room, Seat, Seats } from "./shapes.ts"

type Seated = { readonly deputies: readonly { readonly id: DeputyId; readonly seat: Seat }[]; readonly emptySeats: readonly Seat[] }

export function seatsOf(sitting: Seated, background: Background): Seats {
  const seatOf = new Map(sitting.deputies.map(deputy => [deputy.id, deputy.seat]))
  return {
    seatOf,
    empty: sitting.emptySeats,
    room: room(background.markup),
    box: viewBoxRect(background.viewBox),
    pitch: closest([...seatOf.values(), ...sitting.emptySeats]),
  }
}

function room(markup: string): Room {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: only the seats reader holds the room's svg, so a form without seats cannot draw the room
  return markup as Room
}

export function viewBoxRect(viewBox: string): Rect {
  const [left = 0, top = 0, width = 0, height = 0] = viewBox.trim().split(/[\s,]+/).map(Number)
  return { left, top, right: left + width, bottom: top + height }
}

function closest(seats: readonly Seat[]): number {
  let pitch = Infinity
  for (let i = 0; i < seats.length; i++) {
    const a = seats[i]
    if (!a) continue
    for (let j = i + 1; j < seats.length; j++) {
      const b = seats[j]
      if (b) pitch = Math.min(pitch, Math.hypot(a.x - b.x, a.y - b.y))
    }
  }
  return pitch
}
