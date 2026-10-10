import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDate } from "../core/types.ts";
import { inOfficeOn, mandate, seatNumber } from "./deputies.ts";

function mandateIn59_21(dateDebut: string, dateFin: string | null, datePriseFonction: string | null, placeHemicycle = "") {
  return mandate({
    uid: "PM843131",
    typeOrgane: "ASSEMBLEE",
    legislature: "17",
    dateDebut,
    dateFin,
    organes: { organeRef: "PO838901" },
    election: { lieu: { region: "Hauts-de-France", departement: "Nord", numDepartement: "59", numCirco: "21" } },
    mandature: { datePriseFonction, placeHemicycle },
  });
}

test("a substitute and a minister back from government hold the seat in turn, from the day each takes office", () => {
  const minister = [
    mandateIn59_21("2024-07-07", "2024-10-21", "2024-07-08"),
    mandateIn59_21("2024-07-07", null, "2025-11-06"),
  ];
  const substitute = [mandateIn59_21("2024-07-07", "2025-11-05", "2024-10-22")];
  const holdersOn = (date: string) => [minister, substitute].map((mandates) => inOfficeOn(mandates, isoDate(date)));
  assert.deepEqual(holdersOn("2024-10-08"), [true, false]);
  assert.deepEqual(holdersOn("2025-06-01"), [false, true]);
  assert.deepEqual(holdersOn("2025-11-06"), [true, false]);
});

test("a mandate without a date of taking office is rejected rather than dated from the election", () => {
  assert.throws(() => mandateIn59_21("2024-07-07", null, null), /datePriseFonction/);
});

test("a mandate's seat is read from placeHemicycle without its zero padding, and a mandate cleared of it has none", () => {
  assert.equal(mandateIn59_21("2024-07-07", null, "2025-11-06", "040").seat, seatNumber("40"));
  assert.equal(mandateIn59_21("2024-07-07", "2026-09-30", "2024-07-08", "").seat, null);
});

test("malformed seat numbers are rejected rather than read as a fraction, a negative or NaN", () => {
  for (const malformed of ["", "3.5", "12a", "-1", "12345"]) assert.throws(() => seatNumber(malformed), /Invalid seat number/);
});
