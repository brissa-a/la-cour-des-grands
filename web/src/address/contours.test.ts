import assert from "node:assert/strict"
import { test } from "node:test"
import { communeCode, constituencyCode, type CommuneCode, type ConstituencyCode } from "./codes.ts"
import { parseContours } from "./contours.ts"

function code(value: string): ConstituencyCode {
  const parsed = constituencyCode(value)
  if (parsed === null) throw new Error(`invalid constituency fixture "${value}"`)
  return parsed
}

function commune(value: string): CommuneCode {
  const parsed = communeCode(value)
  if (parsed === null) throw new Error(`invalid commune fixture "${value}"`)
  return parsed
}

const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
const hole = [[0.2, 0.2], [0.2, 0.4], [0.4, 0.4], [0.4, 0.2], [0.2, 0.2]]

const feature = (properties: object, geometry: object = { type: "MultiPolygon", coordinates: [[ring, hole]] }) => ({
  type: "Feature",
  properties,
  geometry,
})

const collection = (...features: object[]) => ({ type: "FeatureCollection", features })

test("features are grouped by commune, then by constituency, holes kept apart", () => {
  const contours = parseContours(
    collection(
      feature({ commune_code: "75115", constituency: "75-12" }),
      feature({ commune_code: "75115", constituency: "75-13" }, { type: "MultiPolygon", coordinates: [[ring], [ring]] }),
      feature({ commune_code: "31555", constituency: "31-1" }),
    ),
  )
  const paris = contours.get(commune("75115"))
  assert.deepEqual([...contours.keys()], ["75115", "31555"])
  assert.deepEqual(paris?.get(code("75-12")), [{ outer: ring, holes: [hole] }])
  assert.equal(paris.get(code("75-13"))?.length, 2)
})

test("a feature that does not follow the published format rejects the file", () => {
  const invalid = [
    { type: "Feature" },
    collection(feature({ commune_code: "75115", constituency: "75-12" }, { type: "Polygon", coordinates: [ring] })),
    collection(feature({ constituency: "75-12" })),
    collection(feature({ commune_code: "75115" })),
    collection(feature({ commune_code: "75115", constituency: "75-12" }, { type: "MultiPolygon", coordinates: [[[["0", "0"], ...ring.slice(1)]]] })),
    collection(feature({ commune_code: "75115", constituency: "75-12" }, { type: "MultiPolygon", coordinates: [] })),
    collection(feature({ commune_code: "75115", constituency: "75-12" }, { type: "MultiPolygon", coordinates: [[ring.slice(2)]] })),
  ]
  for (const json of invalid) assert.throws(() => parseContours(json), /constituency-contours\.geojson/)
})
