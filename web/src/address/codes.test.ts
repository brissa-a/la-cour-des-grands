import assert from "node:assert/strict"
import { test } from "node:test"
import { communeCode, constituencyCode } from "./codes.ts"

test("constituency codes follow the lcdg format", () => {
  for (const valid of ["01-4", "2A-1", "33-12", "977-1", "988-2", "099-11"]) assert.equal(constituencyCode(valid), valid)
  for (const invalid of ["100-1", "75-0", "33-04", "20-1", "96-1", "099-100", "2a-1", ""]) assert.equal(constituencyCode(invalid), null)
})

test("commune codes are INSEE codes, Corsica included", () => {
  for (const valid of ["01001", "2A004", "75115", "97801"]) assert.equal(communeCode(valid), valid)
  for (const invalid of ["1001", "2C004", "750150", ""]) assert.equal(communeCode(invalid), null)
})
