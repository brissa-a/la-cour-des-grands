import assert from "node:assert/strict"
import { test } from "node:test"
import { birth } from "./format.ts"

test("the birth line agrees with the civility and writes the first of the month 1ᵉʳ", () => {
  assert.equal(birth({ civility: "Mme", birth_date: "1969-04-28" }), "Née le 28 avril 1969")
  assert.equal(birth({ civility: "M.", birth_date: "1970-02-01" }), "Né le 1ᵉʳ février 1970")
})
