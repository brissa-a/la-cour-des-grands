import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { VoteResult } from "../search/VoteResult.tsx"
import { useVoteFinder, useVoteResults, type FinderState } from "../votes/useVoteFinder.ts"
import type { VoteFinder, VoteMatch } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import { CloseIcon, HeadText, SearchIcon } from "./PanelParts.tsx"
import type { ChosenVote, VoteRow } from "./rows.ts"
import { majorsTitle, votePlaceholder } from "./voteTexts.ts"

type Props = {
  row: VoteRow
  count: number | null
  editing: boolean
  finder: () => Promise<VoteFinder>
  onEditing: (editing: boolean) => void
  onPick: (vote: Vote) => void
  onClear: () => void
}

export function VotePicker({ row, count, editing, finder, onEditing, onPick, onClear }: Props) {
  const [query, setQuery] = useState("")
  const { state, load } = useVoteFinder(finder)
  const results = useVoteResults(state, query)
  const wrapper = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const head = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    head.current?.focus()
  })

  useEffect(() => {
    if (!editing) return
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapper.current?.contains(e.target)) return
      onEditing(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [editing, onEditing])

  const stop = () => {
    refocus.current = true
    setQuery("")
    onEditing(false)
  }

  const pick = (vote: Vote) => {
    stop()
    onPick(vote)
  }

  const clear = () => {
    refocus.current = true
    onClear()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") stop()
  }

  if (!editing) {
    const search = () => onEditing(true)
    return row.chosen === null ? (
      <VoteIdle row={row} ref={head} onSearch={search} />
    ) : (
      <VoteChosen name={row.name} chosen={row.chosen} ref={head} onChange={search} onClear={clear} />
    )
  }

  return (
    <div className="vote-picker" ref={wrapper}>
      <label className="vote-search">
        <SearchIcon />
        <span className="visually-hidden">Chercher un scrutin</span>
        <input
          ref={input}
          type="search"
          autoComplete="off"
          placeholder={votePlaceholder(count)}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={load}
          onKeyDown={onKeyDown}
        />
      </label>
      <div className="vote-picks">
        <VotePicks state={state} query={query} results={results} onPick={pick} />
      </div>
    </div>
  )
}

type IdleProps = { row: VoteRow; ref?: Ref<HTMLButtonElement>; onSearch: () => void; children?: ReactNode }

export function VoteIdle({ row, ref, onSearch, children }: IdleProps) {
  return (
    <button ref={ref} type="button" className="vote-change" onClick={onSearch} aria-label="Chercher un scrutin" title="Chercher un scrutin">
      <SearchIcon />
      <HeadText figures={row.figures} name={row.name} />
      {children}
    </button>
  )
}

type ChosenProps = { name: string; chosen: ChosenVote; ref?: Ref<HTMLButtonElement>; onChange: () => void; onClear: () => void }

export function VoteChosen({ name, chosen, ref, onChange, onClear }: ChosenProps) {
  return (
    <div className="vote-chosen">
      <button ref={ref} type="button" className="vote-change" onClick={onChange} aria-label={`Changer de scrutin${chosen.number === null ? "" : `, n° ${chosen.number} choisi`}`}>
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
          {query.trim() === "" && <h3 className="search-section-title">{majorsTitle(state.finder.votes)}</h3>}
          {query.trim() !== "" && results.length === 0 && <p className="search-status">Aucun scrutin trouvé.</p>}
          {results.map(result => (
            <VoteResult key={result.ref.id} result={result} labels={state.finder.labels} onSelect={onPick} />
          ))}
        </>
      )
  }
}
