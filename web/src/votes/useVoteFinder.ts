import { useEffect, useState } from "react"
import { findVotes, type VoteFinder, type VoteMatch } from "./voteSearch.ts"

const MAX_RESULTS = 20
const DEBOUNCE_MS = 150

export type FinderState = { readonly status: "idle" | "loading" | "failed" } | { readonly status: "ready"; readonly finder: VoteFinder }

export function useVoteFinder(finder: () => Promise<VoteFinder>): { readonly state: FinderState; readonly load: () => void } {
  const [state, setState] = useState<FinderState>({ status: "idle" })
  const load = () => {
    if (state.status !== "idle" && state.status !== "failed") return
    setState({ status: "loading" })
    finder().then(
      ready => setState({ status: "ready", finder: ready }),
      (error: unknown) => {
        console.error(error)
        setState({ status: "failed" })
      },
    )
  }
  return { state, load }
}

export function useVoteResults(state: FinderState, query: string): VoteMatch[] {
  const [results, setResults] = useState<VoteMatch[]>([])
  useEffect(() => {
    if (state.status !== "ready") return
    const timeout = setTimeout(() => setResults(findVotes(state.finder, query).slice(0, MAX_RESULTS)), DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [state, query])
  return results
}
