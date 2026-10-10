import assert from "node:assert/strict"
import { test } from "node:test"
import { numberKey, streetKeys, type RollKeys } from "./keys.ts"
import { findInRoll, parseRoll } from "./roll.ts"

const FILE = "communes/addresses/75115.csv"

const keys = (number: string | null, street: string): RollKeys => ({
  number: number === null ? null : numberKey(number),
  street: streetKeys(street),
})

const roll = parseRoll(
  [
    { address: "1 Rue Bausset", number: "1", constituencies: "75-12" },
    { address: "104 Rue Blomet", number: "104", constituencies: "75-12" },
    { address: "108 Rue Blomet", number: "108", constituencies: "75-13" },
    { address: "16 bis Rue Blomet", number: "16 bis", constituencies: "75-12" },
    { address: "2 Rue Bausset", number: "2", constituencies: "75-12|75-13" },
    { address: "3 Rue Bausset", number: "3", constituencies: "75-12" },
    { address: "3 rue Bausset", number: "3", constituencies: "75-13" },
    { address: "Rue de Viroflay", number: "", constituencies: "75-12" },
    { address: "Rue du Stand", number: "", constituencies: "75-12" },
    { address: "rue du stand", number: "", constituencies: "75-13" },
    { address: "Route de Dampierre", number: "", constituencies: "75-12|75-13" },
    { address: "Rue de la Bruyère (Lille)", number: "", constituencies: "75-13" },
    { address: "8 Mai 1945", number: "", constituencies: "75-13" },
  ],
  FILE,
)

// @ts-expect-error the roll is only searched with keys normalised like its own rows
void (() => findInRoll(roll, { number: "16 bis", street: streetKeys("Rue Blomet") }))

test("the street of a number row is its address without the number and a space", () => {
  assert.deepEqual(findInRoll(roll, keys("16bis", "rue blomet")), { kind: "address", constituencies: ["75-12"] })
  assert.deepEqual(findInRoll(roll, keys(null, "8 mai 1945")), { kind: "street", constituencies: ["75-13"] })
  assert.throws(() => parseRoll([{ address: "Rue Blomet", number: "3", constituencies: "75-12" }], FILE), /does not start/)
})

test("a number is looked up before its street", () => {
  assert.deepEqual(findInRoll(roll, keys("108", "rue blomet")), { kind: "address", constituencies: ["75-13"] })
})

test("a street wholly in one constituency answers for a number the roll does not list", () => {
  assert.deepEqual(findInRoll(roll, keys("999", "rue de viroflay")), { kind: "street", constituencies: ["75-12"] })
  assert.deepEqual(findInRoll(roll, keys("3", "Rue de la Bruyère")), { kind: "street", constituencies: ["75-13"] })
})

test("without a number, a street with number rows or spellings in two constituencies is mixed", () => {
  assert.deepEqual(findInRoll(roll, keys(null, "rue blomet")), { kind: "mixed-street", constituencies: ["75-12", "75-13"] })
  assert.deepEqual(findInRoll(roll, keys(null, "rue du stand")), { kind: "mixed-street", constituencies: ["75-12", "75-13"] })
  assert.deepEqual(findInRoll(roll, keys(null, "route de dampierre")), { kind: "mixed-street", constituencies: ["75-12", "75-13"] })
})

test("a number missing from a mixed street, or an unknown street, is not found", () => {
  assert.deepEqual(findInRoll(roll, keys("106", "rue blomet")), { kind: "none" })
  assert.deepEqual(findInRoll(roll, keys("4", "rue du stand")), { kind: "none" })
  assert.deepEqual(findInRoll(roll, keys(null, "rue inconnue")), { kind: "none" })
})

test("an address the REU puts in two constituencies keeps both, on one row or across spellings", () => {
  assert.deepEqual(findInRoll(roll, keys("2", "rue bausset")), { kind: "address", constituencies: ["75-12", "75-13"] })
  assert.deepEqual(findInRoll(roll, keys("3", "rue bausset")), { kind: "address", constituencies: ["75-12", "75-13"] })
})

test("a bracketed former commune keeps its street apart from a homonym, and brackets are dropped only for a spelling the roll lacks", () => {
  const dunkerque = parseRoll(
    [
      { address: "29 Rue Gambetta (Saint-Pol-sur-Mer)", number: "29", constituencies: "59-13" },
      { address: "30 Rue Gambetta (Saint-Pol-sur-Mer)", number: "30", constituencies: "59-14" },
      { address: "Rue Gambetta", number: "", constituencies: "59-14" },
      { address: "Rue Chanzy (Saint-Pol-sur-Mer)", number: "", constituencies: "59-13" },
    ],
    "communes/addresses/59183.csv",
  )
  assert.deepEqual(findInRoll(dunkerque, keys("29", "Rue Gambetta (Saint-Pol-sur-Mer)")), { kind: "address", constituencies: ["59-13"] })
  assert.deepEqual(findInRoll(dunkerque, keys("29", "Rue Gambetta")), { kind: "street", constituencies: ["59-14"] })
  assert.deepEqual(findInRoll(dunkerque, keys("40", "Rue Gambetta (Saint-Pol-sur-Mer)")), { kind: "none" })
  assert.deepEqual(findInRoll(dunkerque, keys("5", "Rue Chanzy")), { kind: "street", constituencies: ["59-13"] })
})

test("an invalid constituency rejects the file", () => {
  assert.throws(() => parseRoll([{ address: "Rue X", number: "", constituencies: "75-12|" }], FILE), /invalid constituency/)
})
