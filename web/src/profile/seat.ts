import type { DeputyId } from "../data/deputyId.ts"
import type { Seat } from "../data/seats.ts"

export type ShownSeat = Seat | "unassigned" | null

export function shownSeat(
  id: DeputyId,
  drawn: ReadonlyMap<DeputyId, { readonly seat: Seat }>,
  inOffice: ReadonlyMap<DeputyId, { readonly seat: Seat | null }>,
): ShownSeat {
  const holder = drawn.get(id) ?? inOffice.get(id)
  if (holder === undefined) return null
  return holder.seat ?? "unassigned"
}
