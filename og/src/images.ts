import { canonicalView, drawable, imageKey, imagePath, viewHash, type CanonicalView, type ImageAddress, type ImageKey } from "./canonical.ts"
import type { DiskCache } from "./disk.ts"
import { reasonOf } from "./reason.ts"
import { within, type Outcome, type RenderQueue } from "./queue.ts"
import { retained, type Release, type Releases } from "./releases.ts"
import type { Render } from "./renderer.ts"

export type ImageAnswer =
  | { readonly kind: "image"; readonly jpeg: Buffer }
  | { readonly kind: "fallback" }
  | { readonly kind: "moved"; readonly location: string }
  | { readonly kind: "notFound" }

export type RenderLine = {
  readonly ms: number
  readonly outcome: "image" | "failed" | "timeout"
  readonly version: string
  readonly query: string
  readonly reason?: string
}

export type Images = {
  readonly answer: (address: ImageAddress, params: URLSearchParams) => Promise<ImageAnswer>
  readonly prerender: (release: Release, view: CanonicalView) => void
  readonly image: (release: Release, view: CanonicalView) => Promise<Buffer | null>
}

export type ImagesDeps = {
  readonly releases: () => Releases
  readonly cache: DiskCache
  readonly queue: RenderQueue<Buffer>
  readonly render: Render
  readonly waitMs: number
  readonly log: (line: RenderLine) => void
  readonly now: () => number
}

const NOT_FOUND: ImageAnswer = { kind: "notFound" }

const FALLBACK: ImageAnswer = { kind: "fallback" }

export function createImages({ releases, cache, queue, render, waitMs, log, now }: ImagesDeps): Images {
  function renderOnce(release: Release, view: CanonicalView, key: ImageKey): Promise<Outcome<Buffer>> {
    return queue.run(`${key.version}/${key.hash}`, async signal => {
      const started = now()
      const line = { version: release.version, query: view.query }
      try {
        const jpeg = await render({ version: release.version, query: view.query }, signal)
        await cache.put(key, jpeg)
        log({ ...line, ms: Math.round(now() - started), outcome: "image" })
        return jpeg
      } catch (error) {
        log({ ...line, ms: Math.round(now() - started), outcome: signal.aborted ? "timeout" : "failed", reason: reasonOf(error) })
        throw error
      }
    })
  }

  async function cachedOrRendered(release: Release, view: CanonicalView, deadline: number | null): Promise<ImageAnswer> {
    const key = imageKey(release.version, view.query)
    const cached = await cache.get(key)
    if (cached !== null) return { kind: "image", jpeg: cached }
    if (!drawable(view.shared, release.data)) return FALLBACK
    const rendering = renderOnce(release, view, key)
    const outcome = deadline === null ? await rendering : await within(rendering, deadline)
    return outcome !== "late" && outcome.kind === "done" ? { kind: "image", jpeg: outcome.value } : FALLBACK
  }

  return {
    answer: async (address, params) => {
      const state = releases()
      if (state.kind === "starting") return FALLBACK
      const release = retained(state).find(kept => kept.version === address.version)
      const view = canonicalView(params, (release ?? state.current).data)
      if (viewHash(view.query) !== address.hash) return NOT_FOUND
      if (release === undefined) return { kind: "moved", location: imagePath(state.current.version, view.query) }
      return cachedOrRendered(release, view, waitMs)
    },
    prerender: (release, view) => {
      const key = imageKey(release.version, view.query)
      void (async () => {
        if (drawable(view.shared, release.data) && !(await cache.has(key))) await renderOnce(release, view, key)
      })()
    },
    image: async (release, view) => {
      const answer = await cachedOrRendered(release, view, null)
      return answer.kind === "image" ? answer.jpeg : null
    },
  }
}
