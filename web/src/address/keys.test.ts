import assert from "node:assert/strict"
import { test } from "node:test"
import { numberKey, streetKeys } from "./keys.ts"

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
