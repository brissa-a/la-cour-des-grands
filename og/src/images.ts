import { canonicalView, drawable, imageKey, imagePath, viewHash, type CanonicalView, type ImageAddress, type ImageKey, type RenderId } from "./canonical.ts"
import { SERVICE_CLIENT, type ClientId } from "./client.ts"
import type { DiskCache } from "./disk.ts"
import { within, type Admission, type Outcome, type RenderQueue } from "./queue.ts"
import { reasonOf } from "./reason.ts"
import { retained, type Release, type Releases } from "./releases.ts"
import type { Render } from "./renderer.ts"

export type ImageAnswer =
  | { readonly kind: "image"; readonly jpeg: Buffer }
  | { readonly kind: "fallback" }
  | { readonly kind: "moved"; readonly location: string }
  | { readonly kind: "notFound" }

export type RenderLine = {
  readonly ms: number
  readonly outcome: "image" | "unsaved" | "failed" | "timeout"
  readonly version: string
  readonly query: string
  readonly reason?: string
}

export type RenderHealth = { readonly failuresInARow: number; readonly secondsSinceImage: number | null }

export type Images = {
  readonly answer: (address: ImageAddress, params: URLSearchParams, client: ClientId) => Promise<ImageAnswer>
  readonly prerender: (release: Release, view: CanonicalView, client: ClientId) => void
  readonly image: (release: Release, view: CanonicalView) => Promise<Buffer | null>
  readonly health: () => RenderHealth
}

export type ImagesDeps = {
  readonly releases: () => Releases
  readonly cache: DiskCache
  readonly queue: RenderQueue<Buffer>
  readonly render: Render
  readonly renderId: RenderId
  readonly waitMs: number
  readonly log: (line: RenderLine) => void
  readonly now: () => number
}

const NOT_FOUND: ImageAnswer = { kind: "notFound" }

const FALLBACK: ImageAnswer = { kind: "fallback" }

export function createImages({ releases, cache, queue, render, renderId, waitMs, log, now }: ImagesDeps): Images {
  let failuresInARow = 0
  let lastImage: number | null = null

  function renderOnce(release: Release, view: CanonicalView, key: ImageKey, client: ClientId, admission: Admission): Promise<Outcome<Buffer>> {
    return queue.run(`${key.version}/${key.hash}`, client, admission, async signal => {
      const started = now()
      const line = { version: release.version, query: view.image }
      let jpeg: Buffer
      try {
        jpeg = await render({ version: release.version, query: view.image }, signal)
      } catch (error) {
        failuresInARow += 1
        log({ ...line, ms: Math.round(now() - started), outcome: signal.aborted ? "timeout" : "failed", reason: reasonOf(error) })
        throw error
      }
      failuresInARow = 0
      lastImage = now()
      try {
        await cache.put(key, jpeg)
        log({ ...line, ms: Math.round(now() - started), outcome: "image" })
      } catch (error) {
        log({ ...line, ms: Math.round(now() - started), outcome: "unsaved", reason: reasonOf(error) })
      }
      return jpeg
    })
  }

  async function cachedOrRendered(release: Release, view: CanonicalView, deadline: number | null, client: ClientId): Promise<ImageAnswer> {
    const key = imageKey(release.version, view.image)
    const cached = await cache.get(key)
    if (cached !== null) return { kind: "image", jpeg: cached }
    if (!drawable(view.shared, release.data)) return FALLBACK
    const rendering = renderOnce(release, view, key, client, "wait")
    const outcome = deadline === null ? await rendering : await within(rendering, deadline)
    return outcome !== "late" && outcome.kind === "done" ? { kind: "image", jpeg: outcome.value } : FALLBACK
  }

  return {
    answer: async (address, params, client) => {
      const state = releases()
      if (state.kind === "starting") return FALLBACK
      const release = retained(state).find(kept => kept.version === address.version)
      const view = canonicalView(params, (release ?? state.current).data)
      if (viewHash(view.image) !== address.hash) return NOT_FOUND
      if (release === undefined || address.render !== renderId) return { kind: "moved", location: imagePath((release ?? state.current).version, renderId, view.image) }
      return cachedOrRendered(release, view, waitMs, client)
    },
    prerender: (release, view, client) => {
      const key = imageKey(release.version, view.image)
      void (async () => {
        if (drawable(view.shared, release.data) && !(await cache.has(key))) await renderOnce(release, view, key, client, "idleOnly")
      })()
    },
    image: async (release, view) => {
      const answer = await cachedOrRendered(release, view, null, SERVICE_CLIENT)
      return answer.kind === "image" ? answer.jpeg : null
    },
    health: () => ({ failuresInARow, secondsSinceImage: lastImage === null ? null : Math.round((now() - lastImage) / 1000) }),
  }
}
