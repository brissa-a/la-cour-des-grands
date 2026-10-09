import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReuLabel } from "./label.ts";

test("numbered REU labels", () => {
  assert.deepEqual(parseReuLabel("1b Rue de Viroflay 75015 Paris", "housenumber"), { number: "1b", street: "Rue de Viroflay" });
  assert.deepEqual(parseReuLabel("16 bis Rue Boileau 01000 Bourg-en-Bresse", "housenumber"), { number: "16 bis", street: "Rue Boileau" });
  assert.deepEqual(parseReuLabel("2B Rue du Moulin 31000 Toulouse", "housenumber"), { number: "2B", street: "Rue du Moulin" });
  assert.deepEqual(parseReuLabel("43c Rue la Fayette 21000 Dijon", "interpolation"), { number: "43c", street: "Rue la Fayette" });
  assert.deepEqual(parseReuLabel("1 Avenue Foch 75116 Paris", "housenumber"), { number: "1", street: "Avenue Foch" });
});

test("a housenumber label without a number keeps the whole street", () => {
  assert.deepEqual(parseReuLabel("Rue des Bles d'Or 01400 L'Abergement-Clémenciat", "housenumber"), {
    number: null,
    street: "Rue des Bles d'Or",
  });
});

test("street and locality labels keep a leading number in the name", () => {
  assert.deepEqual(parseReuLabel("8 Mai 1945 33000 Bordeaux", "street"), { number: null, street: "8 Mai 1945" });
  assert.deepEqual(parseReuLabel("1re Ruelle du Grand Verger 51100 Reims", "street"), { number: null, street: "1re Ruelle du Grand Verger" });
  assert.deepEqual(parseReuLabel("Le Bourg 01350 Culoz-Béon", "locality"), { number: null, street: "Le Bourg" });
});

test("a label without postcode is not parsed", () => {
  assert.equal(parseReuLabel("Rue sans code", "street"), null);
});
