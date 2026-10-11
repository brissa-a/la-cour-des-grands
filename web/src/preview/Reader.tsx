import type { DeputyId, Person } from "../data/assembly.ts"
import { constituencyShort } from "../profile/format.ts"
import { Portrait } from "../profile/Portrait.tsx"
import type { ColorLine } from "./lines.ts"
import type { Direction } from "./neighbours.ts"

type Props = {
  deputy: Person
  colorLine: (id: DeputyId) => ColorLine | null
  onOpen: (id: DeputyId) => void
  onStep: (from: DeputyId, direction: Direction) => void
}

export function Reader({ deputy, colorLine, onOpen, onStep }: Props) {
  const value = colorLine(deputy.id)
  return (
    <div className="reader-row" aria-live="polite">
      <button type="button" className="reader-step" onClick={() => onStep(deputy.id, "left")} aria-label="Député voisin à gauche">
        ‹
      </button>
      <button
        type="button"
        className="reader-main"
        onClick={() => onOpen(deputy.id)}
        aria-label={`Ouvrir la fiche de ${deputy.civility} ${deputy.first_name} ${deputy.last_name}`}
      >
        <Portrait deputy={deputy} className="preview-photo reader-photo" />
        <span className="preview-text">
          <span className="preview-name">
            {deputy.first_name} {deputy.last_name}
          </span>
          <span className="preview-group">
            <span className="dot" style={{ background: deputy.politicalGroup.color }} />
            {deputy.politicalGroup.short}
            <span className="muted"> · {constituencyShort(deputy)}</span>
          </span>
          {value && (
            <span className={`preview-value${value.missing ? " missing" : ""}`}>
              <span className="value-dot" style={{ background: value.color }} />
              {value.label}
              {value.caption && <span className="value-caption"> · {value.caption}</span>}
            </span>
          )}
        </span>
      </button>
      <button type="button" className="reader-step" onClick={() => onStep(deputy.id, "right")} aria-label="Député voisin à droite">
        ›
      </button>
    </div>
  )
}
