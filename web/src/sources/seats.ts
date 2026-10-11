import type { Background } from "../data/assembly.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { Room, Seat, Seats } from "./shapes.ts"

type Seated = { readonly deputies: readonly { readonly id: DeputyId; readonly seat: Seat }[]; readonly emptySeats: readonly Seat[] }

export function seatsOf(sitting: Seated, background: Background): Seats {
  return { seatOf: new Map(sitting.deputies.map(deputy => [deputy.id, deputy.seat])), empty: sitting.emptySeats, room: room(background.markup) }
}

function room(markup: string): Room {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: only the seats reader holds the room's svg, so a form without seats cannot draw the room
  return markup as Room
}
