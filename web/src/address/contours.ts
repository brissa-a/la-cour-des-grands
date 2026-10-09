import { communeCode, constituencyCode, type CommuneCode, type ConstituencyCode } from "./codes.ts"
import type { LonLat, Polygon, Ring, Shape } from "./geometry.ts"

export const CONTOURS_FILE = "communes/constituency-contours.geojson"

export type Contours = ReadonlyMap<CommuneCode, ReadonlyMap<ConstituencyCode, Shape>>

export function parseContours(json: unknown): Contours {
  if (!isObject(json) || json.type !== "FeatureCollection" || !Array.isArray(json.features)) throw invalid("not a FeatureCollection")
  const contours = new Map<CommuneCode, Map<ConstituencyCode, Polygon[]>>()
  for (const [index, feature] of (json.features as unknown[]).entries()) {
    const where = `feature ${index}`
    if (!isObject(feature) || !isObject(feature.properties) || !isObject(feature.geometry)) throw invalid(`${where} is not a Feature`)
    const { commune_code, constituency } = feature.properties
    const commune = typeof commune_code === "string" ? communeCode(commune_code) : null
    const code = typeof constituency === "string" ? constituencyCode(constituency) : null
    if (commune === null) throw invalid(`${where} has no valid commune_code`)
    if (code === null) throw invalid(`${where} has no valid constituency`)
    if (feature.geometry.type !== "MultiPolygon") throw invalid(`${where} is not a MultiPolygon`)
    const polygons = arrayOf(feature.geometry.coordinates, polygon)
    if (polygons === null || polygons.length === 0) throw invalid(`${where} has invalid coordinates`)
    const unit = contours.get(commune) ?? new Map<ConstituencyCode, Polygon[]>()
    contours.set(commune, unit)
    unit.set(code, [...(unit.get(code) ?? []), ...polygons])
  }
  return contours
}

function invalid(reason: string): Error {
  return new Error(`${CONTOURS_FILE}: ${reason}`)
}

function polygon(value: unknown): Polygon | null {
  const rings = arrayOf(value, ring)
  const [outer, ...holes] = rings ?? []
  return outer ? { outer, holes } : null
}

function ring(value: unknown): Ring | null {
  const positions = arrayOf(value, position)
  return positions && positions.length >= 4 ? positions : null
}

function position(value: unknown): LonLat | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const [lon, lat] = value as unknown[]
  return typeof lon === "number" && typeof lat === "number" && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
}

function arrayOf<T>(value: unknown, item: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const items: T[] = []
  for (const element of value) {
    const parsed = item(element)
    if (parsed === null) return null
    items.push(parsed)
  }
  return items
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
