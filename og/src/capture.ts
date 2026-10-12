import { dataRootAt, PUBLISHED_ROOT } from "../../web/src/data/source.ts"
import { chromeParams } from "../../web/src/embed/chrome.ts"
import type { ImageQuery } from "./canonical.ts"
import type { DataVersion } from "./version.ts"

export type CaptureRoute =
  | { readonly kind: "site"; readonly path: string }
  | { readonly kind: "upstream"; readonly url: string }
  | { readonly kind: "blocked" }

export const CAPTURE_ORIGIN = "https://capture.invalid"

// The capture view is laid out for 600x315 shot at scale 2: its labels then read at 10 to 12 px once a network shrinks the image.
export const CAPTURE_SETTINGS = { width: 600, height: 315, scale: 2, jpegQuality: 80 } as const

const BLOCKED: CaptureRoute = { kind: "blocked" }

export function captureUrl(query: ImageQuery): string {
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
  return BLOCKED
}
