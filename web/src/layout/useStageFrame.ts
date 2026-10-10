import { useLayoutEffect, useState, type RefObject } from "react"
import type { Frame } from "../forms/form.ts"
import { freeArea } from "./freeArea.ts"

const CLEARANCE_PX = 12

export function useStageFrame(svgRef: RefObject<SVGSVGElement | null>): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null)

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const overlays = [...document.querySelectorAll("[data-overlay]")]
    const measure = () => {
      const next = measureFrame(svg, overlays)
      setFrame(previous => (sameFrame(previous, next) ? previous : next))
    }
    const observer = new ResizeObserver(measure)
    for (const element of [svg, ...overlays]) observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [svgRef])

  return frame
}

function measureFrame(svg: SVGSVGElement, overlays: readonly Element[]): Frame | null {
  const area = freeArea(svg.getBoundingClientRect(), overlays.map(o => o.getBoundingClientRect()), CLEARANCE_PX)
  const toScreen = svg.getScreenCTM()
  if (!area || !toScreen || toScreen.a <= 0) return null
  const toSvg = toScreen.inverse()
  const topLeft = new DOMPoint(area.left, area.top).matrixTransform(toSvg)
  const bottomRight = new DOMPoint(area.right, area.bottom).matrixTransform(toSvg)
  return { area: { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }, px: 1 / toScreen.a }
}

function sameFrame(a: Frame | null, b: Frame | null): boolean {
  if (!a || !b) return a === b
  return a.px === b.px && a.area.left === b.area.left && a.area.top === b.area.top && a.area.right === b.area.right && a.area.bottom === b.area.bottom
}
