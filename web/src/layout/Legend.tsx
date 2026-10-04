import type { Coloring } from "../coloring/coloring.ts"

type Props = { coloring: Coloring; onHover: (value: string | null) => void }

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

export function Legend({ coloring, onHover }: Props) {
  if (coloring.kind === "category") {
    return (
      <ul className="legend panel" onPointerLeave={() => onHover(null)}>
        {coloring.items.map(item => (
          <li key={item.value} title={item.title} onPointerEnter={() => onHover(item.value)}>
            <span className="legend-dot" style={{ background: item.color }} />
            <span className="legend-name">{item.label}</span>
            <span className="legend-count">{item.count}</span>
          </li>
        ))}
      </ul>
    )
  }
  const [from, to] = coloring.gradient
  const unit = coloring.unit ? ` ${coloring.unit}` : ""
  return (
    <div className="legend legend-gradient panel">
      <span className="legend-title">{coloring.title}</span>
      <div className="gradient-bar" style={{ background: `linear-gradient(to right in oklab, ${from}, ${to})` }}>
        {coloring.ticks.map(tick => (
          <span key={tick.value} className="gradient-tick" style={{ left: `${tick.ratio * 100}%` }}>
            {numberFormat.format(tick.value)}
          </span>
        ))}
      </div>
      <span className="legend-count">
        Moyenne : {numberFormat.format(coloring.mean)}
        {unit}
        {coloring.missing > 0 && ` · ${coloring.missing} non renseigné${coloring.missing > 1 ? "s" : ""}`}
      </span>
    </div>
  )
}
