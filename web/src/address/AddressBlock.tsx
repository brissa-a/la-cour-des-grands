import type { Assembly, Deputy, DeputyId } from "../data/assembly.ts"
import type { ConstituencyCode } from "./codes.ts"
import { addressText, constituencyOrdinal, distanceText, ELECTORAL_SITUATION_URL, SOURCES, UNCONFIRMED_REASONS } from "./format.ts"
import type { Located } from "./lookup.ts"

type Props = {
  located: Located
  deputy: Deputy
  assembly: Assembly
  onOpen: (id: DeputyId) => void
}

export function AddressBlock({ located, deputy, assembly, onOpen }: Props) {
  const { basis } = located
  const unconfirmed = basis.kind === "unconfirmed" ? basis : null
  const isAnswer = deputy.constituency === located.constituency
  if (!isAnswer && deputy.constituency !== unconfirmed?.other) return null
  return (
    <div className="address-block">
      <p>
        <span className="address-value">{addressText(located.address)}</span>{" "}
        <span className="fact-label">{isAnswer ? "adresse recherchée" : "autre circonscription possible"}</span>
      </p>
      <p>
        {SOURCES[basis.kind]} <span className="fact-label">source</span>
      </p>
      {unconfirmed && (
        <>
          <p className="address-warning">
            {distanceText(unconfirmed.otherMeters, isAnswer ? `la ${constituencyOrdinal(unconfirmed.other)}` : "cette circonscription")}
          </p>
          <p>
            Résultat à confirmer : {UNCONFIRMED_REASONS[unconfirmed.reason]}.{" "}
            <a href={ELECTORAL_SITUATION_URL} target="_blank" rel="noreferrer">
              Interroger sa situation électorale ↗
            </a>
          </p>
          <OtherDeputy
            constituency={isAnswer ? unconfirmed.other : located.constituency}
            assembly={assembly}
            onOpen={onOpen}
          />
        </>
      )}
    </div>
  )
}

type OtherProps = { constituency: ConstituencyCode; assembly: Assembly; onOpen: (id: DeputyId) => void }

function OtherDeputy({ constituency, assembly, onOpen }: OtherProps) {
  const other = assembly.byConstituency.get(constituency)
  if (!other) {
    return (
      <p>
        Siège vacant <span className="fact-label">{constituencyOrdinal(constituency)}</span>
      </p>
    )
  }
  return (
    <button className="text-button address-other" onClick={() => onOpen(other.id)}>
      Voir {other.first_name} {other.last_name} <span className="fact-label">{constituencyOrdinal(constituency)}</span>
    </button>
  )
}
