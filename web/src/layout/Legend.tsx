import type { DeputyId } from "../data/assembly.ts"
import type { Legend as LegendData, Paint } from "../paint/paint.ts"
import { cardShown, usePreview, type PreviewStore } from "../preview/previewStore.ts"
import { numberFormat } from "../profile/format.ts"

type Props = {
  paint: Paint
  store: PreviewStore
  selected: DeputyId | null
  onHover: (members: readonly DeputyId[] | null) => void
}

export function Legend({ paint, store, selected, onHover }: Props) {
  const { target, card } = usePreview(store)
  const focused = target ?? (cardShown(card, selected) ? card.id : null)
  const { legend } = paint
  switch (legend.kind) {
    case "swatches":
      return <Swatches legend={legend} focused={focused} selected={selected} onHover={onHover} />
    case "ramp":
      return <Ramp legend={legend} colorOf={paint.colorOf} focused={focused} selected={selected} />
  }
}

type Focus = { focused: DeputyId | null; selected: DeputyId | null }

function Swatches({ legend, focused, selected, onHover }: Focus & { legend: Extract<LegendData, { kind: "swatches" }>; onHover: Props["onHover"] }) {
  const lit = focused === null ? null : legend.keyOf(focused)
  const chosen = selected === null ? null : legend.keyOf(selected)
  return (
    <ul className="legend panel" data-obstacle="" onPointerLeave={() => onHover(null)}>
      {legend.swatches.map(swatch => {
        const classes = [swatch.key === lit && "lit", swatch.key === chosen && "chosen"].filter(Boolean).join(" ")
        return (
          <li key={swatch.key} className={classes || undefined} title={swatch.title} onPointerEnter={() => onHover(swatch.members)}>
            <span className="legend-dot" style={{ background: swatch.color }} />
            <span className="legend-name">{swatch.label}</span>
            <span className="legend-count">{swatch.members.length}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Ramp({ legend, colorOf, focused, selected }: Focus & { legend: Extract<LegendData, { kind: "ramp" }>; colorOf: Paint["colorOf"] }) {
  const [from, to] = legend.gradient
  const unit = legend.unit ? ` ${legend.unit}` : ""
  const span = legend.max - legend.min || 1
  const percent = (value: number) => `${((value - legend.min) / span) * 100}%`
  const hovered = focused === null ? null : legend.valueOf(focused)
  const chosen = selected === null ? null : legend.valueOf(selected)
  return (
    <div className="legend legend-gradient panel" role="group" aria-label={legend.title} data-obstacle="">
      <div className="gradient-bar" style={{ background: `linear-gradient(to right in oklab, ${from}, ${to})` }}>
        {legend.ticks.map(tick => (
          <span key={tick.value} className="gradient-tick" style={{ left: `${tick.ratio * 100}%` }}>
            {numberFormat.format(tick.value)}
          </span>
        ))}
        {chosen !== null && <span className="gradient-marker chosen" style={{ left: percent(chosen) }} />}
        {focused !== null && hovered !== null && (
          <span className="gradient-marker lit" style={{ left: percent(hovered), background: colorOf(focused) }}>
            <span className="gradient-marker-label">
              {numberFormat.format(hovered)}
              {unit}
            </span>
          </span>
        )}
      </div>
      <span className="legend-count">
        {numberFormat.format(legend.mean)}
        {unit} en moyenne
        {legend.missing > 0 && ` · ${legend.missing} non renseigné${legend.missing > 1 ? "s" : ""}`}
        {!legend.unit && ` · ${legend.title}`}
      </span>
    </div>
  )
}
