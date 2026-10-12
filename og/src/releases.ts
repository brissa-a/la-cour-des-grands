import type { ShareData } from "../../web/src/share/data.ts"
import { reasonOf } from "./reason.ts"
import type { DataVersion, VersionCheck } from "./version.ts"

export type Release = { readonly version: DataVersion; readonly data: ShareData }

export type Ready = { readonly kind: "ready"; readonly current: Release; readonly previous: Release | null }

export type Releases = { readonly kind: "starting" } | Ready

export type ReleaseWatch = { readonly state: () => Releases; readonly stop: () => void }

export type WatchDeps = {
  readonly check: (etag: string | null) => Promise<VersionCheck>
  readonly load: (version: DataVersion) => Promise<ShareData>
  readonly saved: DataVersion | null
  readonly onRelease: (ready: Ready) => Promise<void>
  readonly log: (event: string, fields: Readonly<Record<string, string>>) => void
  readonly everyMs: number
}

export function retained(ready: Ready): readonly Release[] {
  return ready.previous === null ? [ready.current] : [ready.current, ready.previous]
}

export function watchReleases({ check, load, saved, onRelease, log, everyMs }: WatchDeps): ReleaseWatch {
  let state: Releases = { kind: "starting" }
  let etag: string | null = null
  let timer: NodeJS.Timeout | undefined
  let stopped = false

  async function adopt(version: DataVersion): Promise<boolean> {
    let data: ShareData
    try {
      data = await load(version)
    } catch (error) {
      log("release-failed", { version, reason: reasonOf(error) })
      return false
    }
    state = { kind: "ready", current: { version, data }, previous: state.kind === "ready" ? state.current : null }
    log("release", { version })
    await onRelease(state).catch((error: unknown) => log("release-hook-failed", { version, reason: reasonOf(error) }))
    return true
  }

  async function poll(): Promise<void> {
    const result = await check(etag)
    switch (result.kind) {
      case "found":
        if ((state.kind === "ready" && state.current.version === result.version) || (await adopt(result.version))) etag = result.etag
        break
      case "unchanged":
        break
      case "failed":
        log("version-check-failed", { reason: result.reason })
        break
    }
  }

  async function loop(): Promise<void> {
    await poll()
    if (!stopped) timer = setTimeout(() => void loop(), everyMs)
  }

  void (async () => {
    if (saved !== null) await adopt(saved)
    await loop()
  })()

  return {
    state: () => state,
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}
