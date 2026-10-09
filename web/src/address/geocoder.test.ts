import assert from "node:assert/strict"
import { test } from "node:test"
import { addressesFirst, addressQuery, parseGeocoderResponse } from "./geocoder.ts"

const RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [5.293911, 45.518458] },
      properties: {
        label: "1 Chemin de la Roche 38300 Eclose-Badinières",
        score: 0.8496345454545454,
        housenumber: "1",
        id: "38152_0123_00001",
        name: "1 Chemin de la Roche",
        postcode: "38300",
        citycode: "38152",
        oldcitycode: "38024",
        oldcity: "Badinières",
        city: "Eclose-Badinières",
        type: "housenumber",
        depcode: "38",
        street: "Chemin de la Roche",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.301268, 48.841024] },
      properties: {
        label: "Rue Blomet 75015 Paris",
        score: 0.9840109090909089,
        name: "Rue Blomet",
        postcode: "75015",
        citycode: "75115",
        city: "Paris",
        district: "Paris 15e Arrondissement",
        type: "street",
        street: "Rue Blomet",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [5.822406, 45.919548] },
      properties: {
        label: "Boursin le Bas 01350 Anglefort",
        score: 0.4588677922077922,
        type: "locality",
        name: "Boursin le Bas",
        postcode: "01350",
        citycode: "01010",
        city: "Anglefort",
        locality: "Boursin le Bas",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [1.433805, 43.604082] },
      properties: {
        label: "Toulouse",
        score: 0.9638772727272726,
        type: "municipality",
        name: "Toulouse",
        postcode: "31000",
        citycode: "31555",
        city: "Toulouse",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.3, 48.8] },
      properties: { label: "12 Rue X 75015 Paris", score: 0.9, name: "12 Rue X", citycode: "75115", city: "Paris", type: "housenumber", street: "Rue X" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: ["2.3", 48.8] },
      properties: { label: "Rue Y 75015 Paris", score: 0.9, name: "Rue Y", citycode: "75115", city: "Paris", type: "street", street: "Rue Y" },
    },
  ],
}

test("a real response gives one address per usable feature and drops the rest", () => {
  const [housenumber, street, locality, municipality, ...rest] = parseGeocoderResponse(RESPONSE)
  assert.deepEqual(housenumber, {
    label: "1 Chemin de la Roche 38300 Eclose-Badinières",
    name: "1 Chemin de la Roche",
    citycode: "38152",
    oldcitycode: "38024",
    postcode: "38300",
    city: "Eclose-Badinières",
    point: [5.293911, 45.518458],
    score: 0.8496345454545454,
    type: "housenumber",
    housenumber: "1",
    street: "Chemin de la Roche",
  })
  assert.equal(street?.type === "street" && street.street, "Rue Blomet")
  assert.equal(street?.oldcitycode, null)
  assert.equal(locality?.type === "locality" && locality.locality, "Boursin le Bas")
  assert.equal(municipality?.type, "municipality")
  assert.deepEqual(rest, [])
  assert.deepEqual(parseGeocoderResponse({ error: "rate limited" }), [])
})

test("only address-like text is sent to the geocoder, trimmed and capped", () => {
  assert.equal(addressQuery("12 rue x"), "12 rue x")
  assert.equal(addressQuery("Mélenchon"), null)
  assert.equal(addressQuery("75"), null)
  assert.equal(addressQuery("  ,12   rue "), "12 rue")
  assert.equal(addressQuery("rue 12"), "rue 12")
  assert.equal(addressQuery("12 av"), null)
  assert.equal(addressQuery(`12 rue ${"a".repeat(250)}`)?.length, 200)
})

test("addresses come first only for a number followed by two words", () => {
  assert.equal(addressesFirst("12 rue Blomet"), true)
  assert.equal(addressesFirst("3 bis av Foch"), true)
  assert.equal(addressesFirst("33 Gironde"), false)
  assert.equal(addressesFirst("Paris 15"), false)
})
