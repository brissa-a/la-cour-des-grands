import { memo } from "react"
import type { Assembly, Deputy, DeputyId } from "../data/assembly.ts"
import { PanZoomSvg } from "./PanZoomSvg.tsx"

const SEAT_RADIUS = 0.019

export type DeputyHandlers = {
  show: (id: DeputyId) => void
  pin: (id: DeputyId) => void
}

type Props = {
  assembly: Assembly
  highlighted: ReadonlySet<DeputyId>
  showPhotos: boolean
  colorOf: (id: DeputyId) => string
  handlers: DeputyHandlers
}

export function Hemicycle({ assembly, highlighted, showPhotos, colorOf, handlers }: Props) {
  return (
    <PanZoomSvg viewBox={assembly.background.viewBox}>
      <defs>
        <clipPath id="seat-clip" clipPathUnits="objectBoundingBox">
          <circle cx={0.5} cy={0.5} r={0.5} />
        </clipPath>
      </defs>
      <g className="hemicycle-background" dangerouslySetInnerHTML={{ __html: assembly.background.markup }} />
      {assembly.emptySeats.map(seat => (
        <circle key={seat.number} className="empty-seat" cx={seat.x} cy={seat.y} r={SEAT_RADIUS} />
      ))}
      {assembly.deputies.map(deputy => (
        <DeputyDot
          key={deputy.id}
          deputy={deputy}
          color={colorOf(deputy.id)}
          highlighted={highlighted.has(deputy.id)}
          showPhoto={showPhotos}
          handlers={handlers}
        />
      ))}
    </PanZoomSvg>
  )
}

type DotProps = { deputy: Deputy; color: string; highlighted: boolean; showPhoto: boolean; handlers: DeputyHandlers }

const DeputyDot = memo(function DeputyDot({ deputy, color, highlighted, showPhoto, handlers }: DotProps) {
  const { x, y } = deputy.seat
  return (
    <g
      className={highlighted ? "seat highlighted" : "seat"}
      transform={`translate(${x} ${y})`}
      onPointerEnter={() => handlers.show(deputy.id)}
      onClick={() => handlers.pin(deputy.id)}
    >
      <circle className="seat-dot" r={SEAT_RADIUS} style={{ fill: color }} />
      {showPhoto && (
        <image
          href={deputy.photo}
          x={-SEAT_RADIUS}
          y={-SEAT_RADIUS}
          width={SEAT_RADIUS * 2}
          height={SEAT_RADIUS * 2}
          clipPath="url(#seat-clip)"
          opacity={0.85}
        />
      )}
    </g>
  )
})
