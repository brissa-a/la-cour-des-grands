import { createHash } from "node:crypto"
import { parseShared, sharedQuery, type Known, type Shared } from "../../web/src/share/query.ts"
import type { TextData } from "../../web/src/share/texts.ts"
import { dataVersion, type DataVersion } from "./version.ts"

export type CanonicalQuery = string & { readonly __brand: "CanonicalQuery" }

export type ViewHash = string & { readonly __brand: "ViewHash" }

export type CanonicalView = { readonly shared: Shared; readonly query: CanonicalQuery }

export type ImageKey = { readonly version: DataVersion; readonly hash: ViewHash }

export type ImageAddress = { readonly version: DataVersion; readonly hash: string }

export const FALLBACK_PATH = "/og/fallback.jpg"

const IMAGE_PATH = /^\/og\/([^/]+)\/([0-9a-f]{64})\.jpg$/

export function canonicalView(params: URLSearchParams, known: Known): CanonicalView {
  const shared = parseShared(name => params.get(name), known)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: sharedQuery writes a parsed view back in its one canonical form
  return { shared, query: sharedQuery(shared) as CanonicalQuery }
}

export function viewHash(query: CanonicalQuery): ViewHash {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: a sha256 hex digest, 64 lowercase hex digits, safe as a file name
  return createHash("sha256").update(query).digest("hex") as ViewHash
}

export function imageKey(version: DataVersion, query: CanonicalQuery): ImageKey {
  return { version, hash: viewHash(query) }
}

export function imagePath(version: DataVersion, query: CanonicalQuery): string {
  const path = `/og/${version}/${viewHash(query)}.jpg`
  return query === "" ? path : `${path}?${query}`
}

export function parseImagePath(pathname: string): ImageAddress | null {
  const [, version = "", hash = ""] = IMAGE_PATH.exec(pathname) ?? []
  const parsed = dataVersion(version)
  return parsed && { version: parsed, hash }
}

export function drawable({ view }: Shared, { votes }: TextData): boolean {
  return view.scrutin === null || votes.byId.has(view.scrutin)
}
