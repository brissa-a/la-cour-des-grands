import type { ReactNode, RefObject } from "react"
import type { PointerHandlers } from "./PanZoomSvg.tsx"

type Props = Omit<PointerHandlers, "onGesture"> & { viewBox: string; svgRef: RefObject<SVGSVGElement | null>; children: ReactNode }

export function FixedSvg({ viewBox, svgRef, children, onHover, onLeave, onDown, onTap }: Props) {
  return (
    <svg ref={svgRef} className="fixed-svg" viewBox={viewBox} onPointerDown={onDown} onPointerMove={onHover} onPointerLeave={onLeave} onClick={onTap}>
      {children}
    </svg>
  )
}
