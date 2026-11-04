import { GLYPH_BOX, type Glyph, type GlyphPart } from "./glyph.ts"

type Props = { glyph: Glyph; size: number; className?: string }

export function GlyphIcon({ glyph, size, className }: Props) {
  return (
    <svg
      className={className ? `glyph ${className}` : "glyph"}
      width={size}
      height={size}
      viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}
      aria-hidden="true"
      focusable="false"
    >
      {glyph.map((part, i) => (
        <Part key={i} part={part} />
      ))}
    </svg>
  )
}

function Part({ part }: { part: GlyphPart }) {
  switch (part.kind) {
    case "dot":
      return <circle cx={part.x} cy={part.y} r={part.r} fill="currentColor" />
    case "block":
      return <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={part.round} fill="currentColor" fillOpacity={part.opacity} />
    case "stroke":
      return <path d={part.d} fill="none" stroke="currentColor" strokeWidth={part.width} strokeOpacity={part.opacity} strokeLinejoin="round" />
  }
}
