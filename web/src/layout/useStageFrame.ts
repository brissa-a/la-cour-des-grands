import { useCallback, useLayoutEffect, useState, type RefObject } from "react"
import type { Frame, Framing, Screen } from "../forms/form.ts"
import { bleedBelow, freeArea, type Clearance } from "./freeArea.ts"

const UNMEASURED: Framing = { kind: "unmeasured" }
const CRAMPED: Framing = { kind: "cramped" }

// Measured after every render too, before paint, so an overlay that changes with the data (the vote header) refits the
// scene in the same frame as the data, instead of a frame later when the resize observer reports it.
export function useStageFrame(svgRef: RefObject<SVGSVGElement | null>, screen: Screen, clearance: Clearance): Framing {
  const [framing, setFraming] = useState(UNMEASURED)
  const [svg, setSvg] = useState<SVGSVGElement | null>(null)

  const measure = useCallback(() => {
    const current = svgRef.current
    setSvg(current)
    if (!current) return
    const frame = measureFrame(current, overlays(), covers(), screen, clearance)
    const next: Framing = frame ? { kind: "fitted", frame } : CRAMPED
    setFraming(previous => (sameFraming(previous, next) ? previous : next))
  }, [svgRef, screen, clearance])

  useLayoutEffect(measure)

  useLayoutEffect(() => {
    if (!svg) return
    const observer = new ResizeObserver(measure)
    for (const element of [svg, ...overlays(), ...covers()]) observer.observe(element)
    return () => observer.disconnect()
  }, [svg, measure])

  return framing
}

function overlays(): Element[] {
  return [...document.querySelectorAll("[data-overlay]")]
}

function covers(): Element[] {
  return [...document.querySelectorAll("[data-cover]")]
}

function measureFrame(svg: SVGSVGElement, overlays: readonly Element[], covers: readonly Element[], screen: Screen, clearance: Clearance): Frame | null {
  const area = freeArea(svg.getBoundingClientRect(), overlays.map(o => o.getBoundingClientRect()), clearance)
  const toScreen = svg.getScreenCTM()
  if (!area || !toScreen || toScreen.a <= 0) return null
  const toSvg = toScreen.inverse()
  const topLeft = new DOMPoint(area.left, area.top).matrixTransform(toSvg)
  const bottomRight = new DOMPoint(area.right, area.bottom).matrixTransform(toSvg)
  const px = 1 / toScreen.a
  const bleed = bleedBelow(area, covers.map(c => c.getBoundingClientRect())) * px
  return { area: { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }, bleed, px, screen }
}

function sameFraming(framing: Framing, next: Framing): boolean {
  if (framing.kind !== "fitted" || next.kind !== "fitted") return framing.kind === next.kind
  return sameFrame(framing.frame, next.frame)
}

function sameFrame(a: Frame, b: Frame): boolean {
  return a.screen === b.screen && a.px === b.px && a.bleed === b.bleed && a.area.left === b.area.left && a.area.top === b.area.top && a.area.right === b.area.right && a.area.bottom === b.area.bottom
}
