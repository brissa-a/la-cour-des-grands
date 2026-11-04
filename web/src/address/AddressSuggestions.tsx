import type { ReactNode } from "react"
import type { Assembly } from "../data/assembly.ts"
import { constituencyLong } from "../profile/format.ts"
import type { ConstituencyCode } from "./codes.ts"
import { addressLines, ELECTORAL_SITUATION_URL, TYPE_MARKERS } from "./format.ts"
import type { GeocodedAddress } from "./geocoder.ts"
import type { Located, LookupOutcome } from "./lookup.ts"
import type { Suggestions } from "./useAddressSuggestions.ts"

const LOW_SCORE = 0.5

export type ShownOutcome = Exclude<LookupOutcome, Located> | { kind: "vacant"; constituency: ConstituencyCode }

export type AddressPick = { address: GeocodedAddress; outcome: ShownOutcome | null }

type Props = {
  assembly: Assembly
  suggestions: Suggestions
  pick: AddressPick | null
  onPick: (address: GeocodedAddress) => void
  renderCandidate: (constituency: ConstituencyCode) => ReactNode
}

export function AddressSuggestions({ assembly, suggestions, pick, onPick, renderCandidate }: Props) {
  const listed = "addresses" in suggestions ? suggestions.addresses : []
  const pickedKey = pick && addressKey(pick.address)
  const addresses = pick && !listed.some(a => addressKey(a) === pickedKey) ? [pick.address, ...listed] : listed
  const ready = suggestions.status === "ready"
  return (
    <section className="search-section" aria-label="Adresses">
      <h3 className="search-section-title">Adresses</h3>
      {suggestions.status === "failed" && <p className="search-status">Recherche d'adresse indisponible.</p>}
      {!ready && suggestions.status !== "failed" && addresses.length === 0 && (
        <p className="search-status">Recherche d'adresses…</p>
      )}
      {ready && listed.length === 0 && <p className="search-status">Aucune adresse trouvée en France.</p>}
      {addresses.map(address => {
        const { name, place } = addressLines(address)
        const key = addressKey(address)
        const picked = key === pickedKey ? pick : null
        return (
          <div key={key} className={picked ? "address picked" : "address"}>
            <button className="result address-result" onClick={() => onPick(address)}>
              <span className="address-name">
                {name}
                {address.type !== "housenumber" && <span className="address-marker">{TYPE_MARKERS[address.type]}</span>}
              </span>
              {place && <span className="address-place">{place}</span>}
            </button>
            {picked && <PickOutcome assembly={assembly} pick={picked} renderCandidate={renderCandidate} />}
          </div>
        )
      })}
      {ready && listed.every(a => a.score < LOW_SCORE) && <AbroadHint />}
    </section>
  )
}

function addressKey(address: GeocodedAddress): string {
  return `${address.type} ${address.label} ${address.point.join()}`
}

function AbroadHint() {
  return (
    <p className="search-status">
      Vous vivez à l'étranger ? Les 11 députés des Français de l'étranger sont élus par zone : cherchez la ville de votre
      consulat (Londres, Montréal, Dakar…) ou « hors de France ».
    </p>
  )
}

type OutcomeProps = { assembly: Assembly; pick: AddressPick; renderCandidate: (constituency: ConstituencyCode) => ReactNode }

function PickOutcome({ assembly, pick: { address, outcome }, renderCandidate }: OutcomeProps) {
  if (outcome === null) return <p className="address-outcome">Recherche de la circonscription…</p>
  switch (outcome.kind) {
    case "unavailable":
      return <p className="address-outcome">Circonscription introuvable : données indisponibles. Réessayez.</p>
    case "unknown-commune":
      return (
        <p className="address-outcome">
          {address.city} : commune absente des données (code INSEE {address.citycode}).
        </p>
      )
    case "vacant": {
      const label = assembly.constituencyLabels.get(outcome.constituency)
      return (
        <p className="address-outcome">
          <span className="address-value">Siège vacant</span>{" "}
          <span className="fact-label">{label ? constituencyLong(label) : outcome.constituency}</span>
        </p>
      )
    }
    case "imprecise": {
      const { name } = addressLines(address)
      const count = outcome.candidates.length
      return (
        <>
          <p className="address-outcome">
            {outcome.reason === "municipality" && `${address.city} compte ${count} circonscriptions : précisez le numéro et la rue.`}
            {outcome.reason === "mixed-street" &&
              `${name} : ${address.type === "locality" ? "lieu-dit partagé" : "voie partagée"} entre ${count} circonscriptions, précisez le numéro.`}
            {outcome.reason === "no-data" && (
              <>
                {address.city} compte {count} circonscriptions ; cette adresse n'a pas pu être située précisément.{" "}
                <a href={ELECTORAL_SITUATION_URL} target="_blank" rel="noreferrer">
                  Interroger sa situation électorale ↗
                </a>
              </>
            )}
          </p>
          {outcome.candidates.map(constituency => (
            <div key={constituency}>{renderCandidate(constituency)}</div>
          ))}
        </>
      )
    }
  }
}
