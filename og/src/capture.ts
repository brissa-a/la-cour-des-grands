import type { SnapshotPath } from "../../web/src/data/snapshotPath.ts"
import { DATA_PATH } from "../../web/src/data/source.ts"
import type { DataVersion } from "../../web/src/data/version.ts"
import { chromeParams } from "../../web/src/embed/chrome.ts"
import type { ImageQuery } from "./canonical.ts"
import { dataAddress } from "./snapshot.ts"

export type CaptureRoute =
  | { readonly kind: "site"; readonly path: string }
  | { readonly kind: "pointer" }
  | { readonly kind: "data"; readonly path: SnapshotPath }
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

export function capturePointer(version: DataVersion): string {
  return JSON.stringify({ version })
}

export function captureRoute(address: string, version: DataVersion): CaptureRoute {
  const url = URL.parse(address)
  if (url?.origin !== CAPTURE_ORIGIN) return BLOCKED
  if (!url.pathname.startsWith(DATA_PATH)) return { kind: "site", path: url.pathname }
  const data = dataAddress(url.pathname)
  if (data === null) return BLOCKED
  if (data.kind === "pointer") return { kind: "pointer" }
  return data.version === version ? { kind: "data", path: data.path } : BLOCKED
}
