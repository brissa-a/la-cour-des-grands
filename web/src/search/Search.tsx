import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AddressSuggestions, type AddressPick } from "../address/AddressSuggestions.tsx"
import type { ConstituencyCode } from "../address/codes.ts"
import { addressesFirst, addressQuery, type GeocodedAddress } from "../address/geocoder.ts"
import { lookup, type Located, type LookupOutcome, type LookupSources } from "../address/lookup.ts"
import { useAddressSuggestions } from "../address/useAddressSuggestions.ts"
import { useConfig } from "../config/useConfig.ts"
import type { Assembly, DeputyId } from "../data/assembly.ts"
import { constituencyLong, shortDate } from "../profile/format.ts"
import { createVoteSearch, searchVotes, type VoteMatch, type VoteSearch } from "../votes/voteSearch.ts"
import { voteTitle, type Vote, type VoteIndex, type VoteLabels } from "../votes/votes.ts"
import { addCommunes, createDeputySearch, type DeputyMatch, type DeputyResult } from "./deputySearch.ts"
import { Highlight } from "./Highlight.tsx"
import { votesFirst } from "./sections.ts"

const MAX_RESULTS = 10
const MAX_VOTES = 8
const MAX_COMMUNES = 20
const DEBOUNCE_MS = 200

type Props = {
  assembly: Assembly
  loadCommunes: () => Promise<ReadonlyMap<DeputyId, string>>
  loadVotes: () => Promise<VoteIndex>
  lookupSources: LookupSources | null
  onHalo: (id: DeputyId | null) => void
  onSelect: (id: DeputyId) => void
  onAddress: (id: DeputyId, located: Located) => void
  onVote: (vote: Vote) => void
  onResults: (ids: ReadonlySet<DeputyId>) => void
}

type VotesState =
  | { status: "idle" | "loading" | "failed" }
  | { status: "ready"; search: VoteSearch; labels: VoteLabels }

export function Search({ assembly, loadCommunes, loadVotes, lookupSources, onHalo, onSelect, onAddress, onVote, onResults }: Props) {
  const index = useMemo(() => createDeputySearch(assembly.deputies), [assembly])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeputyResult[]>([])
  const [communesState, setCommunesState] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [votes, setVotes] = useState<VotesState>({ status: "idle" })
  const [voteResults, setVoteResults] = useState<VoteMatch[]>([])
  const [votesOnTop, setVotesOnTop] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const boundaryMeters = useConfig(config => config.address.boundaryMeters)
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
    const timeout = setTimeout(() => {
      const searched = query.trim() !== ""
      const deputies = searched ? index.search(query).slice(0, MAX_RESULTS) : []
      const found = searched && votes.status === "ready" ? searchVotes(votes.search, query).slice(0, MAX_VOTES) : []
      setResults(deputies)
      setVoteResults(found)
      setVotesOnTop(votes.status === "ready" && votesFirst(query, index, deputies[0], votes.search, found))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query, index, communesState, votes])

  const imprecise = pick?.outcome?.kind === "imprecise" ? pick.outcome : null
  useEffect(() => {
    const highlighted = imprecise
      ? imprecise.candidates.flatMap(c => assembly.byConstituency.get(c)?.id ?? [])
      : results.map(r => r.ref)
    onResults(new Set(highlighted))
  }, [results, imprecise, assembly, onResults])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapper.current?.contains(e.target)) return
      setOpen(false)
      cancelPick()
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [cancelPick])

  const onFocus = () => {
    setOpen(true)
    if (votes.status === "idle") {
      setVotes({ status: "loading" })
      loadVotes()
        .then(async loaded => setVotes({ status: "ready", search: await createVoteSearch(loaded.votes), labels: loaded.labels }))
        .catch((error: unknown) => {
          console.error(error)
          setVotes({ status: "failed" })
        })
    }
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

  const selectVote = (vote: Vote) => {
    setOpen(false)
    onHalo(null)
    onVote(vote)
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
  const searched = query.trim() !== ""
  const voteRows = votes.status === "ready" && voteResults.length > 0 && (
    <section className="search-section" aria-label="Scrutins">
      <h3 className="search-section-title">Scrutins</h3>
      {voteResults.map(result => (
        <VoteRow key={result.ref.id} result={result} labels={votes.labels} onSelect={selectVote} />
      ))}
    </section>
  )

  return (
    <div className="search panel" ref={wrapper} data-obstacle="">
      <input
        type="search"
        autoComplete="off"
        placeholder={lookupSources ? "Rechercher un député, une adresse, un scrutin…" : "Rechercher un député, une commune, un scrutin…"}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={onFocus}
      />
      {open && (
        <div className="search-results">
          {communesState === "loading" && <p className="search-status">Chargement des communes…</p>}
          {communesState === "failed" && <p className="search-status">Communes indisponibles.</p>}
          {searched && votes.status === "loading" && <p className="search-status">Chargement des scrutins…</p>}
          {votes.status === "failed" && <p className="search-status">Scrutins indisponibles.</p>}
          {addressesOnTop && addresses}
          {votesOnTop && voteRows}
          {deputyRows}
          {!votesOnTop && voteRows}
          {!addressesOnTop && addresses}
          {!deputyRows.length && !voteRows && !addresses && <SearchTips addresses={lookupSources !== null} />}
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

type VoteRowProps = { result: VoteMatch; labels: VoteLabels; onSelect: (vote: Vote) => void }

function VoteRow({ result, labels, onSelect }: VoteRowProps) {
  const vote = result.ref
  return (
    <button className="result vote-result" onClick={() => onSelect(vote)}>
      <span className="vote-result-title">
        <Highlight value={voteTitle(vote)} matches={result.matches} />
      </span>
      <span className="vote-result-meta">
        {shortDate(vote.date)} · {labels.result[vote.result]}
        {vote.kind !== "ordinary" && ` · ${labels.kind[vote.kind]}`}
        {vote.major && " · vote majeur"} · n° {vote.number}
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
      <p className="search-tips-votes">Et les scrutins par les mots de leur objet, votes majeurs en tête.</p>
      {addresses && "L'adresse saisie est envoyée au service de géocodage de l'IGN (Géoplateforme) ; ce site ne la conserve pas."}
    </div>
  )
}
