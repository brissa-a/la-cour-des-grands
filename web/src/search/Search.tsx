import { useEffect, useMemo, useRef, useState } from "react"
import type { Assembly, DeputyId } from "../data/assembly.ts"
import type { DeputyHandlers } from "../hemicycle/Hemicycle.tsx"
import { addCommunes, createDeputySearch, type DeputyMatch, type DeputyResult } from "./deputySearch.ts"
import { Highlight } from "./Highlight.tsx"

const MAX_RESULTS = 10
const MAX_COMMUNES = 20
const DEBOUNCE_MS = 200

type Props = {
  assembly: Assembly
  loadCommunes: () => Promise<ReadonlyMap<DeputyId, string>>
  handlers: DeputyHandlers
  onResults: (ids: ReadonlySet<DeputyId>) => void
}

export function Search({ assembly, loadCommunes, handlers, onResults }: Props) {
  const index = useMemo(() => createDeputySearch(assembly.deputies), [assembly])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeputyResult[]>([])
  const [communesState, setCommunesState] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const found = query.trim() ? index.search(query).slice(0, MAX_RESULTS) : []
      setResults(found)
      onResults(new Set(found.map(r => r.ref)))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query, index, communesState, onResults])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [])

  const onFocus = () => {
    setOpen(true)
    if (communesState !== "idle") return
    setCommunesState("loading")
    loadCommunes()
      .then(communes => {
        addCommunes(index, communes, assembly.deputies)
        setCommunesState("ready")
      })
      .catch((error: unknown) => {
        console.error(error)
        setCommunesState("failed")
      })
  }

  return (
    <div className="search panel" ref={wrapper}>
      <input
        type="search"
        autoComplete="off"
        placeholder="Rechercher un député, une commune, un département…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={onFocus}
      />
      {open && (
        <div className="search-results">
          {communesState === "loading" && <p className="search-status">Chargement des communes…</p>}
          {communesState === "failed" && <p className="search-status">Communes indisponibles.</p>}
          {results.length ? (
            results.map(result => <ResultRow key={result.ref} assembly={assembly} result={result} handlers={handlers} />)
          ) : (
            <SearchTips />
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({ assembly, result, handlers }: { assembly: Assembly; result: DeputyResult; handlers: DeputyHandlers }) {
  const deputy = assembly.byId.get(result.ref)
  if (!deputy) return null
  const { matches } = result
  const of = (column: DeputyMatch["token"]["field"]) => matches.filter(m => m.token.field === column)
  const communes = mostMatchedFirst(of("communes").map(m => m.token.value))
  const groupMatched = of("group").length > 0 || of("group_short").length > 0
  return (
    <button className="result" onPointerEnter={() => handlers.show(deputy.id)} onClick={() => handlers.pin(deputy.id)}>
      <img className="result-photo" src={deputy.photo} alt="" style={{ borderColor: deputy.politicalGroup.color }} />
      <span className="result-text">
        <span className="result-head">
          <span className="result-name">
            <Highlight value={deputy.first_name} matches={of("first_name")} />{" "}
            <Highlight value={deputy.last_name} matches={of("last_name")} />
          </span>
          <span className="result-constituency">
            <Highlight value={deputy.department} matches={of("department")} /> (
            <Highlight value={deputy.department_number} matches={of("department_number")} />) circo n<sup>o</sup>
            <Highlight value={deputy.constituency_number} matches={of("constituency_number")} />
          </span>
        </span>
        {groupMatched && (
          <span className="result-group">
            <Highlight value={deputy.group} matches={of("group")} /> (
            <Highlight value={deputy.politicalGroup.short} matches={of("group_short")} />)
          </span>
        )}
        {communes.length > 0 && (
          <span className="result-communes">
            {communes.slice(0, MAX_COMMUNES).map(commune => (
              <span key={commune}>
                <Highlight value={commune} matches={of("communes")} />
              </span>
            ))}
            {communes.length > MAX_COMMUNES && <span>et {communes.length - MAX_COMMUNES} autres…</span>}
          </span>
        )}
      </span>
    </button>
  )
}

function mostMatchedFirst(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

function SearchTips() {
  return (
    <div className="search-tips">
      Vous pouvez rechercher les députés par :
      <ul>
        <li>nom ou prénom ;</li>
        <li>nom ou numéro de département ;</li>
        <li>nom de commune ou code postal ;</li>
        <li>numéro de circonscription ;</li>
        <li>groupe politique ou sigle.</li>
      </ul>
    </div>
  )
}
