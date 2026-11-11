import { reasonOf } from "./reason.ts"
import type { Release } from "./releases.ts"

export type Fallback = {
  readonly image: () => Buffer | null
  readonly follow: (release: Release) => void
  readonly stop: () => void
}

export type FallbackDeps = {
  readonly draw: (release: Release) => Promise<Buffer | null>
  readonly save: (jpeg: Buffer) => Promise<void>
  readonly saved: Buffer | null
  readonly retryMs: number
  readonly log: (event: string, fields: Readonly<Record<string, string>>) => void
}

export function createFallback({ draw, save, saved, retryMs, log }: FallbackDeps): Fallback {
  let image = saved
  let wanted: Release | null = null
  let retry: NodeJS.Timeout | undefined

  function attempt(release: Release): void {
    const failed = (reason: string) => {
      log("fallback-failed", { version: release.version, reason })
      if (wanted === release) retry = setTimeout(() => attempt(release), retryMs)
    }
    draw(release).then(
      jpeg => {
        if (wanted !== release) return
        if (jpeg === null) {
          failed("no image")
          return
        }
        image = jpeg
        save(jpeg).catch((error: unknown) => log("fallback-unsaved", { version: release.version, reason: reasonOf(error) }))
      },
      (error: unknown) => failed(reasonOf(error)),
    )
  }

  return {
    image: () => image,
    follow: release => {
      clearTimeout(retry)
      wanted = release
      attempt(release)
    },
    stop: () => {
      clearTimeout(retry)
      wanted = null
    },
  }
}
