export type ReuGeoType = "housenumber" | "interpolation" | "street" | "locality" | "municipality";

const REU_GEO_TYPES: ReadonlySet<string> = new Set<ReuGeoType>(["housenumber", "interpolation", "street", "locality", "municipality"]);

export const isReuGeoType = (value: string): value is ReuGeoType => REU_GEO_TYPES.has(value);

export type ReuLabel = { number: string | null; street: string };

const NUMBERED_LABEL = /^(?:(\d+(?:\s?(?:bis|ter|quater|[a-z]))?)\s+)?(.+?)\s+\d{5}\s+\S.*$/i;
const UNNUMBERED_LABEL = /^(.+?)\s+\d{5}\s+\S.*$/;

export function parseReuLabel(label: string, type: Exclude<ReuGeoType, "municipality">): ReuLabel | null {
  if (type === "street" || type === "locality") {
    const [, street] = UNNUMBERED_LABEL.exec(label) ?? [];
    return street === undefined ? null : { number: null, street };
  }
  const [, number, street] = NUMBERED_LABEL.exec(label) ?? [];
  return street === undefined ? null : { number: number ?? null, street };
}
