import { useEffect, useRef, useState, type ReactNode } from "react"
import type { Person, Seat } from "../data/assembly.ts"
import type { Where } from "../forms/form.ts"
import type { Colored } from "../preview/lines.ts"
import { birth, constituencyLong, numberFormat } from "./format.ts"

const COPIED_MS = 1500

type Props = {
  deputy: Person
  seat: Seat | undefined
  open: boolean
  colored: Colored
  place: Extract<Where, { kind: "part" }> | null
  total: number
  outOfView: string | null
  officialPage: string | undefined
  address: ReactNode
  onClose: () => void
}

export function DeputyPanel({ deputy, seat, open, colored, place, total, outOfView, officialPage, address, onClose }: Props) {
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
      {address}
      <ul className="panel-facts">
        <li>{constituencyLong(deputy)}</li>
        <li>
          {birth(deputy)} · {deputy.age} ans
        </li>
        {seat && (
          <li>
            n° {seat.number} <span className="fact-label">siège</span>
          </li>
        )}
      </ul>
      <section className="panel-section">
        <h3>Dans la vue actuelle</h3>
        {outOfView === null ? (
          <>
            <CurrentValue colored={colored} deputy={deputy} total={total} />
            {place && <LayoutValue place={place} />}
          </>
        ) : (
          <p className="panel-value muted">{outOfView}</p>
        )}
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

function CurrentValue({ colored: { reading, paint }, deputy, total }: { colored: Colored; deputy: Person; total: number }) {
  const value = reading.lineOf(deputy.id)
  if (!value) return null
  const color = paint.colorOf(deputy.id)
  const { legend } = paint
  switch (legend.kind) {
    case "swatches": {
      const key = legend.keyOf(deputy.id)
      const count = legend.swatches.find(swatch => swatch.key === key)?.members.length ?? 0
      return (
        <p className="panel-value">
          <span className="dot" style={{ background: color }} />
          <span className="panel-value-label">{value.label}</span>
          <span className="muted">
            {value.caption && `· ${value.caption} `}· {count} député{count > 1 ? "s" : ""} sur {total}
          </span>
        </p>
      )
    }
    case "ramp": {
      const [from, to] = legend.gradient
      const span = legend.max - legend.min || 1
      const percent = (n: number) => `${((n - legend.min) / span) * 100}%`
      const at = legend.valueOf(deputy.id)
      return (
        <div className="panel-scale">
          <p className="panel-value">
            <span className="panel-value-label">{value.label}</span>
            {value.caption && <span className="muted">· {value.caption}</span>}
          </p>
          <div className="mini-scale" style={{ background: `linear-gradient(to right in oklab, ${from}, ${to})` }}>
            <span className="mini-mean" style={{ left: percent(legend.mean) }} />
            {at !== null && <span className="mini-marker" style={{ left: percent(at), background: color }} />}
          </div>
          <div className="mini-labels">
            <span>{numberFormat.format(legend.min)}</span>
            <span className="mini-mean-label" style={{ left: percent(legend.mean) }}>
              {numberFormat.format(legend.mean)}
              {legend.unit && ` ${legend.unit}`} en moyenne
            </span>
            <span>{numberFormat.format(legend.max)}</span>
          </div>
        </div>
      )
    }
  }
}

function LayoutValue({ place: { part, within } }: { place: Extract<Where, { kind: "part" }> }) {
  const count = part.members.length
  return (
    <p className="panel-value">
      <span className="column-glyph" />
      <span className="panel-value-label">{part.label}</span>
      <span className="muted">
        {part.caption && `· ${part.caption} `}· {count} député{count > 1 ? "s" : ""} dans {within}
      </span>
    </p>
  )
}
