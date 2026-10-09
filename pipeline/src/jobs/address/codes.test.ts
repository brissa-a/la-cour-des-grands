import assert from "node:assert/strict";
import { test } from "node:test";
import { constituencyCode } from "../deputies.ts";
import { communeCode, fromContourId, fromInseeCode, fromMinistryCode, ministryStationKey, paddedCommuneCode, sortedConstituencies } from "./codes.ts";

test("INSEE polling-station constituency codes", () => {
  assert.equal(fromInseeCode("01-04"), "01-4");
  assert.equal(fromInseeCode("2A-01"), "2A-1");
  assert.equal(fromInseeCode("971-01"), "971-1");
  assert.equal(fromInseeCode("978-01"), "977-1");
  assert.equal(fromInseeCode("75-18"), "75-18");
  assert.throws(() => fromInseeCode("0104"));
});

test("ministry constituency codes", () => {
  assert.equal(fromMinistryCode("0104"), "01-4");
  assert.equal(fromMinistryCode("2B02"), "2B-2");
  assert.equal(fromMinistryCode("ZA01"), "971-1");
  assert.equal(fromMinistryCode("ZX01"), "977-1");
  assert.equal(fromMinistryCode("ZW01"), "986-1");
  assert.equal(fromMinistryCode("ZN02"), "988-2");
  assert.equal(fromMinistryCode("ZZ11"), "099-11");
  assert.throws(() => fromMinistryCode("ZQ01"));
});

test("INSEE contour ids", () => {
  assert.equal(fromContourId("0501"), "05-1");
  assert.equal(fromContourId("97302"), "973-2");
  assert.equal(fromContourId("2A01"), "2A-1");
  assert.equal(fromContourId("7518"), "75-18");
});

test("ministry polling-station keys are padded to 4 digits", () => {
  assert.equal(ministryStationKey("30007_1"), "30007_0001");
  assert.equal(ministryStationKey("01001_0001"), "01001_0001");
  assert.equal(ministryStationKey("90010_A 1"), "90010_A 1");
  assert.equal(ministryStationKey(""), "");
});

test("code parsers reject malformed codes and pad 4-digit commune codes", () => {
  assert.throws(() => constituencyCode("100-1"));
  assert.throws(() => constituencyCode("75-0"));
  assert.throws(() => constituencyCode("75-04"));
  assert.throws(() => constituencyCode("20-1"));
  assert.throws(() => constituencyCode("96-1"));
  assert.equal(communeCode("2A004"), "2A004");
  assert.throws(() => communeCode("1001"));
  assert.equal(paddedCommuneCode("1001"), "01001");
  assert.throws(() => paddedCommuneCode("101"));
});

test("constituencies sort by department then number", () => {
  assert.deepEqual(sortedConstituencies(["75-10", "75-2", "44-6", "75-1"].map(constituencyCode)), ["44-6", "75-1", "75-2", "75-10"]);
});
