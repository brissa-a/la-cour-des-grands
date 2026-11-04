import { deputyId, type DeputyId } from "../data/deputyId.ts"
import { labelReader, type LabelRow } from "./labels.ts"
import type { VoteId } from "./voteId.ts"
import type { VoteKind } from "./votes.ts"

export const POSITIONS = ["for", "against", "abstain", "not_voting", "absent"] as const

export type VotePosition = (typeof POSITIONS)[number]

export type PositionTable = {
  readonly order: readonly VotePosition[]
  readonly label: Readonly<Record<VotePosition, string>>
}

export type PositionRow = Readonly<Record<"deputy_id", string>> & Readonly<Record<string, string>>

export type Cells = ReadonlyMap<DeputyId, VotePosition>

const KIND_LABELS: Readonly<Record<VoteKind, Partial<Readonly<Record<VotePosition, string>>>>> = {
  ordinary: {},
  solemn: {},
  // Only the votes for a censure motion are recorded: its opponents do not vote.
  censure_motion: { absent: "Absent ou contre" },
}

export function parsePositionTable(rows: readonly LabelRow[], table: string, kind: VoteKind): PositionTable {
  const dataLabel = labelReader(rows, POSITIONS, table)
  const label = (position: VotePosition) => KIND_LABELS[kind][position] ?? dataLabel(position)
  return {
    order: rows.flatMap(row => POSITIONS.filter(position => position === row.value)),
    label: {
      for: label("for"),
      against: label("against"),
      abstain: label("abstain"),
      not_voting: label("not_voting"),
      absent: label("absent"),
    },
  }
}

export function parseCells(rows: readonly PositionRow[], vote: VoteId, file: string): Cells {
  const cells = new Map<DeputyId, VotePosition>()
  for (const row of rows) {
    const cell = row[vote]
    if (cell === undefined) throw new Error(`${file}: no column ${vote}`)
    if (cell === "") continue
    const position = POSITIONS.find(p => p === cell)
    if (position === undefined) throw new Error(`${file}: ${row.deputy_id} has position "${cell}" on ${vote}`)
    cells.set(deputyId(row.deputy_id), position)
  }
  return cells
}
