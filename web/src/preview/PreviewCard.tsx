import { useLayoutEffect, useRef } from "react"
import type { Coloring } from "../coloring/coloring.ts"
import { PREVIEW_HEADER_FEATURES } from "../coloring/views.ts"
import type { Assembly, DeputyId } from "../data/assembly.ts"
import { constituencyShort, viewValue } from "../profile/format.ts"
import { Portrait } from "../profile/Portrait.tsx"
import { placeAbove, placeBeside, type Rect, type Side } from "./placement.ts"
import { cardShown, usePreview, type PreviewStore } from "./previewStore.ts"

const MARGIN = 8

type Props = {
  store: PreviewStore
  assembly: Assembly
  coloring: Coloring
  layoutBy: Coloring | null
  selected: DeputyId | null
  hint: boolean
  touch: boolean
  onOpen: (id: DeputyId) => void
}

export function PreviewCard({ store, assembly, coloring, layoutBy, selected, hint, touch, onOpen }: Props) {
  const { card } = usePreview(store)
  const ref = useRef<HTMLDivElement>(null)
  const side = useRef<Side | null>(null)
  const deputy = card ? assembly.byId.get(card.id) : undefined
  const visible = cardShown(card, selected)
  const geometry = card?.geometry ?? null

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !visible || !geometry) {
      side.current = null
      return
    }
    const input = {
      anchor: geometry.anchor,
      width: element.offsetWidth,
      height: element.offsetHeight,
      bounds: stageBounds(),
      obstacles: obstacles(),
      dots: geometry.dots(),
      dotRadius: geometry.dotRadius,
      keep: side.current,
    }
    const placement = geometry.layout === "chart" ? placeAbove(input) : placeBeside(input)
    side.current = placement.side
    element.dataset.side = placement.side
    element.style.transform = `translate3d(${placement.left}px, ${placement.top}px, 0)`
    element.style.setProperty("--arrow", `${placement.arrow}px`)
    element.style.setProperty("--leader", `${placement.leader}px`)
  }, [card, visible, geometry, coloring, layoutBy, hint])

  if (!deputy) return null
  const colorLine = PREVIEW_HEADER_FEATURES.has(coloring.key) ? null : viewValue(coloring, deputy.id)
  const layoutLine =
    layoutBy && layoutBy.key !== coloring.key && !PREVIEW_HEADER_FEATURES.has(layoutBy.key) ? viewValue(layoutBy, deputy.id) : null

  return (
    <div
      ref={ref}
      className={`preview-card${visible ? " visible" : ""}${touch ? " touch" : ""}`}
      role="tooltip"
      aria-hidden={!visible}
      lang="fr"
    >
      <span className="preview-leader" />
      <div className="preview-body">
        <Portrait deputy={deputy} className="preview-photo" />
        <div className="preview-text">
          <span className="preview-name">
            {deputy.first_name} {deputy.last_name}
          </span>
          <span className="preview-group">
            <span className="dot" style={{ background: deputy.politicalGroup.color }} />
            {deputy.politicalGroup.short}
          </span>
          <span className="preview-constituency">{constituencyShort(deputy)}</span>
          {colorLine && (
            <span className={`preview-value${colorLine.missing ? " missing" : ""}`}>
              <span className="value-dot" style={{ background: colorLine.color }} />
              {colorLine.label}
            </span>
          )}
          {layoutLine && (
            <span className={`preview-value${layoutLine.missing ? " missing" : ""}`}>
              <span className="column-glyph" />
              {layoutLine.label}
            </span>
          )}
          {hint && !touch && <span className="preview-hint">Cliquer pour ouvrir la fiche</span>}
        </div>
      </div>
      {touch && (
        <button className="preview-open" onClick={() => onOpen(deputy.id)}>
          Voir la fiche ›
        </button>
      )}
    </div>
  )
}

function stageBounds(): Rect {
  const stage = document.querySelector(".stage")?.getBoundingClientRect()
  return {
    left: (stage?.left ?? 0) + MARGIN,
    top: (stage?.top ?? 0) + MARGIN,
    right: (stage?.right ?? innerWidth) - MARGIN,
    bottom: (stage?.bottom ?? innerHeight) - MARGIN,
  }
}

function obstacles(): Rect[] {
  return [...document.querySelectorAll("[data-obstacle]")].map(element => element.getBoundingClientRect())
}
