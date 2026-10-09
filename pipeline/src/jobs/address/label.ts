export type ReuGeoType = "housenumber" | "interpolation" | "street" | "locality" | "municipality";

const REU_GEO_TYPES: ReadonlySet<string> = new Set<ReuGeoType>(["housenumber", "interpolation", "street", "locality", "municipality"]);

export const isReuGeoType = (value: string): value is ReuGeoType => REU_GEO_TYPES.has(value);

export type ReuLabel = { number: string | null; street: string };

const NUMBERED_LABEL = /^(?:(\d+(?:\s?(?:bis|ter|quater|[a-z]))?)\s+)?(.+?)\s+\d{5}\s+\S.*$/i;
const UNNUMBERED_LABEL = /^(.+?)\s+\d{5}\s+\S.*$/;

export function parseReuLabel(label: string, type: Exclude<ReuGeoType, "municipality">): ReuLabel | null {
  if (type === "street" || type === "locality") {
    const match = UNNUMBERED_LABEL.exec(label);
    return match === null ? null : { number: null, street: match[1]! };
  }
  const match = NUMBERED_LABEL.exec(label);
  return match === null ? null : { number: match[1] ?? null, street: match[2]! };
}
