import assert from "node:assert/strict";
import { test } from "node:test";
import { constituencyCode } from "../deputies.ts";
import { type Street, addToStreet, compressStreets } from "./streets.ts";

const c12 = constituencyCode("75-12");
const c13 = constituencyCode("75-13");

test("a street in one constituency is a single row, whatever its numbers", () => {
  const streets = new Map<string, Street>();
  addToStreet(streets, "Rue de Viroflay", "1", c12);
  addToStreet(streets, "Rue de Viroflay", "3", c12);
  addToStreet(streets, "Rue de Viroflay", null, c12);
  assert.deepEqual(compressStreets(streets), [{ address: "Rue de Viroflay", number: null, constituencies: [c12] }]);
});

test("a mixed street lists its numbers and no street row", () => {
  const streets = new Map<string, Street>();
  addToStreet(streets, "Rue Blomet", "104", c12);
  addToStreet(streets, "Rue Blomet", "106", c13);
  addToStreet(streets, "Rue Blomet", "106", c12);
  addToStreet(streets, "Rue Blomet", null, c13);
  assert.deepEqual(compressStreets(streets), [
    { address: "104 Rue Blomet", number: "104", constituencies: [c12] },
    { address: "106 Rue Blomet", number: "106", constituencies: [c12, c13] },
  ]);
});

test("a mixed street without numbers keeps one row with every constituency", () => {
  const streets = new Map<string, Street>();
  addToStreet(streets, "Le Bourg", null, c13);
  addToStreet(streets, "Le Bourg", null, c12);
  assert.deepEqual(compressStreets(streets), [{ address: "Le Bourg", number: null, constituencies: [c12, c13] }]);
});
