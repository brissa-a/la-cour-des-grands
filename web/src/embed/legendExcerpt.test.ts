import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { ColoredPart } from "../sources/shapes.ts"
import { captureExcerpt } from "./legendExcerpt.ts"

function part(label: string, size: number): ColoredPart {
  const members: DeputyId[] = Array.from({ length: size }, (_, index) => deputyId(`PA${label.length}${index}`))
  return { key: label, label, title: label, caption: null, color: "#4e79a7", members }
}

test("a preview's legend keeps up to a dozen parts whole and in order, and past that names the eight largest, largest first, and counts the others", () => {
  const dozen = Array.from({ length: 12 }, (_, index) => part(`part ${index}`, index))
  assert.deepEqual(captureExcerpt(dozen), { shown: dozen, hidden: 0 })
  const regions = [part("Bretagne", 27), part("Corse", 4), part("Ile-de-France", 97), ...Array.from({ length: 10 }, (_, index) => part(`r${index}`, 30 + index))]
  const { shown, hidden } = captureExcerpt(regions)
  assert.deepEqual(
    shown.map(({ label }) => label),
    ["Ile-de-France", "r9", "r8", "r7", "r6", "r5", "r4", "r3"],
  )
  assert.equal(hidden, 5)
})

test("parts of the same size keep their legend order in the excerpt", () => {
  const even = Array.from({ length: 13 }, (_, index) => part(`even ${index}`, 5))
  assert.deepEqual(
    captureExcerpt(even).shown.map(({ label }) => label),
    even.slice(0, 8).map(({ label }) => label),
  )
})
