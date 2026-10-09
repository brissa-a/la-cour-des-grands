import assert from "node:assert/strict"
import { test } from "node:test"
import { distanceText } from "./format.ts"

test("distances to another constituency are rounded to what the contours can tell", () => {
  const to = "la 3ᵉ circonscription"
  assert.equal(distanceText(0, to), "Sur la limite avec la 3ᵉ circonscription")
  assert.equal(distanceText(4.9, to), "Sur la limite avec la 3ᵉ circonscription")
  assert.equal(distanceText(5, to), "≈ 10 m de la 3ᵉ circonscription")
  assert.equal(distanceText(43, to), "≈ 40 m de la 3ᵉ circonscription")
  assert.equal(distanceText(96, to), "≈ 100 m de la 3ᵉ circonscription")
  assert.equal(distanceText(276, to), "≈ 300 m de la 3ᵉ circonscription")
  assert.equal(distanceText(1530, to), "≈ 1,5 km de la 3ᵉ circonscription")
})
