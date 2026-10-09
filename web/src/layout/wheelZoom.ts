import type { Config } from "../config/config.ts"

export type ZoomOptions = Config["zoom"]

export type WheelSample = {
  readonly deltaMode: number
  readonly deltaX: number
  readonly deltaY: number
  readonly ctrlKey: boolean
}

export type WheelKind = "notch" | "pinch" | "scroll"

export type WheelZoom = { kind: WheelKind; logFactor: number }

const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2
const LINE_PX = 16
const PAGE_PX = 800
// Chrome on macOS sends mouse wheel ticks as multiples of this: 0.1 line in 16.16 fixed point, times 40 px.
const MAC_WHEEL_TICK_PX = 4.000244140625
const NOTCH_MIN_PX = 50
const NOTCH_PX = 100

export function deltaPixels({ deltaMode, deltaY }: Pick<WheelSample, "deltaMode" | "deltaY">): number {
  return deltaY * (deltaMode === DOM_DELTA_LINE ? LINE_PX : deltaMode === DOM_DELTA_PAGE ? PAGE_PX : 1)
}

export function readWheel(sample: WheelSample, previous: WheelKind | null, options: ZoomOptions): WheelZoom | null {
  const pixels = deltaPixels(sample)
  if (pixels === 0 || Math.abs(sample.deltaX) > Math.abs(sample.deltaY)) return null
  if (isNotch(sample, pixels, previous)) {
    const notches = Math.max(1, Math.abs(pixels) / NOTCH_PX)
    return { kind: "notch", logFactor: -Math.sign(pixels) * notches * Math.log1p(options.wheelStepPercent / 100) }
  }
  if (sample.ctrlKey) return { kind: "pinch", logFactor: -pixels * options.pinchRate }
  return { kind: "scroll", logFactor: -pixels * options.scrollRate }
}

// A large pixel delta off the macOS tick is a notch on Windows and Linux but also trackpad inertia, so it follows the burst.
function isNotch(sample: WheelSample, pixels: number, previous: WheelKind | null): boolean {
  const size = Math.abs(pixels)
  if (sample.deltaMode !== DOM_DELTA_PIXEL || size % MAC_WHEEL_TICK_PX === 0) return true
  if (size < NOTCH_MIN_PX) return false
  return previous === null || previous === "notch"
}

export type Glide = { readonly from: number; readonly to: number; readonly start: number; readonly duration: number }

function remaining(glide: Glide, t: number): number {
  if (glide.duration <= 0) return 0
  return 1 - Math.min(1, Math.max(0, (t - glide.start) / glide.duration))
}

export function glideAt(glide: Glide, t: number): number {
  return glide.to - (glide.to - glide.from) * remaining(glide, t) ** 3
}

export function glideSpeed(glide: Glide, t: number): number {
  if (glide.duration <= 0) return 0
  return (3 * (glide.to - glide.from) * remaining(glide, t) ** 2) / glide.duration
}

export function glideEnds(glide: Glide): number {
  return glide.start + glide.duration
}

export function retarget(previous: Glide | null, from: number, to: number, t: number, duration: number): Glide {
  const speed = previous ? glideSpeed(previous, t) : 0
  const distance = to - from
  const keepingSpeed = speed * distance > 0 ? (3 * distance) / speed : Infinity
  return { from, to, start: t, duration: Math.min(duration, keepingSpeed) }
}
