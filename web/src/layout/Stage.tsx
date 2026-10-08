import { memo, useEffect, useMemo, useRef } from "react"
import type { Assembly, Deputy, DeputyId } from "../data/assembly.ts"
import type { Point } from "../preview/placement.ts"
import { usePreview, type Hit, type PreviewStore } from "../preview/previewStore.ts"
import type { Chart } from "./chart.ts"
import { PanZoomSvg } from "./PanZoomSvg.tsx"

export const SEAT_RADIUS = 0.019

// Chrome skips repainting SVG elements whose CSS transform transitions use coordinates around ±1.
const DOT_SCALE = 100

const HEMICYCLE_PITCH = SEAT_RADIUS * 2.75
const SNAP_PITCHES = 0.6
const SNAP_MIN_PX = 10
const HYSTERESIS_PX = 3
const RING_PX = 2
const RING_STROKE = 0.4
const FOCUS_SCALE = 1.35
const LAYOUT_PAUSE_MS = 1400
const RESIZE_PAUSE_MS = 250


type Placed = { id: DeputyId; point: Point; delay: number }

type Props = {
  assembly: Assembly
  chart: Chart | null
  highlighted: ReadonlySet<DeputyId>
  showPhotos: boolean
  colorOf: (id: DeputyId) => string
  store: PreviewStore
  selected: DeputyId | null
  onTap: (hit: Hit | null, pointerType: string) => void
}

