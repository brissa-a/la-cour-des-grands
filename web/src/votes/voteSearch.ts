import { FuzzyIndex, type SearchResult } from "../search/fuzzy.ts"
import { voteTitle, type Vote } from "./votes.ts"

const MAJOR_WEIGHT = 1.25

const TITLES_PER_TASK = 500

const IGNORED_WORDS: ReadonlySet<string> = new Set([
  "a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les", "m", "mm", "mme", "mmes", "n°", "par", "pour", "sur", "un", "une",
])

export type VoteSearch = FuzzyIndex<Vote, "title">

export type VoteMatch = SearchResult<Vote, "title">

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
    .sort((a, b) => b.score - a.score || b.ref.date.localeCompare(a.ref.date) || b.ref.number - a.ref.number)
}

export function matchStrength(match: VoteMatch): number {
  return match.score / (match.ref.major ? MAJOR_WEIGHT : 1)
}

function nextTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve))
}
