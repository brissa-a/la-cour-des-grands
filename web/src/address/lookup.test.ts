import assert from "node:assert/strict"
import { test } from "node:test"
import { communeCode, constituencyCode, type CommuneCode, type ConstituencyCode } from "./codes.ts"
import { parseCommuneTable, type CommuneTable } from "./communes.ts"
import type { Contours } from "./contours.ts"
import type { GeocodedAddress } from "./geocoder.ts"
import type { LonLat, Shape } from "./geometry.ts"
import { lookup, type LookupOutcome, type LookupSources } from "./lookup.ts"
import { parseRoll, type Roll } from "./roll.ts"

const BOUNDARY_METERS = 300

const TABLE = parseCommuneTable([
  { commune_code: "01001", constituencies: "01-4" },
  { commune_code: "75115", constituencies: "75-12|75-13" },
  { commune_code: "31555", constituencies: "31-1|31-2|31-3" },
  { commune_code: "38152", constituencies: "38-7|38-10" },
  { commune_code: "38024", constituencies: "38-10" },
])

const box = (west: number, east: number): Shape => [
  { outer: [[west, 45], [east, 45], [east, 46], [west, 46], [west, 45]], holes: [] },
]

const code = (value: string): ConstituencyCode => constituencyCode(value)!
const commune = (value: string): CommuneCode => communeCode(value)!

const CONTOURS: Contours = new Map([
  [commune("75115"), new Map([[code("75-12"), box(0, 1)], [code("75-13"), box(1, 2)]])],
  [commune("31555"), new Map([[code("31-1"), box(1, 2)], [code("31-2"), box(0, 1)], [code("31-3"), box(2, 3)]])],
])

const ROLLS = new Map<CommuneCode, Roll>([
  [
    commune("75115"),
    parseRoll(
      [
        { address: "104 Rue Blomet", number: "104", constituencies: "75-13" },
        { address: "108 Rue Blomet", number: "108", constituencies: "75-12" },
        { address: "Rue de Viroflay", number: "", constituencies: "75-13" },
        { address: "Village Suisse", number: "", constituencies: "75-13" },
      ],
      "75115.csv",
    ),
  ],
  [commune("31555"), parseRoll([{ address: "2 Rue X", number: "2", constituencies: "31-1|31-3" }], "31555.csv")],
  [commune("38152"), parseRoll([{ address: "Chemin de la Roche", number: "", constituencies: "38-10" }], "38152.csv")],
])

const FAR: LonLat = [0.2, 45.5]
const NEAR: LonLat = [0.999, 45.5]
const OUTSIDE: LonLat = [5, 45.5]

type Fakes = Partial<LookupSources>

function sources(fakes: Fakes = {}): LookupSources & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    communes: () => {
      calls.push("communes")
      return fakes.communes?.() ?? Promise.resolve<CommuneTable>(TABLE)
    },
    contours: () => {
      calls.push("contours")
      return fakes.contours?.() ?? Promise.resolve(CONTOURS)
    },
    roll: unit => {
      calls.push(`roll ${unit}`)
      return fakes.roll?.(unit) ?? Promise.resolve(ROLLS.get(unit) ?? null)
    },
  }
}

const base = (citycode: string, point: LonLat, oldcitycode: string | null) => ({
  label: "",
  name: "",
  citycode: commune(citycode),
  oldcitycode: oldcitycode === null ? null : commune(oldcitycode),
  postcode: "",
  city: "",
  point,
  score: 1,
})

const housenumber = (citycode: string, point: LonLat, number: string, street: string, oldcitycode: string | null = null): GeocodedAddress => ({
  ...base(citycode, point, oldcitycode),
  type: "housenumber",
  housenumber: number,
  street,
})

const street = (citycode: string, point: LonLat, name: string): GeocodedAddress => ({ ...base(citycode, point, null), type: "street", street: name })

const locality = (citycode: string, point: LonLat, name: string): GeocodedAddress => ({ ...base(citycode, point, null), type: "locality", locality: name })

const municipality = (citycode: string): GeocodedAddress => ({ ...base(citycode, FAR, null), type: "municipality" })

function summary(outcome: LookupOutcome): unknown {
  const { address: _, ...rest } = outcome
  return rest
}

test("a single-constituency commune answers without contours or roll", async () => {
  const fake = sources()
  assert.deepEqual(summary(await lookup(housenumber("01001", FAR, "1", "Rue A"), fake, BOUNDARY_METERS)), {
    kind: "located",
    constituency: "01-4",
    basis: { kind: "commune" },
  })
  assert.deepEqual(fake.calls, ["communes"])
})

test("a housenumber far from any other constituency is answered by the contours alone", async () => {
  const fake = sources()
  const outcome = await lookup(housenumber("75115", FAR, "999", "Rue Inconnue"), fake, BOUNDARY_METERS)
  assert.deepEqual(summary(outcome), { kind: "located", constituency: "75-12", basis: { kind: "contours" } })
  assert.deepEqual(fake.calls, ["communes", "contours"])
})

test("a street or a lieu-dit always goes to the roll, even far from a boundary", async () => {
  for (const address of [street("75115", FAR, "Rue de Viroflay"), locality("75115", FAR, "Village Suisse")]) {
    const fake = sources()
    const outcome = await lookup(address, fake, BOUNDARY_METERS)
    assert.deepEqual(summary(outcome), { kind: "located", constituency: "75-13", basis: { kind: "roll", match: "street" } })
    assert.deepEqual(fake.calls, ["communes", "contours", "roll 75115"])
  }
})