export function Stage({ assembly, chart, highlighted, showPhotos, colorOf, store, selected, onTap }: Props) {
  const radius = chart?.radius ?? SEAT_RADIUS
  const pitch = chart?.pitch ?? HEMICYCLE_PITCH
  const dotsRef = useRef<SVGGElement>(null)
  const hovered = useRef<DeputyId | null>(null)
  const pointerType = useRef("mouse")

  const placed = useMemo(
    () =>
      assembly.deputies.map(
        (deputy, index): Placed => ({
          id: deputy.id,
          point: chart?.positions.get(deputy.id) ?? deputy.seat,
          delay: (index % 40) * 0.012,
        }),
      ),
    [assembly, chart],
  )
  const placedById = useMemo(() => new Map(placed.map(p => [p.id, p])), [placed])

  const firstLayout = useRef(true)
  useEffect(() => {
    if (firstLayout.current) firstLayout.current = false
    else store.pause(LAYOUT_PAUSE_MS)
  }, [chart, store])

  useEffect(() => {
    const svg = dotsRef.current?.ownerSVGElement
    if (!svg) return
    let first = true
    const observer = new ResizeObserver(() => {
      if (first) first = false
      else store.pause(RESIZE_PAUSE_MS)
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [store])

  const hitAt = (clientX: number, clientY: number): Hit | null => {
    const dots = dotsRef.current
    const ctm = dots?.getScreenCTM()
    const box = dots?.ownerSVGElement?.getBoundingClientRect()
    if (!ctm || !box) return null
    const scale = Math.hypot(ctm.a, ctm.b)
    const dotRadius = radius * DOT_SCALE * scale
    const toScreen = ({ x, y }: Point): Point => {
      const lx = x * DOT_SCALE
      const ly = y * DOT_SCALE
      return { x: ctm.a * lx + ctm.c * ly + ctm.e, y: ctm.b * lx + ctm.d * ly + ctm.f }
    }
    const visible = (p: Placed) => {
      const s = toScreen(p.point)
      return s.x + dotRadius > box.left && s.x - dotRadius < box.right && s.y + dotRadius > box.top && s.y - dotRadius < box.bottom
    }
    const pointer = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    const distance = (p: Placed) => Math.hypot(p.point.x * DOT_SCALE - pointer.x, p.point.y * DOT_SCALE - pointer.y)
    const snap = Math.max(SNAP_PITCHES * pitch * DOT_SCALE, SNAP_MIN_PX / scale)
    let best: Placed | null = null
    let bestDistance = Infinity
    for (const p of placed) {
      const d = distance(p)
      if (d < bestDistance && d <= snap && visible(p)) {
        best = p
        bestDistance = d
      }
    }
    if (!best) return null
    const current = hovered.current === null ? undefined : placedById.get(hovered.current)
    if (current && current !== best) {
      const currentDistance = distance(current)
      if (currentDistance <= snap && currentDistance - bestDistance < HYSTERESIS_PX / scale && visible(current)) best = current
    }
    return {
      id: best.id,
      geometry: {
        anchor: { ...toScreen(best.point), radius: (radius * DOT_SCALE * FOCUS_SCALE + RING_STROKE / 2) * scale + RING_PX },
        dots: () => placed.map(p => toScreen(p.point)),
        dotRadius,
        layout: chart ? "chart" : "hemicycle",
      },
    }
  }

  const setHovered = (hit: Hit | null) => {
    hovered.current = hit?.id ?? null
    dotsRef.current?.ownerSVGElement?.classList.toggle("targeting", hit !== null)
  }

  return (
    <PanZoomSvg
      viewBox={assembly.background.viewBox}
      onDown={e => {
        pointerType.current = e.pointerType
      }}
      onHover={e => {
        if (e.pointerType === "touch") return
        const hit = hitAt(e.clientX, e.clientY)
        setHovered(hit)
        store.hover({ x: e.clientX, y: e.clientY }, hit)
      }}
      onLeave={() => {
        setHovered(null)
        store.leave()
      }}
      onTap={e => onTap(hitAt(e.clientX, e.clientY), pointerType.current)}
      onGesture={active => {
        if (active) setHovered(null)
        store.gesture(active)
      }}
    >
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
      <g ref={dotsRef} transform={`scale(${1 / DOT_SCALE})`}>
        {assembly.deputies.map((deputy, index) => {
          const p = placed[index]
          if (!p) return null
          return (
            <DeputyDot
              key={deputy.id}
              deputy={deputy}
              position={p.point}
              radius={radius}
              delay={p.delay}
              color={colorOf(deputy.id)}
              highlighted={highlighted.has(deputy.id)}
              showPhoto={showPhotos}
            />
          )
        })}
        <Rings
          store={store}
          selected={selected}
          placedById={placedById}
          colorOf={colorOf}
          radius={radius}
          showPhotos={showPhotos}
        />
      </g>
    </PanZoomSvg>
  )
}

function Rings({
  store,
  selected,
  placedById,
  colorOf,
  radius,
  showPhotos,
}: {
  store: PreviewStore
  selected: DeputyId | null
  placedById: ReadonlyMap<DeputyId, Placed>
  colorOf: (id: DeputyId) => string
  radius: number
  showPhotos: boolean
}) {
  const { target } = usePreview(store)
  const ring = (id: DeputyId, kind: "selected" | "hovered") => {
    const p = placedById.get(id)
    if (!p) return null
    const r = radius * DOT_SCALE * FOCUS_SCALE
    return (
      <g
        key={`${kind}-${id}`}
        className={`ring ${kind}`}
        style={{ transform: `translate(${p.point.x * DOT_SCALE}px, ${p.point.y * DOT_SCALE}px)`, transitionDelay: `${p.delay}s` }}
      >
        {kind === "selected" && <circle className="ring-outer" r={r + 0.75} />}
        {kind === "selected" && <circle className="ring-gap" r={r + 0.4} />}
        <circle className="ring-dot" r={r} strokeWidth={RING_STROKE} style={{ fill: showPhotos ? "none" : colorOf(id) }} />
      </g>
    )
  }
  return (
    <g className="rings">
      {selected && ring(selected, "selected")}
      {target && target !== selected && ring(target, "hovered")}
    </g>
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
}

const DeputyDot = memo(function DeputyDot({ deputy, position, radius: unscaledRadius, delay, color, highlighted, showPhoto }: DotProps) {
  const radius = unscaledRadius * DOT_SCALE
  return (
    <g
      className={highlighted ? "seat highlighted" : "seat"}
      style={{ transform: `translate(${position.x * DOT_SCALE}px, ${position.y * DOT_SCALE}px)`, transitionDelay: `${delay}s` }}
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
