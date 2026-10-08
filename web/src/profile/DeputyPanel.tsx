import { useEffect, useRef, useState } from "react"
import type { Coloring } from "../coloring/coloring.ts"
import type { Deputy } from "../data/assembly.ts"
import type { Chart } from "../layout/chart.ts"
import { constituencyLong, formatDate, numberFormat, viewValue } from "./format.ts"

const COPIED_MS = 1500

type Props = {
  deputy: Deputy
  open: boolean
  coloring: Coloring
  chart: Chart | null
  layoutBy: Coloring | null
  total: number
  officialPage: string | undefined
  onClose: () => void
}

export function DeputyPanel({ deputy, open, coloring, chart, layoutBy, total, officialPage, onClose }: Props) {
  const scroller = useRef<HTMLElement>(null)
  const color = deputy.politicalGroup.color

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [deputy.id])

  return (
    <aside
      ref={scroller}
      className={`deputy-panel${open ? " open" : ""}`}
      aria-labelledby="deputy-panel-title"
      inert={!open}
      {...(open ? { "data-obstacle": "" } : {})}
    >
      <div className="panel-bar">
        <CopyLink />
        <button className="panel-close" onClick={onClose} aria-label="Fermer la fiche" title="Fermer (Échap)">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5 L15 15 M15 5 L5 15" />
          </svg>
        </button>
      </div>
      <div className="portrait">
        <img className="portrait-photo" src={deputy.photo} alt="" style={{ borderColor: color }} />
      </div>
      <div className="panel-identity">
        <span className="civility">{deputy.civility}</span>
        <h2 id="deputy-panel-title">
          {deputy.first_name} {deputy.last_name}
        </h2>
        <span className="panel-group">
          <span className="dot" style={{ background: color }} />
          {deputy.politicalGroup.name} ({deputy.politicalGroup.short})
        </span>
      </div>
      <dl className="panel-facts">
        <dt>Circonscription</dt>
        <dd>{constituencyLong(deputy)}</dd>
        <dt>Naissance</dt>
        <dd>
          {formatDate(deputy.birth_date)} ({deputy.age} ans)
        </dd>
        <dt>Siège</dt>
        <dd>n° {deputy.seat.number}</dd>
      </dl>
      <section className="panel-section">
        <h3>Dans la vue actuelle</h3>
        <CurrentValue coloring={coloring} deputy={deputy} total={total} />
        {chart && layoutBy && layoutBy.key !== coloring.key && <LayoutValue chart={chart} layoutBy={layoutBy} deputy={deputy} />}
      </section>
      {officialPage && (
        <a className="official-link" href={officialPage} target="_blank" rel="noreferrer">
          <img src="/logo-gris.png" alt="" width={24} /> Fiche sur le site de l'Assemblée ↗
        </a>
      )}
      <section className="panel-section">
        <h3>Votes</h3>
        <p className="panel-placeholder">Les positions de vote seront affichées ici.</p>
      </section>
    </aside>
  )
}

function CopyLink() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timeout)
  }, [copied])
  const copy = () => {
    navigator.clipboard.writeText(location.href).then(
      () => setCopied(true),
      (error: unknown) => console.error(error),
    )
  }
  return (
    <button className="panel-copy" onClick={copy}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.4-2.4a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
      </svg>
      {copied ? "Lien copié" : "Copier le lien"}
    </button>
  )
}

function CurrentValue({ coloring, deputy, total }: { coloring: Coloring; deputy: Deputy; total: number }) {
  const value = viewValue(coloring, deputy.id)
  if (coloring.kind === "category") {
    const count = coloring.items.find(i => i.value === coloring.valueOf(deputy.id))?.count ?? 0
    return (
      <p className="panel-value">
        <span className="dot" style={{ background: value.color }} />
        <span className="panel-value-label">{value.label}</span>
        <span className="muted">
          · {count} député{count > 1 ? "s" : ""} sur {total}
        </span>
      </p>
    )
  }
  const [from, to] = coloring.gradient
  const span = coloring.max - coloring.min || 1
  const percent = (n: number) => `${((n - coloring.min) / span) * 100}%`
  const raw = coloring.valueOf(deputy.id)
  return (
    <div className="panel-scale">
      <p className="panel-value">
        <span className="muted">{coloring.title} · </span>
        <span className="panel-value-label">{value.label}</span>
      </p>
      <div className="mini-scale" style={{ background: `linear-gradient(to right in oklab, ${from}, ${to})` }}>
        <span className="mini-mean" style={{ left: percent(coloring.mean) }} />
        {!value.missing && <span className="mini-marker" style={{ left: percent(Number(raw)), background: value.color }} />}
      </div>
      <div className="mini-labels">
        <span>{numberFormat.format(coloring.min)}</span>
        <span className="mini-mean-label" style={{ left: percent(coloring.mean) }}>
          moyenne {numberFormat.format(coloring.mean)}
          {coloring.unit && ` ${coloring.unit}`}
        </span>
        <span>{numberFormat.format(coloring.max)}</span>
      </div>
    </div>
  )
}

function LayoutValue({ chart, layoutBy, deputy }: { chart: Chart; layoutBy: Coloring; deputy: Deputy }) {
  const position = chart.positions.get(deputy.id)
  const column = position && chart.columns.find(c => position.x >= c.x && position.x <= c.x + c.width)
  if (!column) return null
  return (
    <p className="panel-value">
      <span className="muted">Disposition : </span>
      {layoutBy.title} · colonne {column.label}
      <span className="muted">
        {" "}
        ({column.count} député{column.count > 1 ? "s" : ""})
      </span>
    </p>
  )
}
