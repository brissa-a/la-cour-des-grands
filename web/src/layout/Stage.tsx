import { memo, useEffect, useMemo, useRef, type RefObject } from "react"
import type { Deputy, DeputyId } from "../data/assembly.ts"
import type { Scene } from "../forms/form.ts"
import type { Point } from "../preview/placement.ts"
import { usePreview, type Hit, type PreviewStore } from "../preview/previewStore.ts"
import { Marks } from "./Marks.tsx"
import { staggerDelay } from "./staging.ts"
import { PanZoomSvg } from "./PanZoomSvg.tsx"

// Chrome skips repainting SVG elements whose CSS transform transitions use coordinates around ±1.
const DOT_SCALE = 100

const SNAP_MIN_PX = 10
const HYSTERESIS_PX = 3
const RING_PX = 2
const RING_STROKE = 0.4
const FOCUS_SCALE = 1.35
const LAYOUT_PAUSE_MS = 1400
const RESIZE_PAUSE_MS = 250

type Placed = { id: DeputyId; point: Point; delay: number }

type Props = {
  svgRef: RefObject<SVGSVGElement | null>
  viewBox: string
  deputies: readonly Deputy[]
  scene: Scene
  arrangement: object
  highlighted: ReadonlySet<DeputyId>
  showPhotos: boolean
  colorOf: (id: DeputyId) => string
  store: PreviewStore
  selected: DeputyId | null
  onTap: (hit: Hit | null, pointerType: string) => void
}

export function Stage({ svgRef, viewBox, deputies, scene, arrangement, highlighted, showPhotos, colorOf, store, selected, onTap }: Props) {
  const { radius, snap } = scene
  const dotsRef = useRef<SVGGElement>(null)
  const hovered = useRef<DeputyId | null>(null)
  const pointerType = useRef("mouse")
  const arranged = useRef({ arrangement, at: -Infinity })
  if (arranged.current.arrangement !== arrangement) arranged.current = { arrangement, at: performance.now() }

  const placed = useMemo(() => {
    const since = performance.now() - arranged.current.at
    return deputies.flatMap((deputy, index): Placed[] => {
      const point = scene.dots.get(deputy.id)
      return point ? [{ id: deputy.id, point, delay: staggerDelay(index, since) }] : []
    })
  }, [deputies, scene])
  const placedById = useMemo(() => new Map(placed.map(p => [p.id, p])), [placed])

  const shown = useRef(placedById)
  useEffect(() => {
    const before = shown.current
    shown.current = placedById
    if (before === placedById) return
    for (const [id, { point }] of placedById) {
      const was = before.get(id)?.point
      if (was && (was.x !== point.x || was.y !== point.y)) {
        store.pause(LAYOUT_PAUSE_MS)
        return
      }
    }
  }, [placedById, store])

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
    const reach = Math.max(snap * DOT_SCALE, SNAP_MIN_PX / scale)
    let best: Placed | null = null
    let bestDistance = Infinity
    for (const p of placed) {
      const d = distance(p)
      if (d < bestDistance && d <= reach && visible(p)) {
        best = p
        bestDistance = d
      }
    }
    if (!best) return null
    const current = hovered.current === null ? undefined : placedById.get(hovered.current)
    if (current && current !== best) {
      const currentDistance = distance(current)
      if (currentDistance <= reach && currentDistance - bestDistance < HYSTERESIS_PX / scale && visible(current)) best = current
    }
    return {
      id: best.id,
      geometry: {
        anchor: { ...toScreen(best.point), radius: (radius * DOT_SCALE * FOCUS_SCALE + RING_STROKE / 2) * scale + RING_PX },
        dots: () => placed.map(p => toScreen(p.point)),
        dotRadius,
        card: scene.card,
      },
    }
  }

  const setHovered = (hit: Hit | null) => {
    hovered.current = hit?.id ?? null
    dotsRef.current?.ownerSVGElement?.classList.toggle("targeting", hit !== null)
  }

  return (
    <PanZoomSvg
      svgRef={svgRef}
      viewBox={viewBox}
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
      <Marks marks={scene.marks} scale={DOT_SCALE} />
      <g ref={dotsRef} transform={`scale(${1 / DOT_SCALE})`}>
        {deputies.map(deputy => {
          const p = placedById.get(deputy.id)
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
        <Rings store={store} selected={selected} placedById={placedById} colorOf={colorOf} radius={radius} showPhotos={showPhotos} />
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
