import { memoize } from "../address/memoize.ts"
import { FuzzyIndex, type SearchResult } from "../search/fuzzy.ts"
import { voteTitle, type Vote, type VoteIndex, type VoteLabels } from "./votes.ts"

const MAJOR_WEIGHT = 1.25

const TITLES_PER_TASK = 500

const IGNORED_WORDS: ReadonlySet<string> = new Set([
  "a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les", "m", "mm", "mme", "mmes", "n°", "par", "pour", "sur", "un", "une",
])

export type VoteSearch = FuzzyIndex<Vote, "title">

export type VoteMatch = SearchResult<Vote, "title">

export type VoteFinder = { readonly search: VoteSearch; readonly votes: readonly Vote[]; readonly labels: VoteLabels }

const NUMBER_QUERY = /^\s*(?:n\s*°)?\s*(\d+)\s*$/i

export function voteFinder(index: () => Promise<VoteIndex>): () => Promise<VoteFinder> {
  const load = memoize(async (from: typeof index): Promise<VoteFinder> => {
    const { votes, labels } = await from()
    return { search: await createVoteSearch(votes), votes, labels }
  })
  return () => load(index)
}

export function findVotes({ search, votes }: VoteFinder, query: string): VoteMatch[] {
  if (query.trim() === "") return latestMajors(votes).map(unmatched)
  const number = Number(NUMBER_QUERY.exec(query)?.[1])
  const byNumber = votes.filter(vote => vote.number === number)
  return [...byNumber.map(unmatched), ...searchVotes(search, query).filter(match => !byNumber.includes(match.ref))]
}

export async function createVoteSearch(votes: readonly Vote[]): Promise<VoteSearch> {
  const index = new FuzzyIndex<Vote, "title">(IGNORED_WORDS)
  for (const [i, vote] of votes.entries()) {
    if (i > 0 && i % TITLES_PER_TASK === 0) await nextTask()
    index.add(vote, "title", voteTitle(vote), vote.major ? MAJOR_WEIGHT : 1)
  }
  return index
}

export function searchVotes(search: VoteSearch, query: string): VoteMatch[] {
  return search
    .search(query)
    .sort((a, b) => b.score - a.score || newestFirst(a.ref, b.ref))
}

export function matchStrength(match: VoteMatch): number {
  return match.score / (match.ref.major ? MAJOR_WEIGHT : 1)
}

function latestMajors(votes: readonly Vote[]): Vote[] {
  return votes.filter(vote => vote.major).sort(newestFirst)
}

function newestFirst(a: Vote, b: Vote): number {
  return b.date.localeCompare(a.date) || b.number - a.number
}

function unmatched(vote: Vote): VoteMatch {
  return { ref: vote, matches: [], score: 0 }
}

function nextTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve))
}
