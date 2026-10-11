import { useEffect, useState, type KeyboardEvent } from "react"
import type { VoteFinder } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import type { Pending } from "./intent.ts"
import { Chevron, SearchIcon } from "./PanelParts.tsx"
import { afterPick } from "./summary.ts"
import { useVoteFinder, useVoteResults, votePlaceholder, VotePicks } from "./VotePicker.tsx"

type Props = { finder: () => Promise<VoteFinder>; pending: Pending | null; onPick: (vote: Vote) => void; onBack: () => void }

export function VoteSearchScreen({ finder, pending, onPick, onBack }: Props) {
  const [query, setQuery] = useState("")
  const { state, load } = useVoteFinder(finder)
  const results = useVoteResults(state, query)

  useEffect(load, [])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onBack()
  }

  return (
    <div className="vote-screen" role="dialog" aria-modal="true" aria-label="Choisir un scrutin">
      <div className="vote-screen-top">
        <button type="button" className="icon-button vote-screen-back" onClick={onBack} aria-label="Retour aux réglages de la vue">
          <Chevron towards="left" />
        </button>
        <label className="vote-search">
          <SearchIcon />
          <span className="visually-hidden">Chercher un scrutin</span>
          <input
            type="search"
            autoComplete="off"
            autoFocus
            enterKeyHint="search"
            placeholder={votePlaceholder(state)}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>
      <p className="vote-screen-then">{afterPick(pending)}</p>
      <div className="vote-screen-results">
        <VotePicks state={state} query={query} results={results} onPick={onPick} />
      </div>
    </div>
  )
}
