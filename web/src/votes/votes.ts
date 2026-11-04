import { isoDate, type IsoDate } from "../data/isoDate.ts"
import { labelReader, type LabelRow } from "./labels.ts"
import { voteId, type VoteId } from "./voteId.ts"

export type { VoteId }

export const VOTES_FILE = "votes/votes.csv"

export const VOTE_COLUMNS = ["vote_id", "number", "date", "title", "kind", "result", "major", "bill", "file", "url"] as const

export type VoteRow = Readonly<Record<(typeof VOTE_COLUMNS)[number], string>>

const KINDS = ["ordinary", "solemn", "censure_motion"] as const

export type VoteKind = (typeof KINDS)[number]

const RESULTS = ["adopted", "rejected"] as const

export type VoteResult = (typeof RESULTS)[number]

export type Vote = {
  readonly id: VoteId
  readonly number: number
  readonly date: IsoDate
  readonly title: string
  readonly kind: VoteKind
  readonly result: VoteResult
  readonly major: boolean
  readonly bill: string | null
  readonly file: string
  readonly url: string
}

export type VoteLabels = {
  readonly kind: Readonly<Record<VoteKind, string>>
  readonly result: Readonly<Record<VoteResult, string>>
}

export type VoteIndex = {
  readonly votes: readonly Vote[]
  readonly byId: ReadonlyMap<VoteId, Vote>
  readonly labels: VoteLabels
}

const NUMBER = /^[1-9]\d*$/

export function parseVotes(rows: readonly VoteRow[]): Vote[] {
  const seen = new Set<VoteId>()
  return rows.map(row => {
    const invalid = (column: keyof VoteRow) => new Error(`${VOTES_FILE}: ${row.vote_id} has ${column} "${row[column]}"`)
    const id = voteId(row.vote_id)
    if (id === null) throw invalid("vote_id")
    if (seen.has(id)) throw new Error(`${VOTES_FILE}: ${id} is listed twice`)
    seen.add(id)
    if (!NUMBER.test(row.number)) throw invalid("number")
    const date = isoDate(row.date)
    if (date === null) throw invalid("date")
    const kind = KINDS.find(k => k === row.kind)
    if (kind === undefined) throw invalid("kind")
    const result = RESULTS.find(r => r === row.result)
    if (result === undefined) throw invalid("result")
    if (row.major !== "yes" && row.major !== "no") throw invalid("major")
    if (row.file === "") throw invalid("file")
    return {
      id,
      number: Number(row.number),
      date,
      title: row.title,
      kind,
      result,
      major: row.major === "yes",
      bill: row.bill === "" ? null : row.bill,
      file: row.file,
      url: row.url,
    }
  })
}

export function parseVoteLabels(kinds: readonly LabelRow[], kindTable: string, results: readonly LabelRow[], resultTable: string): VoteLabels {
  const kind = labelReader(kinds, KINDS, kindTable)
  const result = labelReader(results, RESULTS, resultTable)
  return {
    kind: { ordinary: kind("ordinary"), solemn: kind("solemn"), censure_motion: kind("censure_motion") },
    result: { adopted: result("adopted"), rejected: result("rejected") },
  }
}

export function voteIndex(votes: readonly Vote[], labels: VoteLabels): VoteIndex {
  return { votes, byId: new Map(votes.map(v => [v.id, v])), labels }
}

export function voteTitle(vote: Vote): string {
  return vote.title.charAt(0).toUpperCase() + vote.title.slice(1)
}
