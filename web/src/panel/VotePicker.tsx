import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { numberFormat } from "../profile/format.ts"
import { VoteResult } from "../search/VoteResult.tsx"
import { findVotes, type VoteFinder, type VoteMatch } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import type { ChosenVote } from "./rows.ts"

const MAX_RESULTS = 20
const DEBOUNCE_MS = 150

type FinderState = { status: "idle" | "loading" | "failed" } | { status: "ready"; finder: VoteFinder }

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
  const [state, setState] = useState<FinderState>({ status: "idle" })
  const [results, setResults] = useState<VoteMatch[]>([])
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state.status !== "ready") return
    const timeout = setTimeout(() => setResults(findVotes(state.finder, query).slice(0, MAX_RESULTS)), DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [state, query])

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

  const load = () => {
    setOpen(true)
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

  if (chosen !== null && !editing)
    return (
      <div className="vote-chosen">
        <button type="button" className="vote-change" onClick={() => setEditing(true)} aria-label={`Changer de scrutin${chosen.number === null ? "" : `, n° ${chosen.number} choisi`}`}>
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
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    )

  return (
    <div className="vote-picker" ref={wrapper}>
      <label className="vote-search">
        <SearchIcon />
        <span className="visually-hidden">Chercher un scrutin</span>
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder={state.status === "ready" ? `${numberFormat.format(state.finder.votes.length)} scrutins · n° ou mots du titre` : "n° ou mots du titre"}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={load}
          onKeyDown={onKeyDown}
        />
      </label>
      {open && (
        <div className="vote-picks">
          {state.status === "loading" && <p className="search-status">Chargement des scrutins…</p>}
          {state.status === "failed" && <p className="search-status">Scrutins indisponibles.</p>}
          {state.status === "ready" && (
            <>
              {query.trim() === "" && (
                <h3 className="search-section-title">
                  {numberFormat.format(state.finder.votes.filter(vote => vote.major).length)} votes majeurs · les plus récents d'abord
                </h3>
              )}
              {query.trim() !== "" && results.length === 0 && <p className="search-status">Aucun scrutin trouvé.</p>}
              {results.map(result => (
                <VoteResult key={result.ref.id} result={result} labels={state.finder.labels} onSelect={pick} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  )
}
