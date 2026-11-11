import type { DataVersion } from "../../web/src/data/version.ts"
import type { ShareData } from "../../web/src/share/data.ts"
import { reasonOf } from "./reason.ts"
import type { Pointed, PointerCheck } from "./snapshot.ts"

export type Release = { readonly version: DataVersion; readonly data: ShareData }

export type Ready = { readonly kind: "ready"; readonly current: Release; readonly previous: Release | null }

export type Releases = { readonly kind: "starting" } | Ready

export type ReleaseWatch = {
  readonly state: () => Releases
  readonly pointer: () => string | null
  readonly pointed: () => DataVersion | null
  readonly started: Promise<void>
  readonly stop: () => void
}

export type ReleaseSource = {
  readonly check: () => Promise<PointerCheck>
  readonly kept: () => Promise<readonly Pointed[]>
  readonly load: (version: DataVersion) => Promise<ShareData>
}

export type WatchDeps = ReleaseSource & {
  readonly onRelease: (ready: Ready) => Promise<void>
  readonly log: (event: string, fields: Readonly<Record<string, string>>) => void
  readonly everyMs: number
}

export function retained(ready: Ready): readonly Release[] {
  return ready.previous === null ? [ready.current] : [ready.current, ready.previous]
}

export function watchReleases({ check, kept, load, onRelease, log, everyMs }: WatchDeps): ReleaseWatch {
  let state: Releases = { kind: "starting" }
  let pointer: string | null = null
  let pointed: DataVersion | null = null
  let timer: NodeJS.Timeout | undefined
  let stopped = false

  const serving = () => (state.kind === "ready" ? state.current.version : null)

  async function adopt({ version, pointer: naming }: Pointed, event: "release" | "release-fallback"): Promise<boolean> {
    let data: ShareData
    try {
      data = await load(version)
    } catch (error) {
      log("release-failed", { version, reason: reasonOf(error) })
      return false
    }
    state = { kind: "ready", current: { version, data }, previous: state.kind === "ready" ? state.current : null }
    pointer = naming
    log(event, { version })
    if (data.drawing.kind === "unknown") log("drawing-unknown", { version, reason: data.drawing.reason })
    await onRelease(state).catch((error: unknown) => log("release-hook-failed", { version, reason: reasonOf(error) }))
    return true
  }

  async function fallBack(): Promise<void> {
    const versions = await kept().catch((error: unknown) => {
      log("kept-unreadable", { reason: reasonOf(error) })
      return []
    })
    if (versions.some(candidate => candidate.version === serving())) return
    for (const candidate of versions) if (candidate.version !== pointed && (await adopt(candidate, "release-fallback"))) return
  }

  async function poll(): Promise<void> {
    const result = await check()
    if (result.kind === "failed") {
      pointed = null
      log("pointer-unreadable", { reason: result.reason })
    } else {
      pointed = result.version
      if (result.version === serving()) {
        pointer = result.pointer
        return
      }
      if (await adopt(result, "release")) return
    }
    await fallBack()
  }

  async function loop(): Promise<void> {
    await poll()
    if (!stopped) timer = setTimeout(() => void loop(), everyMs)
  }

  return {
    state: () => state,
    pointer: () => pointer,
    pointed: () => pointed,
    started: loop(),
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}
