import { useState } from "react"
import type { Person } from "../data/assembly.ts"
import { initials } from "./format.ts"

const decoded = new Set<string>()

export function Portrait({ deputy, className }: { deputy: Person; className: string }) {
  const { photo } = deputy
  const [loaded, setLoaded] = useState<string | null>(null)
  const ready = photo !== null && (loaded === photo || decoded.has(photo))
  return (
    <span className={className} style={{ borderColor: deputy.politicalGroup.color }}>
      {photo !== null && (
        <img
          src={photo}
          alt=""
          onLoad={() => {
            decoded.add(photo)
            setLoaded(photo)
          }}
          style={{ opacity: ready ? 1 : 0 }}
        />
      )}
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
