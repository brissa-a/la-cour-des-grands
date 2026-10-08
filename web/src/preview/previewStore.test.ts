import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import type { DeputyId } from "../data/assembly.ts"
import { createPreviewStore, type Geometry, type Hit, type PreviewStore } from "./previewStore.ts"

const OPTIONS = { openSpeedPxPerS: 100, speedWindowMs: 100, holdMs: 200 }

const A = "PA1" as DeputyId
const B = "PA2" as DeputyId
const geometry: Geometry = { anchor: { x: 0, y: 0, radius: 1 }, dots: () => [], dotRadius: 1, layout: "hemicycle" }
const seat = (id: DeputyId): Hit => ({ id, geometry })
const at = (x: number) => ({ x, y: 0 })

let clock = 0

beforeEach(() => {
  clock = 0
  mock.timers.enable({ apis: ["setTimeout"] })
})

afterEach(() => mock.timers.reset())

function advance(ms: number) {
  clock += ms
  mock.timers.tick(ms)
}

function store() {
  const preview = createPreviewStore(OPTIONS, () => clock)
  const shown = () => {
    const { card } = preview.get()
    return card?.visible ? card.id : null
  }
  return { preview, shown }
}

function settleOn(preview: PreviewStore, id: DeputyId) {
  for (let x = 0; x < 5; x++) {
    preview.hover(at(x), seat(id))
    advance(20)
  }
}

test("a fast sweep only moves the halo, the card opens once the pointer settles", () => {
  const { preview, shown } = store()
  for (let i = 0; i < 30; i++) {
    advance(10)
    preview.hover(at(i * 30), seat(i % 2 ? A : B))
    assert.equal(shown(), null)
  }
  assert.equal(preview.get().target, A)
  advance(99)
  assert.equal(shown(), null)
  advance(1)
  assert.equal(shown(), A)
})

test("moving slowly opens the card without stopping, then the card follows the target", () => {
  const { preview, shown } = store()
  settleOn(preview, A)
  assert.equal(shown(), A)
  preview.hover(at(5), seat(B))
  assert.equal(shown(), B)
})

test("an open card follows up to twice the opening speed, and hides above", () => {
  const { preview, shown } = store()
  settleOn(preview, A)
  preview.hover(at(15), seat(B))
  assert.equal(shown(), B)
  preview.hover(at(22), seat(A))
  assert.equal(shown(), null)
})

test("a quick move to another seat hides the card until the pointer calms down", () => {
  const { preview, shown } = store()
  settleOn(preview, A)
  advance(10)
  preview.hover(at(65), seat(B))
  assert.equal(shown(), null)
  advance(99)
  assert.equal(shown(), null)
  advance(1)
  assert.equal(shown(), B)
})

test("leaving a seat holds the card, coming back within the hold keeps it", () => {
  const { preview, shown } = store()
  settleOn(preview, A)
  preview.hover(at(5), null)
  assert.equal(preview.get().target, null)
  advance(150)
  assert.equal(shown(), A)
  preview.hover(at(6), seat(B))
  assert.equal(shown(), B)
  preview.leave()
  advance(200)
  assert.equal(shown(), null)
})

test("coming back onto another seat during the hold follows at once", () => {
  const { preview, shown } = store()
  settleOn(preview, A)
  preview.leave()
  advance(30)
  preview.hover(at(6), seat(B))
  assert.equal(shown(), B)
})

test("re-entering after the card is gone waits one full window before opening", () => {
  const { preview, shown } = store()
  advance(50)
  settleOn(preview, A)
  preview.leave()
  advance(1000)
  preview.hover(at(500), seat(B))
  assert.equal(shown(), null)
  advance(99)
  assert.equal(shown(), null)
  advance(1)
  assert.equal(shown(), B)
})

test("a dismissed card stays hidden while the pointer stays on its seat", () => {
  const { preview, shown } = store()
  settleOn(preview, A)
  preview.dismiss()
  preview.hover(at(5), seat(A))
  advance(500)
  assert.equal(shown(), null)
  preview.hover(at(6), seat(B))
  assert.equal(shown(), B)
})

test("a gesture ending does not shorten a longer pause", () => {
  const { preview, shown } = store()
  preview.pause(1400)
  preview.gesture(true)
  advance(100)
  preview.gesture(false)
  advance(300)
  preview.hover(at(0), seat(A))
  advance(200)
  assert.equal(shown(), null)
  advance(900)
  preview.hover(at(0), seat(A))
  assert.equal(shown(), A)
})

test("new options apply to the next card", () => {
  const { preview, shown } = store()
  preview.configure({ ...OPTIONS, speedWindowMs: 300 })
  preview.hover(at(0), seat(A))
  advance(200)
  assert.equal(shown(), null)
  advance(100)
  assert.equal(shown(), A)
})
