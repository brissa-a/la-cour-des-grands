import type { DataVersion } from "../../web/src/data/version.ts"
import type { ShareData } from "../../web/src/share/data.ts"
import { reasonOf } from "./reason.ts"
import type { PointerCheck } from "./snapshot.ts"

export type Release = { readonly version: DataVersion; readonly data: ShareData }

export type Ready = { readonly kind: "ready"; readonly current: Release; readonly previous: Release | null }

export type Releases = { readonly kind: "starting" } | Ready

export type ReleaseWatch = { readonly state: () => Releases; readonly pointer: () => string | null; readonly stop: () => void }

export type WatchDeps = {
  readonly check: () => Promise<PointerCheck>
  readonly load: (version: DataVersion) => Promise<ShareData>
  readonly onRelease: (ready: Ready) => Promise<void>
  readonly log: (event: string, fields: Readonly<Record<string, string>>) => void
  readonly everyMs: number
}

export function retained(ready: Ready): readonly Release[] {
  return ready.previous === null ? [ready.current] : [ready.current, ready.previous]
}

export function watchReleases({ check, load, onRelease, log, everyMs }: WatchDeps): ReleaseWatch {
  let state: Releases = { kind: "starting" }
  let pointer: string | null = null
  let timer: NodeJS.Timeout | undefined
  let stopped = false

  async function adopt(version: DataVersion, naming: string): Promise<void> {
    let data: ShareData
    try {
      data = await load(version)
    } catch (error) {
      log("release-failed", { version, reason: reasonOf(error) })
      return
    }
    state = { kind: "ready", current: { version, data }, previous: state.kind === "ready" ? state.current : null }
    pointer = naming
    log("release", { version })
    await onRelease(state).catch((error: unknown) => log("release-hook-failed", { version, reason: reasonOf(error) }))
  }

  async function poll(): Promise<void> {
    const result = await check()
    switch (result.kind) {
      case "found":
        if (state.kind === "ready" && state.current.version === result.version) pointer = result.pointer
        else await adopt(result.version, result.pointer)
        break
      case "failed":
        log("pointer-unreadable", { reason: result.reason })
        break
    }
  }

  async function loop(): Promise<void> {
    await poll()
    if (!stopped) timer = setTimeout(() => void loop(), everyMs)
  }

  void loop()

  return {
    state: () => state,
    pointer: () => pointer,
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}
