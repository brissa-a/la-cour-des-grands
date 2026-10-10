import type { DeputyId } from "../data/assembly.ts"
import type { ReadVote } from "../votes/sources.ts"
import { MISSING, VOTE, type CategoryColoring } from "./coloring.ts"
import { NEUTRAL, POSITION_COLORS } from "../sources/views.ts"

export function voteColoring({ vote, table, reading }: ReadVote, drawn: readonly { id: DeputyId }[]): CategoryColoring<typeof VOTE> {
  const counts = new Map<string, number>()
  for (const { id } of drawn) {
    const position = reading.positions.get(id)
    if (position !== undefined) counts.set(position, (counts.get(position) ?? 0) + 1)
  }
  return {
    kind: "category",
    key: VOTE,
    title: `Scrutin n° ${vote.number}`,
    valueOf: id => reading.positions.get(id) ?? MISSING,
    colorOf: id => {
      const position = reading.positions.get(id)
      return position === undefined ? NEUTRAL : POSITION_COLORS[position]
    },
    items: table.order.flatMap(position => {
      const count = counts.get(position) ?? 0
      const label = table.label[position]
      return count > 0 ? [{ value: position, label, title: label, color: POSITION_COLORS[position], count }] : []
    }),
  }
}
