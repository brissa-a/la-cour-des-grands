import { dataRootAt, PUBLISHED_ROOT } from "../../web/src/data/source.ts"
import { chromeParams } from "../../web/src/embed/chrome.ts"
import type { CanonicalQuery } from "./canonical.ts"
import type { DataVersion } from "./version.ts"

export type CaptureRoute =
  | { readonly kind: "site"; readonly path: string }
  | { readonly kind: "upstream"; readonly url: string }
  | { readonly kind: "blocked" }

export const CAPTURE_ORIGIN = "https://capture.invalid"

export const PHOTOS_ROOT = "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/test-v2/v2/"

const BLOCKED: CaptureRoute = { kind: "blocked" }

export function captureUrl(query: CanonicalQuery): string {
  const params = new URLSearchParams(query)
  for (const [name, value] of chromeParams({ kind: "capture" })) if (value !== null) params.append(name, value)
  return `${CAPTURE_ORIGIN}/?${params.toString()}`
}

export function captureRoute(address: string, version: DataVersion): CaptureRoute {
  const url = URL.parse(address)
  if (url === null) return BLOCKED
  if (url.origin === CAPTURE_ORIGIN) return { kind: "site", path: url.pathname }
  if (url.search !== "") return BLOCKED
  if (url.href.startsWith(PUBLISHED_ROOT)) return { kind: "upstream", url: dataRootAt(version) + url.href.slice(PUBLISHED_ROOT.length) }
  if (url.href.startsWith(PHOTOS_ROOT)) return { kind: "upstream", url: url.href }
  return BLOCKED
}
