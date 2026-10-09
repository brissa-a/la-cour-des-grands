import { communeCode, type CommuneCode } from "./codes.ts"
import type { LonLat } from "./geometry.ts"

const ENDPOINT = "https://data.geopf.fr/geocodage/search"
const LIMIT = 5
const MIN_LENGTH = 3
const MAX_LENGTH = 200

type AddressBase = {
  label: string
  name: string
  citycode: CommuneCode
  oldcitycode: CommuneCode | null
  postcode: string
  city: string
  point: LonLat
  score: number
}

export type GeocodedAddress =
  | (AddressBase & { type: "housenumber"; housenumber: string; street: string })
  | (AddressBase & { type: "street"; street: string })
  | (AddressBase & { type: "locality"; locality: string })
  | (AddressBase & { type: "municipality" })

export type PreciseAddress = Exclude<GeocodedAddress, { type: "municipality" }>

export function addressQuery(text: string): string | null {
  const query = text.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+/u, "").slice(0, MAX_LENGTH)
  if (query.length < MIN_LENGTH || !/\d/.test(query) || !/\p{L}{3,}/u.test(query)) return null
  return query
}

export function addressesFirst(text: string): boolean {
  return /^\s*\d+\S*(\s+\S*\p{L}\S*){2,}/u.test(text)
}

export async function searchAddresses(query: string, signal: AbortSignal): Promise<GeocodedAddress[]> {
  const url = `${ENDPOINT}?${new URLSearchParams({ q: query, limit: String(LIMIT) })}`
  const response = await fetch(url, { signal, referrerPolicy: "no-referrer" })
  if (!response.ok) throw new Error(`geocoder: HTTP ${response.status}`)
  return parseGeocoderResponse(await response.json())
}

export function parseGeocoderResponse(json: unknown): GeocodedAddress[] {
  const features = field(json, "features")
  return Array.isArray(features) ? features.flatMap(feature => parseFeature(feature) ?? []) : []
}

function parseFeature(feature: unknown): GeocodedAddress | null {
  const properties = field(feature, "properties")
  const coordinates = field(field(feature, "geometry"), "coordinates")
  const text = (key: string) => {
    const value = field(properties, key)
    return typeof value === "string" ? value : null
  }
  const citycode = communeCode(text("citycode") ?? "")
  const label = text("label")
  const name = text("name")
  const city = text("city")
  const score = field(properties, "score")
  if (citycode === null || label === null || name === null || city === null || typeof score !== "number") return null
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const [lon, lat] = coordinates as unknown[]
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
  const base: AddressBase = {
    label,
    name,
    citycode,
    oldcitycode: communeCode(text("oldcitycode") ?? ""),
    postcode: text("postcode") ?? "",
    city,
    point: [lon, lat],
    score,
  }
  const street = text("street")
  switch (text("type")) {
    case "housenumber": {
      const housenumber = text("housenumber")
      return housenumber && street ? { ...base, type: "housenumber", housenumber, street } : null
    }
    case "street":
      return street ? { ...base, type: "street", street } : null
    case "locality": {
      const locality = text("locality")
      return locality ? { ...base, type: "locality", locality } : null
    }
    case "municipality":
      return { ...base, type: "municipality" }
    default:
      return null
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined
}
