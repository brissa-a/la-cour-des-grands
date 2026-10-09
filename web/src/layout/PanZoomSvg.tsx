import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react"
import { useConfig } from "../config/useConfig.ts"
import { glideAt, glideEnds, readWheel, retarget, type Glide, type WheelKind } from "./wheelZoom.ts"

type Point = { x: number; y: number }
type View = Point & { scale: number }

const MIN_SCALE = 0.5
const MAX_SCALE = 20
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
  const glide = useRef<Glide | null>(null)
  const pointers = useRef(new Map<number, { client: Point; start: Point }>())
  const dragged = useRef(false)
  const zoom = useConfig("zoom")
  const latest = useRef({ onGesture, zoom })
  latest.current = { onGesture, zoom }

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
    const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
    const applied = scale / v.scale
    view.current = { x: center.x - (center.x - v.x) * applied, y: center.y - (center.y - v.y) * applied, scale }
    apply()
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let anchor: Point = { x: 0, y: 0 }
    let pending = 0
    let frame: number | undefined
    let burst: WheelKind | null = null
    let active = false
    let ending: ReturnType<typeof setTimeout> | undefined
    let safariScale: number | null = null
    let safariGestures = false

    const render = () => {
      frame = undefined
      // The frame timestamp can precede the wheel event that started the glide, which would hold its first frame still.
      const now = performance.now()
      const center = toSvg(anchor)
      if (pending) zoomAround(center, Math.exp(pending))
      pending = 0
      const current = glide.current
      if (!current) return
      zoomAround(center, Math.exp(glideAt(current, now)) / view.current.scale)
      if (now < glideEnds(current)) frame = requestAnimationFrame(render)
      else glide.current = null
    }

    const zoomAt = (client: Point) => {
      anchor = client
      frame ??= requestAnimationFrame(render)
    }

    const hold = () => {
      clearTimeout(ending)
      if (active) return
      active = true
      latest.current.onGesture(true)
    }

    const releaseAfter = (ms: number) => {
      clearTimeout(ending)
      ending = setTimeout(() => {
        if (safariScale !== null) return
        active = false
        burst = null
        latest.current.onGesture(false)
      }, ms)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Firefox reports mouse wheels in lines only when deltaMode is read before the deltas.
      const sample = { deltaMode: e.deltaMode, deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey }
      const options = latest.current.zoom
      const wheel = readWheel(sample, burst, options)
      if (!wheel || (wheel.kind === "pinch" && safariGestures)) return
      burst = wheel.kind
      hold()
      if (wheel.kind === "notch") {
        const now = performance.now()
        const previous = glide.current
        const from = previous ? glideAt(previous, now) : Math.log(view.current.scale)
        const to = clamp((previous?.to ?? from) + wheel.logFactor, Math.log(MIN_SCALE), Math.log(MAX_SCALE))
        glide.current = retarget(previous, from, to, now, options.wheelAnimationMs)
      } else {
        glide.current = null
        pending += wheel.logFactor
      }
      zoomAt({ x: e.clientX, y: e.clientY })
      releaseAfter(wheel.kind === "notch" ? Math.max(WHEEL_END_MS, options.wheelAnimationMs) : WHEEL_END_MS)
    }

    const onGestureStart = (e: GestureEvent) => {
      e.preventDefault()
      safariGestures = true
      if (pointers.current.size) return
      safariScale = e.scale
      glide.current = null
      hold()
    }

    const onGestureChange = (e: GestureEvent) => {
      e.preventDefault()
      if (safariScale === null || pointers.current.size || e.scale <= 0) return
      pending += Math.log(e.scale / safariScale)
      safariScale = e.scale
      zoomAt({ x: e.clientX, y: e.clientY })
    }

    const onGestureEnd = (e: GestureEvent) => {
      e.preventDefault()
      if (safariScale === null) return
      safariScale = null
      releaseAfter(WHEEL_END_MS)
    }

    svg.addEventListener("wheel", onWheel, { passive: false })
    svg.addEventListener("gesturestart", onGestureStart)
    svg.addEventListener("gesturechange", onGestureChange)
    svg.addEventListener("gestureend", onGestureEnd)
    return () => {
      clearTimeout(ending)
      if (frame !== undefined) cancelAnimationFrame(frame)
      svg.removeEventListener("wheel", onWheel)
      svg.removeEventListener("gesturestart", onGestureStart)
      svg.removeEventListener("gesturechange", onGestureChange)
      svg.removeEventListener("gestureend", onGestureEnd)
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
    glide.current = null
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