test("near a boundary, the roll overrides the contours", async () => {
  const outcome = await lookup(housenumber("75115", NEAR, "104", "Rue Blomet"), sources(), BOUNDARY_METERS)
  assert.deepEqual(summary(outcome), { kind: "located", constituency: "75-13", basis: { kind: "roll", match: "address" } })
})

test("near a boundary and missing from the roll, the contours answer unconfirmed", async () => {
  const outcome = await lookup(housenumber("75115", NEAR, "106", "Rue Blomet"), sources(), BOUNDARY_METERS)
  assert.ok(outcome.kind === "located" && outcome.basis.kind === "unconfirmed")
  assert.equal(outcome.constituency, "75-12")
  assert.deepEqual({ ...outcome.basis, otherMeters: Math.round(outcome.basis.otherMeters) }, {
    kind: "unconfirmed",
    other: "75-13",
    otherMeters: 78,
    reason: "not-in-roll",
  })
})

test("the boundary distance is a setting", async () => {
  const outcome = await lookup(housenumber("75115", NEAR, "106", "Rue Blomet"), sources(), 50)
  assert.deepEqual(summary(outcome), { kind: "located", constituency: "75-12", basis: { kind: "contours" } })
})

test("a roll that fails to load leaves the contours' answer unconfirmed", async () => {
  const outcome = await lookup(housenumber("75115", NEAR, "104", "Rue Blomet"), sources({ roll: () => Promise.reject(new Error("HTTP 500")) }), BOUNDARY_METERS)
  assert.ok(outcome.kind === "located" && outcome.basis.kind === "unconfirmed")
  assert.equal(outcome.constituency, "75-12")
  assert.equal(outcome.basis.reason, "roll-unavailable")
})

test("an address the roll puts in two constituencies is ranked among those two only", async () => {
  const outcome = await lookup(housenumber("31555", [0.999, 45.5], "2", "Rue X"), sources(), BOUNDARY_METERS)
  assert.ok(outcome.kind === "located" && outcome.basis.kind === "unconfirmed")
  assert.equal(outcome.constituency, "31-1")
  assert.equal(outcome.basis.other, "31-3")
  assert.equal(outcome.basis.reason, "several-in-roll")
})

test("a point inside no candidate goes to the roll", async () => {
  const fake = sources()
  const outcome = await lookup(housenumber("75115", OUTSIDE, "108", "Rue Blomet"), fake, BOUNDARY_METERS)
  assert.deepEqual(summary(outcome), { kind: "located", constituency: "75-12", basis: { kind: "roll", match: "address" } })
  assert.deepEqual(fake.calls, ["communes", "contours", "roll 75115"])
})

test("a commune without contours always goes to the roll, and a miss asks for precision", async () => {
  const hit = await lookup(housenumber("38152", FAR, "1", "Chemin de la Roche"), sources(), BOUNDARY_METERS)
  assert.deepEqual(summary(hit), { kind: "located", constituency: "38-10", basis: { kind: "roll", match: "street" } })
  const miss = await lookup(housenumber("38152", FAR, "1", "Rue Absente"), sources(), BOUNDARY_METERS)
  assert.deepEqual(summary(miss), { kind: "imprecise", candidates: ["38-7", "38-10"], reason: "no-data" })
})

test("a failed contours load with no roll match asks for precision", async () => {
  const outcome = await lookup(housenumber("75115", FAR, "999", "Rue Inconnue"), sources({ contours: () => Promise.reject(new Error("offline")) }), BOUNDARY_METERS)
  assert.deepEqual(summary(outcome), { kind: "imprecise", candidates: ["75-12", "75-13"], reason: "no-data" })
})

test("a former commune still in the table answers for itself", async () => {
  const absorbed = await lookup(housenumber("38152", FAR, "9", "Rue Absente", "38024"), sources(), BOUNDARY_METERS)
  assert.deepEqual(summary(absorbed), { kind: "located", constituency: "38-10", basis: { kind: "commune" } })
  const split = await lookup(housenumber("01001", FAR, "999", "Rue Inconnue", "75115"), sources(), BOUNDARY_METERS)
  assert.deepEqual(summary(split), { kind: "located", constituency: "75-12", basis: { kind: "contours" } })
  const unknown = await lookup(housenumber("01001", FAR, "1", "Rue A", "99999"), sources(), BOUNDARY_METERS)
  assert.deepEqual(summary(unknown), { kind: "located", constituency: "01-4", basis: { kind: "commune" } })
})

test("a split commune picked as a whole, or a mixed street without a number, asks for precision", async () => {
  assert.deepEqual(summary(await lookup(municipality("31555"), sources(), BOUNDARY_METERS)), {
    kind: "imprecise",
    candidates: ["31-1", "31-2", "31-3"],
    reason: "municipality",
  })
  assert.deepEqual(summary(await lookup(street("75115", FAR, "Rue Blomet"), sources(), BOUNDARY_METERS)), {
    kind: "imprecise",
    candidates: ["75-12", "75-13"],
    reason: "mixed-street",
  })
})

test("an unknown commune and an unavailable table are told apart", async () => {
  assert.equal((await lookup(housenumber("99999", FAR, "1", "Rue A"), sources(), BOUNDARY_METERS)).kind, "unknown-commune")
  const offline = sources({ communes: () => Promise.reject(new Error("offline")) })
  assert.equal((await lookup(housenumber("01001", FAR, "1", "Rue A"), offline, BOUNDARY_METERS)).kind, "unavailable")
})
