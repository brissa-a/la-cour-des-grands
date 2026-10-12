import { knownDeputy, type DeputyId } from "../data/deputyId.ts"
import type { ColorableFeature } from "../data/features.ts"
import { DEFAULT_COLOR_FEATURE } from "../sources/views.ts"
import type { Param } from "../url.ts"
import { parseView, viewParams, type View } from "../view/view.ts"

export type Shared = { readonly view: View; readonly deputy: DeputyId | null; readonly photos: boolean }

export type Known = { readonly features: readonly ColorableFeature[]; readonly people: ReadonlyMap<DeputyId, unknown> }

export function parseShared(read: (name: string) => string | null, known: Known): Shared {
  const parsed = parseView(read, known.features, DEFAULT_COLOR_FEATURE)
  if (!parsed) throw new Error(`catalog.json: no feature ${DEFAULT_COLOR_FEATURE}`)
  return { view: parsed.view, deputy: knownDeputy(known.people, read("deputy")), photos: read("showPic") === "true" }
}

export function sharedParams({ view, deputy, photos }: Shared): readonly Param[] {
  return [...viewParams(view, DEFAULT_COLOR_FEATURE), ["deputy", deputy], ["showPic", photos ? "true" : null]]
}

export function sharedQuery(shared: Shared): string {
  const query = new URLSearchParams()
  for (const [name, value] of sharedParams(shared)) if (value !== null) query.append(name, value)
  return query.toString()
}

export function canonicalQuery(read: (name: string) => string | null, known: Known): string {
  return sharedQuery(parseShared(read, known))
}
