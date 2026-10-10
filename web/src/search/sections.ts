import { matchStrength, type VoteMatch, type VoteSearch } from "../votes/voteSearch.ts"
import type { FuzzyIndex, SearchResult } from "./fuzzy.ts"

// Scores are compared per query word each index reads: vote titles skip function words that deputy fields still
// match, so a total would favour deputies matched on "de" or a look-alike commune.
export function votesFirst<Ref, Field>(
  query: string,
  deputies: FuzzyIndex<Ref, Field>,
  bestDeputy: SearchResult<Ref, Field> | undefined,
  votes: VoteSearch,
  voteMatches: readonly VoteMatch[],
): boolean {
  return perWord(votes, query, Math.max(0, ...voteMatches.map(matchStrength))) > perWord(deputies, query, bestDeputy?.score ?? 0)
}

function perWord<Ref, Field>(index: FuzzyIndex<Ref, Field>, query: string, score: number): number {
  const words = index.terms(query).length
  return words === 0 ? 0 : score / words
}
