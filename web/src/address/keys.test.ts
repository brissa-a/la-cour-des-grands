import assert from "node:assert/strict"
import { test } from "node:test"
import { communeCode } from "./codes.ts"
import type { PreciseAddress } from "./geocoder.ts"
import { keysOf, numberKey, streetKeys } from "./keys.ts"

test("loose street keys drop brackets, accents, case and punctuation", () => {
  const cases: [string, string][] = [
    ["Rue de la Bruyère (Lille)", "rue de la bruyere"],
    ["Route de l'Érauderie (Chemillé)", "route de l erauderie"],
    ["Chemin Radjabou M’Pwecha", "chemin radjabou m pwecha"],
    ["Route Gabriel Macé (C.D. 50)", "route gabriel mace"],
    ["Ancien Chemin d’Antibes", "ancien chemin d antibes"],
    ["Ancien Chemin d'Antibes", "ancien chemin d antibes"],
    ["rue du stand", "rue du stand"],
    ["Rue du Stand", "rue du stand"],
    ["Rue du Cœur", "rue du c ur"],
  ]
  for (const [street, key] of cases) assert.equal(streetKeys(street).loose, key, street)
})

test("exact street keys keep the bracketed former commune", () => {
  assert.deepEqual(streetKeys("Rue Gambetta (Saint-Pol-sur-Mer)"), { exact: "rue gambetta saint pol sur mer", loose: "rue gambetta" })
  assert.deepEqual(streetKeys("Rue Gambetta"), { exact: "rue gambetta", loose: "rue gambetta" })
})

test("number keys drop case and spaces so the REU and BAN spellings meet", () => {
  assert.equal(numberKey("1B"), "1b")
  assert.equal(numberKey("12 bis"), "12bis")
  assert.equal(numberKey("12bis"), "12bis")
})

test("only a housenumber carries a number key; a lieu-dit is matched as a street", () => {
  const base = {
    label: "",
    name: "",
    citycode: communeCode("75115")!,
    oldcitycode: null,
    postcode: "75015",
    city: "Paris",
    point: [2.3, 48.84],
    score: 0.9,
  } as const
  const housenumber: PreciseAddress = { ...base, type: "housenumber", housenumber: "16bis", street: "Rue Blomet" }
  const street: PreciseAddress = { ...base, type: "street", street: "Rue Blomet" }
  const locality: PreciseAddress = { ...base, type: "locality", locality: "Le Bourg" }
  const blomet = { exact: "rue blomet", loose: "rue blomet" }
  assert.deepEqual(keysOf(housenumber), { number: "16bis", street: blomet })
  assert.deepEqual(keysOf(street), { number: null, street: blomet })
  assert.deepEqual(keysOf(locality), { number: null, street: { exact: "le bourg", loose: "le bourg" } })
})
