import type { DeputyId } from "../data/deputyId.ts"
import type { Cells, VotePosition } from "./positions.ts"
import type { Roster } from "./roster.ts"

export type Tally = Readonly<Record<VotePosition, number>>

export type VoteReading = {
  readonly roster: Roster
  readonly positions: ReadonlyMap<DeputyId, VotePosition>
  readonly tally: Tally
}

export function readVote(roster: Roster, cells: Cells): VoteReading {
  const positions = new Map<DeputyId, VotePosition>()
  const tally = { for: 0, against: 0, abstain: 0, not_voting: 0, absent: 0 }
  for (const id of roster.values()) {
    const position = cells.get(id) ?? "absent"
    positions.set(id, position)
    tally[position]++
  }
  return { roster, positions, tally }
}
