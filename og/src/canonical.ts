import { createHash } from "node:crypto"
import { parseShared, sharedQuery, type Known, type Shared } from "../../web/src/share/query.ts"
import type { TextData } from "../../web/src/share/texts.ts"
import { dataVersion, type DataVersion } from "../../web/src/data/version.ts"

export type CanonicalQuery = string & { readonly __brand: "CanonicalQuery" }

export type ImageQuery = string & { readonly __brand: "ImageQuery" }

export type ViewHash = string & { readonly __brand: "ViewHash" }

export type RenderId = string & { readonly __brand: "RenderId" }

export type CanonicalView = { readonly shared: Shared; readonly query: CanonicalQuery; readonly image: ImageQuery }

export type ImageKey = { readonly version: DataVersion; readonly hash: ViewHash }

export type ImageAddress = { readonly version: DataVersion; readonly render: string; readonly hash: string }

export const FALLBACK_PATH = "/og/fallback.jpg"

const IMAGE_PATH = /^\/og\/([^/]+)\/([0-9a-f]{12})\/([0-9a-f]{64})\.jpg$/

export function canonicalView(params: URLSearchParams, known: Known): CanonicalView {
  const shared = parseShared(name => params.get(name), known)
  return {
    shared,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: sharedQuery writes a parsed view back in its one canonical form
    query: sharedQuery(shared) as CanonicalQuery,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the same canonical form without the photos, which the image never shows
    image: sharedQuery({ ...shared, photos: false }) as ImageQuery,
  }
}

export function viewHash(query: ImageQuery): ViewHash {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: a sha256 hex digest, 64 lowercase hex digits, safe as a file name
  return createHash("sha256").update(query).digest("hex") as ViewHash
}

export function renderId(page: string, settings: Readonly<Record<string, unknown>>): RenderId {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: 12 lowercase hex digits of a sha256, safe in a path and a URL
  return createHash("sha256").update(page).update(JSON.stringify(settings)).digest("hex").slice(0, 12) as RenderId
}

export function imageKey(version: DataVersion, query: ImageQuery): ImageKey {
  return { version, hash: viewHash(query) }
}

export function imagePath(version: DataVersion, render: RenderId, query: ImageQuery): string {
  const path = `/og/${version}/${render}/${viewHash(query)}.jpg`
  return query === "" ? path : `${path}?${query}`
}

export function parseImagePath(pathname: string): ImageAddress | null {
  const [, version = "", render = "", hash = ""] = IMAGE_PATH.exec(pathname) ?? []
  const parsed = dataVersion(version)
  return parsed && { version: parsed, render, hash }
}

export function drawable({ view }: Shared, { votes }: TextData): boolean {
  return view.scrutin === null || votes.byId.has(view.scrutin)
}
