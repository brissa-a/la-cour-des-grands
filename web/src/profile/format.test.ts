import assert from "node:assert/strict"
import { test } from "node:test"
import { MISSING, type Coloring } from "../coloring/coloring.ts"
import { birth, captionFor } from "./format.ts"

test("the birth line agrees with the civility and writes the first of the month 1ᵉʳ", () => {
  assert.equal(birth({ civility: "Mme", birth_date: "1969-04-28" }), "Née le 28 avril 1969")
  assert.equal(birth({ civility: "M.", birth_date: "1970-02-01" }), "Né le 1ᵉʳ février 1970")
})

test("a value gets its feature title only when its shape does not tell the feature", () => {
  const base = { key: "f:c", title: "Titre", colorOf: () => "", valueOf: () => "" } as const
  const number = (unit: string): Coloring => ({
    ...base, kind: "number", gradient: ["", ""], min: 0, max: 0, ticks: [], mean: 0, missing: 0, unit,
  })
  const category: Coloring = { ...base, kind: "category", items: [] }
  assert.equal(captionFor(category, "a"), null)
  assert.equal(captionFor(number("ans"), "57"), null)
  assert.equal(captionFor(number(""), "57"), "Titre")
  assert.equal(captionFor(category, MISSING), "Titre")
})
