import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react"

type Point = { x: number; y: number }
type View = Point & { scale: number }

const MIN_SCALE = 0.5
const MAX_SCALE = 20
const WHEEL_FACTOR = 1.1
const DRAG_THRESHOLD_PX = 4
const WHEEL_END_MS = 150

export type PointerHandlers = {
  onHover: (e: PointerEvent) => void
  onLeave: () => void
  onDown: (e: PointerEvent) => void
  onTap: (e: MouseEvent) => void
  onGesture: (active: boolean) => void
}

type Props = PointerHandlers & { viewBox: string; children: ReactNode }

export function PanZoomSvg({ viewBox, children, onHover, onLeave, onDown, onTap, onGesture }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const view = useRef<View>({ x: 0, y: 0, scale: 1 })
  const pointers = useRef(new Map<number, { client: Point; start: Point }>())
  const dragged = useRef(false)
  const handlers = useRef({ onGesture })
  handlers.current = { onGesture }

  const toSvg = (client: Point): Point => {
    const matrix = svgRef.current?.getScreenCTM()?.inverse()
    const point = new DOMPoint(client.x, client.y).matrixTransform(matrix)
    return { x: point.x, y: point.y }
  }

  const apply = () => {
    const { x, y, scale } = view.current
    groupRef.current?.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`)
  }

  const zoomAround = (center: Point, factor: number) => {
    const v = view.current
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
    const applied = scale / v.scale
    view.current = { x: center.x - (center.x - v.x) * applied, y: center.y - (center.y - v.y) * applied, scale }
    apply()
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let wheelEnd: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (wheelEnd === undefined) handlers.current.onGesture(true)
      clearTimeout(wheelEnd)
      wheelEnd = setTimeout(() => {
        wheelEnd = undefined
        handlers.current.onGesture(false)
      }, WHEEL_END_MS)
      zoomAround(toSvg({ x: e.clientX, y: e.clientY }), e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR)
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      clearTimeout(wheelEnd)
      svg.removeEventListener("wheel", onWheel)
    }
  }, [])

  const centroidAndSpread = (): { center: Point; spread: number } => {
    const points = [...pointers.current.values()].map(p => p.client)
    const center = {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    }
    const [a, b] = points
    const spread = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    return { center, spread }
  }

  const onPointerMove = (e: PointerEvent) => {
    const pointer = pointers.current.get(e.pointerId)
    if (!pointer) {
      onHover(e)
      return
    }
    const before = centroidAndSpread()
    pointer.client = { x: e.clientX, y: e.clientY }
    const after = centroidAndSpread()
    if (!dragged.current && Math.hypot(e.clientX - pointer.start.x, e.clientY - pointer.start.y) < DRAG_THRESHOLD_PX) return
    if (!dragged.current) onGesture(true)
    dragged.current = true
    const from = toSvg(before.center)
    const to = toSvg(after.center)
    view.current = { ...view.current, x: view.current.x + to.x - from.x, y: view.current.y + to.y - from.y }
    if (before.spread && after.spread) zoomAround(to, after.spread / before.spread)
    else apply()
  }

  const release = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId) || pointers.current.size) return
    svgRef.current?.classList.remove("dragging")
    if (dragged.current) onGesture(false)
  }

  return (
    <svg
      ref={svgRef}
      className="pan-zoom"
      viewBox={viewBox}
      onPointerDown={e => {
        if (!pointers.current.size) dragged.current = false
        const client = { x: e.clientX, y: e.clientY }
        pointers.current.set(e.pointerId, { client, start: client })
        svgRef.current?.classList.add("dragging")
        onDown(e)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={e => {
        release(e)
        onLeave()
      }}
      onClick={e => {
        if (!dragged.current) onTap(e)
      }}
    >
      <g ref={groupRef}>{children}</g>
    </svg>
  )
}
