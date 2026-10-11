import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { numberFormat } from "../profile/format.ts"
import { VoteResult } from "../search/VoteResult.tsx"
import { findVotes, type VoteFinder, type VoteMatch } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import { CloseIcon, SearchIcon } from "./PanelParts.tsx"
import type { ChosenVote } from "./rows.ts"

const MAX_RESULTS = 20
const DEBOUNCE_MS = 150

export type FinderState = { status: "idle" | "loading" | "failed" } | { status: "ready"; finder: VoteFinder }

type Props = {
  name: string
  chosen: ChosenVote | null
  finder: () => Promise<VoteFinder>
  inputRef: RefObject<HTMLInputElement | null>
  onPick: (vote: Vote) => void
  onClear: () => void
}

export function VotePicker({ name, chosen, finder, inputRef, onPick, onClear }: Props) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const { state, load } = useVoteFinder(finder)
  const results = useVoteResults(state, query)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing, inputRef])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapper.current?.contains(e.target)) return
      setOpen(false)
      setEditing(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [])

  const pick = (vote: Vote) => {
    setOpen(false)
    setEditing(false)
    setQuery("")
    onPick(vote)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return
    setOpen(false)
    setEditing(false)
  }

  if (chosen !== null && !editing) return <VoteChosen name={name} chosen={chosen} onChange={() => setEditing(true)} onClear={onClear} />

  return (
    <div className="vote-picker" ref={wrapper}>
      <label className="vote-search">
        <SearchIcon />
        <span className="visually-hidden">Chercher un scrutin</span>
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder={votePlaceholder(state)}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true)
            load()
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      {open && (
        <div className="vote-picks">
          <VotePicks state={state} query={query} results={results} onPick={pick} />
        </div>
      )}
    </div>
  )
}

type ChosenProps = { name: string; chosen: ChosenVote; onChange: () => void; onClear: () => void }

export function VoteChosen({ name, chosen, onChange, onClear }: ChosenProps) {
  return (
    <div className="vote-chosen">
      <button type="button" className="vote-change" onClick={onChange} aria-label={`Changer de scrutin${chosen.number === null ? "" : `, n° ${chosen.number} choisi`}`}>
        <SearchIcon />
        {chosen.number !== null && (
          <span className="row-figure">
            <span className="figure-unit">n°</span> <span className="figure-value">{chosen.number}</span>
          </span>
        )}
        {chosen.number !== null && <span className="row-dot">·</span>}
        <span className="row-name">{name}</span>
      </button>
      <button type="button" className="vote-clear" onClick={onClear} aria-label="Retirer le scrutin" title="Retirer le scrutin">
        <CloseIcon size={14} />
      </button>
    </div>
  )
}

export function useVoteFinder(finder: () => Promise<VoteFinder>): { state: FinderState; load: () => void } {
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

export function votePlaceholder(state: FinderState): string {
  return state.status === "ready" ? `${numberFormat.format(state.finder.votes.length)} scrutins · n° ou mots du titre` : "n° ou mots du titre"
}

type PicksProps = { state: FinderState; query: string; results: readonly VoteMatch[]; onPick: (vote: Vote) => void }

export function VotePicks({ state, query, results, onPick }: PicksProps) {
  switch (state.status) {
    case "idle":
      return null
    case "loading":
      return <p className="search-status">Chargement des scrutins…</p>
    case "failed":
      return <p className="search-status">Scrutins indisponibles.</p>
    case "ready":
      return (
        <>
          {query.trim() === "" && (
            <h3 className="search-section-title">
              {numberFormat.format(state.finder.votes.filter(vote => vote.major).length)} votes majeurs · les plus récents d'abord
            </h3>
          )}
          {query.trim() !== "" && results.length === 0 && <p className="search-status">Aucun scrutin trouvé.</p>}
          {results.map(result => (
            <VoteResult key={result.ref.id} result={result} labels={state.finder.labels} onSelect={onPick} />
          ))}
        </>
      )
  }
}
