import assert from "node:assert/strict"
import { test } from "node:test"
import { deltaPixels, glideAt, glideEnds, glideSpeed, readWheel, retarget, type Glide, type WheelKind, type WheelSample } from "./wheelZoom.ts"

const OPTIONS = { scrollRate: 0.002, pinchRate: 0.01, wheelStepPercent: 10, wheelAnimationMs: 200 }
const PIXEL = 0
const LINE = 1
const PAGE = 2
const MAC_TICK = 4.000244140625
const NOTCH = Math.log(1.1)

const pixels = (deltaY: number, ctrlKey = false): WheelSample => ({ deltaMode: PIXEL, deltaX: 0, deltaY, ctrlKey })

function burst(samples: readonly WheelSample[]) {
  let previous: WheelKind | null = null
  return samples.map(sample => {
    const read = readWheel(sample, previous, OPTIONS)
    previous = read?.kind ?? previous
    return read
  })
}

const total = (samples: readonly WheelSample[]) => burst(samples).reduce((sum, read) => sum + (read?.logFactor ?? 0), 0)

function assertClose(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} ≉ ${expected}`)
}

test("lines and pages are converted to pixels", () => {
  assert.equal(deltaPixels({ deltaMode: PIXEL, deltaY: 7.5 }), 7.5)
  assert.equal(deltaPixels({ deltaMode: LINE, deltaY: 3 }), 48)
  assert.equal(deltaPixels({ deltaMode: PAGE, deltaY: -1 }), -800)
})

test("a Chrome pinch scales by exactly the finger spread, however the browser slices it", () => {
  const spread = 1.3
  const deltaY = -100 * Math.log(spread)
  const slices = [0.1, 0.25, 0.4, 0.25].map(share => pixels(deltaY * share, true))
  assert.deepEqual(new Set(burst(slices).map(read => read?.kind)), new Set(["pinch"]))
  assertClose(Math.exp(total(slices)), spread)
})

test("two-finger scroll zooms in proportion to the distance, and slows down with the inertia", () => {
  const slow = Array.from({ length: 40 }, () => pixels(-1))
  assertClose(total(slow), total([pixels(-40)]))
  assertClose(total(slow), 40 * OPTIONS.scrollRate)
  const inertia = [pixels(-2), ...[120, 90, 60, 30, 10, 3, 1].map(delta => pixels(-delta))]
  const steps = burst(inertia).map(read => read?.logFactor ?? 0)
  assert.deepEqual(new Set(burst(inertia).map(read => read?.kind)), new Set(["scroll"]))
  for (let i = 2; i < steps.length; i++) assert.ok((steps[i] ?? 0) < (steps[i - 1] ?? 0))
})

test("a horizontal swipe does not zoom, even with some vertical noise", () => {
  assert.equal(readWheel({ deltaMode: PIXEL, deltaX: 30, deltaY: 0, ctrlKey: false }, null, OPTIONS), null)
  assert.equal(readWheel({ deltaMode: PIXEL, deltaX: 30, deltaY: 2, ctrlKey: false }, "scroll", OPTIONS), null)
})

test("mouse wheels are told from trackpads by their deltas, and large ambiguous ones follow the burst", () => {
  const kind = (sample: WheelSample, previous: WheelKind | null = null) => readWheel(sample, previous, OPTIONS)?.kind
  assert.equal(kind(pixels(MAC_TICK)), "notch")
  assert.equal(kind(pixels(-3 * MAC_TICK), "scroll"), "notch")
  assert.equal(kind({ deltaMode: LINE, deltaX: 0, deltaY: 3, ctrlKey: false }, "scroll"), "notch")
  assert.equal(kind(pixels(100, true)), "notch")
  assert.equal(kind(pixels(100), "scroll"), "scroll")
  assert.equal(kind(pixels(-4), "notch"), "scroll")
  assert.equal(kind(pixels(2.5, true)), "pinch")
})

test("a trackpad flick whose first deltas look like notches turns proportional at its first small delta", () => {
  const flick = [62, 85, 110, 96, 80, 64, 51, 42, 35, 29, 24, 20, 16, 13, 11, 9, 7, 6, 5, 4, 3, 2, 1].map(delta => pixels(-delta))
  const kinds = burst(flick).map(read => read?.kind)
  assert.deepEqual(new Set(kinds.slice(0, 7)), new Set(["notch"]))
  assert.deepEqual(new Set(kinds.slice(7)), new Set(["scroll"]))
  const proportional = flick.reduce((sum, sample) => sum - sample.deltaY * OPTIONS.scrollRate, 0)
  assert.ok(total(flick) <= proportional)
})

test("a notch zooms by one step, a large accelerated one by several", () => {
  assertClose(readWheel(pixels(-MAC_TICK), null, OPTIONS)?.logFactor ?? 0, NOTCH)
  assertClose(readWheel(pixels(100), null, OPTIONS)?.logFactor ?? 0, -NOTCH)
  assertClose(readWheel(pixels(-300), "notch", OPTIONS)?.logFactor ?? 0, 3 * NOTCH)
  assertClose(readWheel({ deltaMode: LINE, deltaX: 0, deltaY: -3, ctrlKey: false }, null, OPTIONS)?.logFactor ?? 0, NOTCH)
})

function positions(glide: Glide, from: number, to: number, stepMs = 4) {
  const values: number[] = []
  for (let t = from; t <= to; t += stepMs) values.push(glideAt(glide, t))
  return values
}

function assertMonotonic(values: readonly number[], to: number) {
  for (let i = 1; i < values.length; i++) {
    const previous = values[i - 1] ?? 0
    const value = values[i] ?? 0
    assert.ok(value >= previous - 1e-12, `moved back at sample ${i}`)
    assert.ok(value <= to + 1e-12, `overshot at sample ${i}`)
  }
}

test("a notch glides to its target with an ease-out in the configured time", () => {
  const glide = retarget(null, 0, 1, 1000, 200)
  assert.equal(glideAt(glide, 1000), 0)
  assert.equal(glideAt(glide, 990), 0)
  assert.ok(glideAt(glide, 1100) > 0.8)
  assert.ok(glideSpeed(glide, 1000) > glideSpeed(glide, 1100))
  assert.equal(glideEnds(glide), 1200)
  assert.equal(glideAt(glide, 1200), 1)
  assert.equal(glideSpeed(glide, 1200), 0)
  assertMonotonic(positions(glide, 1000, 1300), 1)
})

test("a new notch moves the target without slowing the zoom", () => {
  const first = retarget(null, 0, 1, 0, 200)
  const t = 60
  const position = glideAt(first, t)
  const second = retarget(first, position, first.to + 1, t, 200)
  assert.equal(glideAt(second, t), position)
  assert.ok(glideSpeed(second, t) >= glideSpeed(first, t))
  assert.equal(glideEnds(second), t + 200)
  assertMonotonic([...positions(first, 0, t), ...positions(second, t, t + 300)], 2)
  assert.equal(glideAt(second, t + 200), 2)
})

test("a short retarget at full speed shortens the glide instead of braking", () => {
  const long = retarget(null, 0, 10, 0, 200)
  const t = 70
  const position = glideAt(long, t)
  const speed = glideSpeed(long, t)
  const nudge = retarget(long, position, long.to + 0.01, t, 200)
  assertClose(glideSpeed(nudge, t), speed)
  assert.ok(glideEnds(nudge) < t + 200)
  assertMonotonic(positions(nudge, t, t + 300), nudge.to)
  assert.equal(glideAt(nudge, glideEnds(nudge)), nudge.to)
})

test("a notch the other way turns back, and no animation jumps to the target", () => {
  const forward = retarget(null, 0, 1, 0, 200)
  const back = retarget(forward, glideAt(forward, 50), 0, 50, 200)
  assert.equal(glideEnds(back), 250)
  assert.ok(glideSpeed(back, 50) < 0)
  assert.equal(glideAt(back, 250), 0)
  const instant = retarget(null, 0, 1, 0, 0)
  assert.equal(glideAt(instant, 0), 1)
  assert.equal(glideSpeed(instant, 0), 0)
})
