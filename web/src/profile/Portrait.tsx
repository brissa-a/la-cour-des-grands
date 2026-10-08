import { useState } from "react"
import type { Deputy } from "../data/assembly.ts"
import { initials } from "./format.ts"

const decoded = new Set<string>()

export function Portrait({ deputy, className }: { deputy: Deputy; className: string }) {
  const [loaded, setLoaded] = useState<string | null>(null)
  const ready = loaded === deputy.photo || decoded.has(deputy.photo)
  return (
    <span className={className} style={{ borderColor: deputy.politicalGroup.color }}>
      <img
        src={deputy.photo}
        alt=""
        onLoad={() => {
          decoded.add(deputy.photo)
          setLoaded(deputy.photo)
        }}
        style={{ opacity: ready ? 1 : 0 }}
      />
      {!ready && (
        <span
          className="initials"
          style={{ background: `color-mix(in oklab, ${deputy.politicalGroup.color} 35%, #2a2a2a)` }}
        >
          {initials(deputy)}
        </span>
      )}
    </span>
  )
}
