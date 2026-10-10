import { memoize } from "../address/memoize.ts"
import { columnsValuesTablePath, valuesTablePath, type Catalog } from "../data/catalog.ts"
import { loadCsv } from "../data/csv.ts"
import type { DeputyId } from "../data/deputyId.ts"
import { LABEL_COLUMNS } from "./labels.ts"
import { parseCells, parsePositionTable, type PositionRow, type PositionTable } from "./positions.ts"
import { readVote, type VoteReading } from "./reading.ts"
import { parseHolders, rosterOn, type Holder, type HolderRow } from "./roster.ts"
import { parseVoteLabels, parseVotes, VOTE_COLUMNS, voteIndex, VOTES_FILE, type Vote, type VoteIndex } from "./votes.ts"

export type ReadVote = { readonly vote: Vote; readonly table: PositionTable; readonly reading: VoteReading }

export type VoteSource = {
  index: () => Promise<VoteIndex>
  read: (vote: Vote) => Promise<ReadVote>
}

export function createVoteSource(catalog: Catalog, people: ReadonlyMap<DeputyId, HolderRow>): VoteSource {
  const index = memoize(async () => {
    const kindTable = valuesTablePath(catalog, VOTES_FILE, "kind")
    const resultTable = valuesTablePath(catalog, VOTES_FILE, "result")
    const [rows, kinds, results] = await Promise.all([
      loadCsv(VOTES_FILE, VOTE_COLUMNS),
      loadCsv(kindTable, LABEL_COLUMNS),
      loadCsv(resultTable, LABEL_COLUMNS),
    ])
    return voteIndex(parseVotes(rows), parseVoteLabels(kinds, kindTable, results, resultTable))
  })
  const positionRows = memoize((file: string): Promise<readonly PositionRow[]> => loadCsv(file, ["deputy_id"]))
  const positionLabels = memoize((table: string) => loadCsv(table, LABEL_COLUMNS))
  let holders: readonly Holder[] | null = null

  return {
    index: () => index(null),
    read: async vote => {
      const labelTable = columnsValuesTablePath(catalog, vote.file)
      const [rows, labels] = await Promise.all([positionRows(vote.file), positionLabels(labelTable)])
      holders ??= parseHolders(people.values())
      return {
        vote,
        table: parsePositionTable(labels, labelTable, vote.kind),
        reading: readVote(rosterOn(holders, vote.date), parseCells(rows, vote.id, vote.file)),
      }
    },
  }
}
