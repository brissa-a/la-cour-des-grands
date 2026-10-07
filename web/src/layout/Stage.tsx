import { memo } from "react"
import type { Assembly, Deputy, DeputyId } from "../data/assembly.ts"
import type { Chart, Point } from "./chart.ts"
import { PanZoomSvg } from "./PanZoomSvg.tsx"

export const SEAT_RADIUS = 0.019

// Chrome skips repainting SVG elements whose CSS transform transitions use coordinates around ±1.
const DOT_SCALE = 100

export type DeputyHandlers = {
  show: (id: DeputyId) => void
  pin: (id: DeputyId) => void
}

type Props = {
  assembly: Assembly
  chart: Chart | null
  highlighted: ReadonlySet<DeputyId>
  showPhotos: boolean
  colorOf: (id: DeputyId) => string
  handlers: DeputyHandlers
}

export function Stage({ assembly, chart, highlighted, showPhotos, colorOf, handlers }: Props) {
  const radius = chart?.radius ?? SEAT_RADIUS
  return (
    <PanZoomSvg viewBox={assembly.background.viewBox}>
      <defs>
        <clipPath id="seat-clip" clipPathUnits="objectBoundingBox">
          <circle cx={0.5} cy={0.5} r={0.5} />
        </clipPath>
      </defs>
      <g className={chart ? "room hidden" : "room"}>
        <g className="hemicycle-background" dangerouslySetInnerHTML={{ __html: assembly.background.markup }} />
        <g transform={`scale(${1 / DOT_SCALE})`}>
          {assembly.emptySeats.map(seat => (
            <circle
              key={seat.number}
              className="empty-seat"
              cx={seat.x * DOT_SCALE}
              cy={seat.y * DOT_SCALE}
              r={SEAT_RADIUS * DOT_SCALE}
            />
          ))}
        </g>
      </g>
      {chart && <ChartAxes chart={chart} />}
      <g transform={`scale(${1 / DOT_SCALE})`}>
        {assembly.deputies.map((deputy, index) => (
          <DeputyDot
            key={deputy.id}
            deputy={deputy}
            position={chart?.positions.get(deputy.id) ?? deputy.seat}
            radius={radius}
            delay={(index % 40) * 0.012}
            color={colorOf(deputy.id)}
            highlighted={highlighted.has(deputy.id)}
            showPhoto={showPhotos}
            handlers={handlers}
          />
        ))}
      </g>
    </PanZoomSvg>
  )
}

function ChartAxes({ chart }: { chart: Chart }) {
  const { pitch, baseline, columns } = chart
  const first = columns[0]
  const last = columns[columns.length - 1]
  if (!first || !last) return null
  const left = first.x - pitch
  const right = last.x + last.width + pitch
  const fontSize = Math.min(0.045, pitch * 2.4)
  const rotate = columns.length > 8
  return (
    <g className="chart-axes" style={{ fontSize }}>
      {chart.gridRows.map(row => {
        const y = baseline - row * pitch
        return (
          <g key={row}>
            <line x1={left} x2={right} y1={y} y2={y} />
            <text x={left - fontSize * 0.4} y={y} textAnchor="end" dominantBaseline="middle">
              {row * chart.columnWidth}
            </text>
          </g>
        )
      })}
      <line className="chart-baseline" x1={left} x2={right} y1={baseline} y2={baseline} />
      {columns.map(column => {
        const x = column.x + column.width / 2
        const y = baseline + fontSize * 1.2
        return (
          <text
            key={column.key}
            x={x}
            y={y}
            textAnchor={rotate ? "end" : "middle"}
            dominantBaseline="hanging"
            transform={rotate ? `rotate(-40 ${x} ${y})` : undefined}
          >
            <title>{`${column.title} : ${column.count}`}</title>
            {column.label} ({column.count})
          </text>
        )
      })}
    </g>
  )
}

type DotProps = {
  deputy: Deputy
  position: Point
  radius: number
  delay: number
  color: string
  highlighted: boolean
  showPhoto: boolean
  handlers: DeputyHandlers
}

const DeputyDot = memo(function DeputyDot({ deputy, position, radius: unscaledRadius, delay, color, highlighted, showPhoto, handlers }: DotProps) {
  const radius = unscaledRadius * DOT_SCALE
  return (
    <g
      className={highlighted ? "seat highlighted" : "seat"}
      style={{ transform: `translate(${position.x * DOT_SCALE}px, ${position.y * DOT_SCALE}px)`, transitionDelay: `${delay}s` }}
      onPointerEnter={() => handlers.show(deputy.id)}
      onClick={() => handlers.pin(deputy.id)}
    >
      <circle className="seat-dot" r={radius} style={{ fill: color }} />
      {showPhoto && (
        <image
          href={deputy.photo}
          x={-radius}
          y={-radius}
          width={radius * 2}
          height={radius * 2}
          clipPath="url(#seat-clip)"
          opacity={0.85}
        />
      )}
    </g>
  )
})
