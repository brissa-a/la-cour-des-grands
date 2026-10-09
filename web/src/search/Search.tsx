import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AddressSuggestions, type AddressPick } from "../address/AddressSuggestions.tsx"
import type { ConstituencyCode } from "../address/codes.ts"
import { addressesFirst, addressQuery, type GeocodedAddress } from "../address/geocoder.ts"
import { lookup, type Located, type LookupOutcome, type LookupSources } from "../address/lookup.ts"
import { useAddressSuggestions } from "../address/useAddressSuggestions.ts"
import { useConfig } from "../config/useConfig.ts"
import type { Assembly, DeputyId } from "../data/assembly.ts"
import { constituencyLong } from "../profile/format.ts"
import { addCommunes, createDeputySearch, type DeputyMatch, type DeputyResult } from "./deputySearch.ts"
import { Highlight } from "./Highlight.tsx"

const MAX_RESULTS = 10
const MAX_COMMUNES = 20
const DEBOUNCE_MS = 200

type Props = {
  assembly: Assembly
  loadCommunes: () => Promise<ReadonlyMap<DeputyId, string>>
  lookupSources: LookupSources | null
  onHalo: (id: DeputyId | null) => void
  onSelect: (id: DeputyId) => void
  onAddress: (id: DeputyId, located: Located) => void
  onResults: (ids: ReadonlySet<DeputyId>) => void
}

export function Search({ assembly, loadCommunes, lookupSources, onHalo, onSelect, onAddress, onResults }: Props) {
  const index = useMemo(() => createDeputySearch(assembly.deputies), [assembly])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeputyResult[]>([])
  const [communesState, setCommunesState] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const boundaryMeters = useConfig("address.boundaryMeters")
  const addressText = lookupSources && addressQuery(query)
  const suggestions = useAddressSuggestions(addressText, lookupSources)
  const [pick, setPick] = useState<AddressPick | null>(null)
  const pickToken = useRef(0)

  const cancelPick = useCallback(() => {
    pickToken.current++
    setPick(null)
  }, [])

  useEffect(cancelPick, [query, cancelPick])

  useEffect(() => {
    const timeout = setTimeout(() => setResults(query.trim() ? index.search(query).slice(0, MAX_RESULTS) : []), DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query, index, communesState])

  const imprecise = pick?.outcome?.kind === "imprecise" ? pick.outcome : null
  useEffect(() => {
    const highlighted = imprecise
      ? imprecise.candidates.flatMap(c => assembly.byConstituency.get(c)?.id ?? [])
      : results.map(r => r.ref)
    onResults(new Set(highlighted))
  }, [results, imprecise, assembly, onResults])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (wrapper.current?.contains(e.target as Node)) return
      setOpen(false)
      cancelPick()
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [cancelPick])

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

  const select = (id: DeputyId) => {
    setOpen(false)
    onHalo(null)
    onSelect(id)
  }

  const pickAddress = (address: GeocodedAddress) => {
    if (lookupSources === null) return
    const token = ++pickToken.current
    setPick({ address, outcome: null })
    const settle = (outcome: LookupOutcome) => {
      if (token !== pickToken.current) return
      if (outcome.kind !== "located") {
        setPick({ address, outcome })
        return
      }
      const deputy = assembly.byConstituency.get(outcome.constituency)
      if (!deputy) {
        setPick({ address, outcome: { kind: "vacant", constituency: outcome.constituency } })
        return
      }
      cancelPick()
      setOpen(false)
      onHalo(null)
      onAddress(deputy.id, outcome)
    }
    lookup(address, lookupSources, boundaryMeters).then(settle, (error: unknown) => {
      console.error(error)
      settle({ kind: "unavailable", address })
    })
  }

  const renderCandidate = (constituency: ConstituencyCode) => {
    const deputy = assembly.byConstituency.get(constituency)
    const label = assembly.constituencyLabels.get(constituency)
    if (!deputy) {
      return (
        <p className="search-status">
          Siège vacant <span className="fact-label">{label ? constituencyLong(label) : constituency}</span>
        </p>
      )
    }
    return <ResultRow assembly={assembly} result={{ ref: deputy.id, matches: [], score: 0 }} onHalo={onHalo} onSelect={select} />
  }

  const deputyRows = results.map(result => (
    <ResultRow key={result.ref} assembly={assembly} result={result} onHalo={onHalo} onSelect={select} />
  ))
  const addresses = addressText !== null && (
    <AddressSuggestions
      assembly={assembly}
      suggestions={suggestions}
      pick={pick}
      onPick={pickAddress}
      renderCandidate={renderCandidate}
    />
  )
  const addressesOnTop = addressesFirst(query)

  return (
    <div className="search panel" ref={wrapper} data-obstacle="">
      <input
        type="search"
        autoComplete="off"
        placeholder={
          lookupSources ? "Rechercher un député, une adresse, une commune…" : "Rechercher un député, une commune, un département…"
        }
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={onFocus}
      />
      {open && (
        <div className="search-results">
          {communesState === "loading" && <p className="search-status">Chargement des communes…</p>}
          {communesState === "failed" && <p className="search-status">Communes indisponibles.</p>}
          {addressesOnTop && addresses}
          {deputyRows}
          {!addressesOnTop && addresses}
          {!deputyRows.length && !addresses && <SearchTips addresses={lookupSources !== null} />}
        </div>
      )}
    </div>
  )
}

type RowProps = {
  assembly: Assembly
  result: DeputyResult
  onHalo: (id: DeputyId | null) => void
  onSelect: (id: DeputyId) => void
}

function ResultRow({ assembly, result, onHalo, onSelect }: RowProps) {
  const deputy = assembly.byId.get(result.ref)
  if (!deputy) return null
  const { matches } = result
  const of = (column: DeputyMatch["token"]["field"]) => matches.filter(m => m.token.field === column)
  const communes = mostMatchedFirst(of("communes").map(m => m.token.value))
  const groupMatched = of("group").length > 0 || of("group_short").length > 0
  return (
    <button
      className="result"
      onPointerEnter={() => onHalo(deputy.id)}
      onPointerLeave={() => onHalo(null)}
      onFocus={() => onHalo(deputy.id)}
      onBlur={() => onHalo(null)}
      onClick={() => onSelect(deputy.id)}
    >
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

function SearchTips({ addresses }: { addresses: boolean }) {
  return (
    <div className="search-tips">
      Vous pouvez rechercher les députés par :
      <ul>
        <li>nom ou prénom ;</li>
        <li>nom ou numéro de département ;</li>
        <li>nom de commune ou code postal ;</li>
        {addresses && <li>une adresse (numéro et rue) ;</li>}
        <li>numéro de circonscription ;</li>
        <li>groupe politique ou sigle.</li>
      </ul>
      {addresses && "L'adresse saisie est envoyée au service de géocodage de l'IGN (Géoplateforme) ; ce site ne la conserve pas."}
    </div>
  )
}
