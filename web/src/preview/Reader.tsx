import type { Coloring } from "../coloring/coloring.ts"
import { PREVIEW_HEADER_FEATURES } from "../coloring/views.ts"
import type { Assembly, DeputyId } from "../data/assembly.ts"
import { constituencyShort, viewValue } from "../profile/format.ts"
import { Portrait } from "../profile/Portrait.tsx"
import type { Direction } from "./neighbours.ts"
import { usePreview, type PreviewStore } from "./previewStore.ts"

type Props = {
  store: PreviewStore
  assembly: Assembly
  coloring: Coloring
  onOpen: (id: DeputyId) => void
  onStep: (from: DeputyId, direction: Direction) => void
}

export function Reader({ store, assembly, coloring, onOpen, onStep }: Props) {
  const { card } = usePreview(store)
  const deputy = card ? assembly.byId.get(card.id) : undefined
  if (!deputy) {
    return (
      <div className="reader" data-obstacle="">
        <span className="reader-handle" />
        <div className="reader-empty">
          <span className="reader-placeholder" />
          <span>
            <span className="reader-title">Touchez un point pour voir qui siège là.</span>
            <span className="reader-subtitle">Touchez ensuite cette barre pour ouvrir la fiche.</span>
          </span>
        </div>
      </div>
    )
  }
  const value = PREVIEW_HEADER_FEATURES.has(coloring.key) ? null : viewValue(coloring, deputy.id)
  return (
    <div className="reader" data-obstacle="">
      <span className="reader-handle" />
      <div className="reader-row" aria-live="polite">
        <button className="reader-step" onClick={() => onStep(deputy.id, "left")} aria-label="Député voisin à gauche">
          ‹
        </button>
        <button
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
        <button className="reader-step" onClick={() => onStep(deputy.id, "right")} aria-label="Député voisin à droite">
          ›
        </button>
      </div>
    </div>
  )
}
