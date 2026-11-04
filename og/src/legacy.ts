import type { FeatureKey } from "../../web/src/data/features.ts"
import { DEFAULT_COLOR_FEATURE } from "../../web/src/sources/views.ts"

type V1Layout = "hemicycle" | "pergroupe" | "perage" | "persexe" | "perfollower" | "perscrutin"

type V1Color = "groupe" | "age" | "sexe" | "twitter" | "scrutin"

const AGE: FeatureKey = "deputies/init.csv:age"

const CIVILITY: FeatureKey = "deputies/init.csv:civility"

const V1_CHARTS: Readonly<Record<V1Layout, FeatureKey | null>> = {
  hemicycle: null,
  pergroupe: DEFAULT_COLOR_FEATURE,
  perage: AGE,
  persexe: CIVILITY,
  perfollower: null,
  perscrutin: null,
}

const V1_COLORS: Readonly<Record<V1Color, FeatureKey | null>> = {
  groupe: DEFAULT_COLOR_FEATURE,
  age: AGE,
  sexe: CIVILITY,
  twitter: null,
  scrutin: null,
}

// "hemicycle" is a v2 layout too, so it alone never marks a link as v1's.
const V1_ONLY_LAYOUTS: ReadonlySet<string | null> = new Set(Object.keys(V1_CHARTS).filter(name => name !== "hemicycle"))

const V1_ONLY_PARAMS = ["scrutinIdLayout", "scrutinIdColor", "visualLayoutName", "visualColorName", "sf", "base", "onlyOne"]

const charts: ReadonlyMap<string | null, FeatureKey | null> = new Map(Object.entries(V1_CHARTS))

const colors: ReadonlyMap<string | null, FeatureKey | null> = new Map(Object.entries(V1_COLORS))

function isV1(params: URLSearchParams): boolean {
  return V1_ONLY_PARAMS.some(name => params.has(name)) || V1_ONLY_LAYOUTS.has(params.get("layout")) || colors.has(params.get("color"))
}

export function legacyParams(params: URLSearchParams): URLSearchParams {
  if (!isV1(params)) return params
  const translated = new URLSearchParams()
  const chart = charts.get(params.get("layout"))
  const color = colors.get(params.get("color"))
  if (chart) translated.set("chart", chart)
  if (color) translated.set("color", color)
  if (params.get("showPic") === "true") translated.set("showPic", "true")
  return translated
}
