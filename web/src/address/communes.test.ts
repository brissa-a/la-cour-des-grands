import assert from "node:assert/strict"
import { test } from "node:test"
import { communeCode } from "./codes.ts"
import { parseCommuneTable } from "./communes.ts"

test("a commune with one constituency is single, with several it is split", () => {
  const table = parseCommuneTable([
    { commune_code: "01001", constituencies: "01-4" },
    { commune_code: "75115", constituencies: "75-12|75-13" },
    { commune_code: "2A004", constituencies: "2A-1|2A-2" },
  ])
  assert.deepEqual(table.get(communeCode("01001")!), { kind: "single", constituency: "01-4" })
  assert.deepEqual(table.get(communeCode("75115")!), { kind: "split", constituencies: ["75-12", "75-13"] })
  assert.deepEqual(table.get(communeCode("2A004")!), { kind: "split", constituencies: ["2A-1", "2A-2"] })
})

test("invalid codes, an empty list or a repeated constituency reject the table", () => {
  assert.throws(() => parseCommuneTable([{ commune_code: "1001", constituencies: "01-4" }]), /invalid commune code/)
  assert.throws(() => parseCommuneTable([{ commune_code: "01001", constituencies: "" }]), /invalid constituency/)
  assert.throws(() => parseCommuneTable([{ commune_code: "01001", constituencies: "01-04" }]), /invalid constituency/)
  assert.throws(() => parseCommuneTable([{ commune_code: "75115", constituencies: "75-12|75-12" }]), /duplicate/)
})
