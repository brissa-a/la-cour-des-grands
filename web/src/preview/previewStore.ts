import { useSyncExternalStore } from "react"
import type { Config } from "../config/config.ts"
import type { DeputyId } from "../data/assembly.ts"
import type { Anchor, Point } from "./placement.ts"

export type PreviewOptions = Config["preview"]

export type Geometry = {
  anchor: Anchor
  dots: () => readonly Point[]
  dotRadius: number
  layout: "hemicycle" | "chart"
}

export type Hit = { id: DeputyId; geometry: Geometry }

export type Card = { id: DeputyId; geometry: Geometry | null; visible: boolean }

export type PreviewState = { target: DeputyId | null; card: Card | null }

export function cardShown(card: Card | null, selected: DeputyId | null): card is Card & { geometry: Geometry } {
  return card !== null && card.visible && card.geometry !== null && card.id !== selected
}

export type PreviewStore = {
  hover: (at: Point, hit: Hit | null) => void
  leave: () => void
  show: (id: DeputyId, geometry: Geometry | null) => void
  halo: (target: DeputyId | null) => void
  gesture: (active: boolean) => void
  pause: (ms: number) => void
  dismiss: () => void
  configure: (options: PreviewOptions) => void
  subscribe: (listener: () => void) => () => void
  get: () => PreviewState
}

const GESTURE_TAIL_MS = 150
const FOLLOW_SPEED_FACTOR = 2

type Move = { t: number; length: number }

export function createPreviewStore(initial: PreviewOptions, now: () => number = () => performance.now()): PreviewStore {
  let options = initial
  let state: PreviewState = { target: null, card: null }
  let timer: ReturnType<typeof setTimeout> | undefined
  let dismissed: DeputyId | null = null
  let pausedUntil = 0
  let gestureActive = false
  let moves: Move[] = []
  let last: Point | null = null
  let trackedSince = 0
  const listeners = new Set<() => void>()

  const set = (next: PreviewState) => {
    state = next
    for (const listener of listeners) listener()
  }

  const hide = () => {
    clearTimeout(timer)
    set({ target: state.target, card: state.card && { ...state.card, visible: false } })
  }

  const showLater = ({ id, geometry }: Hit, delay: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => set({ target: id, card: { id, geometry, visible: true } }), delay)
  }

  const blocked = () => gestureActive || now() < pausedUntil

  const pauseFor = (ms: number) => {
    pausedUntil = Math.max(pausedUntil, now() + ms)
  }

  const hideAll = () => {
    clearTimeout(timer)
    dismissed = null
    set({ target: null, card: state.card && { ...state.card, visible: false } })
  }

  const track = (at: Point, t: number) => {
    if (last) moves.push({ t, length: Math.hypot(at.x - last.x, at.y - last.y) })
    else trackedSince = t
    last = at
    moves = moves.filter(m => m.t > t - options.speedWindowMs)
  }

  const calmDelay = (factor: number, t: number) => {
    const limit = (options.openSpeedPxPerS * factor * options.speedWindowMs) / 1000
    let travelled = moves.reduce((sum, m) => sum + m.length, 0)
    let calmAt = t
    for (const m of moves) {
      if (travelled <= limit) break
      travelled -= m.length
      calmAt = m.t + options.speedWindowMs
    }
    return calmAt - t
  }

  const openDelay = (t: number) => Math.max(calmDelay(1, t), trackedSince + options.speedWindowMs - t)

  const release = () => {
    if (state.target === null) return
    clearTimeout(timer)
    set({ target: null, card: state.card })
    if (state.card?.visible) timer = setTimeout(hide, options.holdMs)
  }

  const follow = (hit: Hit, t: number) => {
    const { id } = hit
    const visible = state.card?.visible === true
    if (visible && state.card?.id === id) {
      if (state.target === id) return
      clearTimeout(timer)
      set({ target: id, card: state.card })
      return
    }
    if ((visible ? calmDelay(FOLLOW_SPEED_FACTOR, t) : openDelay(t)) <= 0) {
      clearTimeout(timer)
      set({ target: id, card: { ...hit, visible: true } })
      return
    }
    if (visible || state.target !== id) set({ target: id, card: state.card && { ...state.card, visible: false } })
    showLater(hit, openDelay(t))
  }

  return {
    hover(at, hit) {
      const t = now()
      track(at, t)
      if (blocked()) return
      if (hit !== null && hit.id === dismissed) return
      dismissed = null
      if (hit === null) release()
      else follow(hit, t)
    },
    leave() {
      moves = []
      last = null
      if (blocked()) return
      dismissed = null
      release()
    },
    show(id, geometry) {
      clearTimeout(timer)
      dismissed = null
      set({ target: id, card: { id, geometry, visible: true } })
    },
    halo(target) {
      clearTimeout(timer)
      dismissed = null
      set({ target, card: state.card && { ...state.card, visible: false } })
    },
    gesture(active) {
      gestureActive = active
      if (active) hideAll()
      else pauseFor(GESTURE_TAIL_MS)
    },
    pause(ms) {
      pauseFor(ms)
      hideAll()
    },
    dismiss() {
      if (!state.card?.visible) return
      dismissed = state.card.id
      hide()
    },
    configure(next) {
      options = next
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => state,
  }
}

export function usePreview(store: PreviewStore): PreviewState {
  return useSyncExternalStore(store.subscribe, store.get)
}
