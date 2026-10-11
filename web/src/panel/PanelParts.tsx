import { GlyphIcon } from "../glyph/GlyphIcon.tsx"
import type { FeatureRow, Offer } from "./rows.ts"
import type { Sentence } from "./summary.ts"

export function SummaryLine({ sentence }: { sentence: Sentence }) {
  return (
    <span className="summary-line">
      <GlyphIcon glyph={sentence.glyph} size={20} className="summary-glyph" />
      <span>
        <span className="summary-subject">{sentence.subject}</span> <span className="summary-phrase">{sentence.phrase}</span>
      </span>
    </span>
  )
}

export function RowHead({ row }: { row: FeatureRow }) {
  return (
    <span className="row-head">
      {row.figures.map(({ value, unit }, i) => (
        <span key={i} className="row-figure">
          {i > 0 && <span className="row-dot">· </span>}
          <span className="figure-value">{value}</span> <span className="figure-unit">{unit}</span>
        </span>
      ))}
      {row.figures.length > 0 && <span className="row-dot">·</span>}
      <span className="row-name">{row.name}</span>
    </span>
  )
}

type GlyphProps = {
  offer: Offer
  label: string
  pressed: boolean
  greyed: string | null
  waiting: boolean
  labelled: boolean
  size: number
  onPress: (offer: Offer) => void
  onHint?: (shown: boolean) => void
}

export function GlyphButton({ offer, label, pressed, greyed, waiting, labelled, size, onPress, onHint }: GlyphProps) {
  const classes = ["glyph-button", labelled && "labelled", greyed !== null && "greyed", waiting && "waiting"].filter(Boolean).join(" ")
  const title = greyed === null ? label : `${label} · ${greyed}`
  return (
    <button
      type="button"
      className={classes}
      aria-pressed={pressed}
      aria-label={waiting ? `${title} · en attente d'un scrutin` : title}
      title={title}
      onClick={() => onPress(offer)}
      onPointerEnter={() => onHint?.(true)}
      onPointerLeave={() => onHint?.(false)}
      onFocus={() => onHint?.(true)}
      onBlur={() => onHint?.(false)}
    >
      <GlyphIcon glyph={offer.glyph} size={size} />
      {labelled && <span className="glyph-label">{offer.label}</span>}
    </button>
  )
}

const CHEVRONS = { left: "M14.5 6l-6 6 6 6", right: "M9.5 6l6 6-6 6", up: "M6 15l6-6 6 6" }

export function Chevron({ towards }: { towards: keyof typeof CHEVRONS }) {
  return (
    <svg className="chevron" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d={CHEVRONS[towards]} />
    </svg>
  )
}

export function CloseIcon({ size }: { size: number }) {
  return (
    <svg className="close-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  )
}
