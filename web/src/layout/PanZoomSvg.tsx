import { useEffect, useRef, type PointerEvent, type ReactNode } from "react"

type Point = { x: number; y: number }
type View = Point & { scale: number }

const MIN_SCALE = 0.5
const MAX_SCALE = 20
const WHEEL_FACTOR = 1.1
const DRAG_THRESHOLD_PX = 4

export function PanZoomSvg({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const view = useRef<View>({ x: 0, y: 0, scale: 1 })
  const pointers = useRef(new Map<number, { client: Point; start: Point }>())
  const dragged = useRef(false)

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
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAround(toSvg({ x: e.clientX, y: e.clientY }), e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR)
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
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
    if (!pointer) return
    const before = centroidAndSpread()
    pointer.client = { x: e.clientX, y: e.clientY }
    const after = centroidAndSpread()
    if (!dragged.current && Math.hypot(e.clientX - pointer.start.x, e.clientY - pointer.start.y) < DRAG_THRESHOLD_PX) return
    dragged.current = true
    const from = toSvg(before.center)
    const to = toSvg(after.center)
    view.current = { ...view.current, x: view.current.x + to.x - from.x, y: view.current.y + to.y - from.y }
    if (before.spread && after.spread) zoomAround(to, after.spread / before.spread)
    else apply()
  }

  const release = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (!pointers.current.size) svgRef.current?.classList.remove("dragging")
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
      }}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClickCapture={e => {
        if (dragged.current) e.stopPropagation()
      }}
    >
      <g ref={groupRef}>{children}</g>
    </svg>
  )
}
