import type { Coloring } from "../coloring/coloring.ts"
import { MISSING } from "../coloring/coloring.ts"
import type { DeputyId } from "../data/assembly.ts"
import { cardShown, usePreview, type PreviewStore } from "../preview/previewStore.ts"
import { numberFormat } from "../profile/format.ts"

type Props = {
  coloring: Coloring
  store: PreviewStore
  selected: DeputyId | null
  onHover: (value: string | null) => void
}

export function Legend({ coloring, store, selected, onHover }: Props) {
  const { target, card } = usePreview(store)
  const focused = target ?? (cardShown(card, selected) ? card.id : null)
  const hovered = focused === null ? null : coloring.valueOf(focused)
  const chosen = selected === null ? null : coloring.valueOf(selected)

  if (coloring.kind === "category") {
    return (
      <ul className="legend panel" data-obstacle="" onPointerLeave={() => onHover(null)}>
        {coloring.items.map(item => {
          const classes = [item.value === hovered && "lit", item.value === chosen && "chosen"].filter(Boolean).join(" ")
          return (
            <li key={item.value} className={classes || undefined} title={item.title} onPointerEnter={() => onHover(item.value)}>
              <span className="legend-dot" style={{ background: item.color }} />
              <span className="legend-name">{item.label}</span>
              <span className="legend-count">{item.count}</span>
            </li>
          )
        })}
      </ul>
    )
  }
  const [from, to] = coloring.gradient
  const unit = coloring.unit ? ` ${coloring.unit}` : ""
  const span = coloring.max - coloring.min || 1
  const percent = (value: string) => `${((Number(value) - coloring.min) / span) * 100}%`
  return (
    <div className="legend legend-gradient panel" data-obstacle="">
      <span className="legend-title">{coloring.title}</span>
      <div className="gradient-bar" style={{ background: `linear-gradient(to right in oklab, ${from}, ${to})` }}>
        {coloring.ticks.map(tick => (
          <span key={tick.value} className="gradient-tick" style={{ left: `${tick.ratio * 100}%` }}>
            {numberFormat.format(tick.value)}
          </span>
        ))}
        {chosen !== null && chosen !== MISSING && <span className="gradient-marker chosen" style={{ left: percent(chosen) }} />}
        {focused !== null && hovered !== null && hovered !== MISSING && (
          <span className="gradient-marker lit" style={{ left: percent(hovered), background: coloring.colorOf(focused) }}>
            <span className="gradient-marker-label">
              {numberFormat.format(Number(hovered))}
              {unit}
            </span>
          </span>
        )}
      </div>
      <span className="legend-count">
        Moyenne : {numberFormat.format(coloring.mean)}
        {unit}
        {coloring.missing > 0 && ` · ${coloring.missing} non renseigné${coloring.missing > 1 ? "s" : ""}`}
      </span>
    </div>
  )
}
