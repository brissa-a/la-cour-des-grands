import assert from "node:assert/strict"
import { test } from "node:test"
import { constituencyCode } from "../address/codes.ts"
import { deputyId } from "../data/deputyId.ts"
import { isoDate } from "../data/isoDate.ts"
import { parseHolders, rosterOn } from "./roster.ts"

const LETARD = deputyId("PA227089")
const CASTIGLIONE = deputyId("PA794554")
const LOUWAGIE = deputyId("PA608016")
const LIGER = deputyId("PA794750")
const TERMET = deputyId("PA840737")
const VUIBERT = deputyId("PA793194")

const holders = parseHolders([
  { id: LETARD, constituency: "59-21", mandate_periods: "2024-07-07/|2024-07-07/2024-10-21" },
  { id: CASTIGLIONE, constituency: "59-21", mandate_periods: "2024-07-07/2025-11-05" },
  { id: LOUWAGIE, constituency: "61-2", mandate_periods: "2024-07-07/2025-01-23|2024-07-07/2026-04-21" },
  { id: LIGER, constituency: "61-2", mandate_periods: "2024-07-07/|2024-07-07/2025-11-05" },
  { id: TERMET, constituency: "08-1", mandate_periods: "2024-07-07/2024-10-04" },
  { id: VUIBERT, constituency: "08-1", mandate_periods: "2024-12-08/" },
])

function holderOn(constituency: string, date: string) {
  const code = constituencyCode(constituency)
  const day = isoDate(date)
  assert.ok(code && day)
  return rosterOn(holders, day).get(code)
}

test("a minister's substitute holds the seat from the day after the minister's last day until the minister comes back", () => {
  assert.equal(holderOn("59-21", "2024-10-21"), LETARD)
  assert.equal(holderOn("59-21", "2024-10-22"), CASTIGLIONE)
  assert.equal(holderOn("59-21", "2025-11-05"), CASTIGLIONE)
  assert.equal(holderOn("59-21", "2025-11-06"), LETARD)
})

test("two deputies who alternate four times on one seat each hold it in turn", () => {
  assert.equal(holderOn("61-2", "2024-08-01"), LOUWAGIE)
  assert.equal(holderOn("61-2", "2025-06-01"), LIGER)
  assert.equal(holderOn("61-2", "2025-12-01"), LOUWAGIE)
  assert.equal(holderOn("61-2", "2026-05-01"), LIGER)
})

test("a seat has no holder between a resignation and the by-election", () => {
  assert.equal(holderOn("08-1", "2024-10-04"), TERMET)
  assert.equal(holderOn("08-1", "2024-11-01"), undefined)
  assert.equal(holderOn("08-1", "2024-12-08"), VUIBERT)
})

test("a malformed mandate period or constituency is rejected rather than read as no mandate", () => {
  for (const mandate_periods of ["2024-07-07", "2024-13-01/", "2025-01-01/2024-01-01", "2024-07-07/|", "2024-07-07/2025-01-01/2026-01-01"])
    assert.throws(() => parseHolders([{ id: LETARD, constituency: "59-21", mandate_periods }]), /mandate period/, mandate_periods)
  assert.throws(() => parseHolders([{ id: LETARD, constituency: "59", mandate_periods: "2024-07-07/" }]), /constituency/)
})
