import { useEffect, useState } from "react"
import { searchAddresses, type GeocodedAddress } from "./geocoder.ts"
import type { LookupSources } from "./lookup.ts"

const DEBOUNCE_MS = 250

export type Suggestions =
  | { status: "idle" | "failed" }
  | { status: "loading" | "ready"; addresses: readonly GeocodedAddress[] }

export function useAddressSuggestions(query: string | null, sources: LookupSources | null): Suggestions {
  const [suggestions, setSuggestions] = useState<Suggestions>({ status: "idle" })

  useEffect(() => {
    if (query === null || sources === null) {
      setSuggestions({ status: "idle" })
      return
    }
    sources.communes().catch(() => {})
    setSuggestions(current => ({ status: "loading", addresses: "addresses" in current ? current.addresses : [] }))
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      searchAddresses(query, controller.signal).then(
        addresses => {
          if (!controller.signal.aborted) setSuggestions({ status: "ready", addresses })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          console.error(error)
          setSuggestions({ status: "failed" })
        },
      )
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query, sources])

  return suggestions
}
