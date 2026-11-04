import assert from "node:assert/strict"
import { test } from "node:test"
import { drawingOf, type DrawingFacts } from "./drawing.ts"
import { settleMs } from "./staging.ts"

type Color = { readonly color: string }
type Layout = { readonly layout: string }

const GROUPS: Color = { color: "group" }
const FALLBACK: Color = { color: "fallback" }
const COLUMNS: Layout = { layout: "columns" }
const ROOM: Layout = { layout: "room" }

const FINISHED: DrawingFacts<Color, Layout> = {
  vote: "none",
  valuesFailed: false,
  color: { wanted: GROUPS, shown: GROUPS },
  arrangement: { wanted: COLUMNS, shown: COLUMNS },
  framing: "fitted",
  motion: "full",
  sinceChangeMs: settleMs("full"),
  painted: true,
}

const drawings = (changes: readonly Partial<DrawingFacts<Color, Layout>>[]) => changes.map(change => drawingOf({ ...FINISHED, ...change }))

test("a measured drawing in the wanted colour and arrangement, settled and painted in its fonts and photos, is ready, with or without a vote", () => {
  assert.deepEqual(drawings([{}, { vote: "ready" }]), ["ready", "ready"])
})

test("a vote that does not exist or failed to load, or values that failed to load, make an error, even while the rest still loads", () => {
  assert.deepEqual(
    drawings([{ vote: "missing" }, { vote: "failed" }, { valuesFailed: true }, { valuesFailed: true, vote: "loading" }, { vote: "missing", framing: "unmeasured", sinceChangeMs: 0 }]),
    ["error", "error", "error", "error", "error"],
  )
})

test("a drawing still waiting for its vote, its wanted colour, its wanted arrangement or its frame is loading", () => {
  assert.deepEqual(
    drawings([
      { vote: "loading" },
      { color: { wanted: GROUPS, shown: FALLBACK } },
      { color: { wanted: null, shown: FALLBACK } },
      { color: { wanted: null, shown: null } },
      { arrangement: { wanted: COLUMNS, shown: ROOM } },
      { arrangement: { wanted: COLUMNS, shown: null } },
      { arrangement: { wanted: null, shown: null } },
      { framing: "unmeasured" },
    ]),
    ["loading", "loading", "loading", "loading", "loading", "loading", "loading", "loading"],
  )
})

test("a drawing is ready once its last dot has landed, at once under reduced motion, and only once painted in its fonts and photos", () => {
  assert.deepEqual(
    drawings([
      { sinceChangeMs: settleMs("full") - 1 },
      { motion: "reduced", sinceChangeMs: 0 },
      { painted: false },
      { motion: "reduced", sinceChangeMs: 0, painted: false },
    ]),
    ["loading", "ready", "loading", "loading"],
  )
})

test("a stage too small to hold the drawing makes an error once its data is in, instead of loading for ever", () => {
  assert.deepEqual(
    drawings([{ framing: "cramped" }, { framing: "cramped", vote: "ready", arrangement: { wanted: COLUMNS, shown: null } }, { framing: "cramped", vote: "loading" }]),
    ["error", "error", "loading"],
  )
})

export const mismatched = [
  // @ts-expect-error a colour shown of another type than the wanted one, which could never compare as reached
  drawingOf({ ...FINISHED, color: { wanted: GROUPS, shown: COLUMNS } }),
  // @ts-expect-error an arrangement shown of another type than the wanted one, which could never compare as reached
  drawingOf({ ...FINISHED, arrangement: { wanted: COLUMNS, shown: FALLBACK } }),
]
