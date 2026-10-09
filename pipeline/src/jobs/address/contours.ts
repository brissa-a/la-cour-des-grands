import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import {
  type BBox,
  type Polygon,
  type Ring,
  clipRing,
  distanceMeters,
  padBox,
  polygonsFromShapefileRings,
  ringArea,
  roundRing,
  simplifyRing,
} from "../../core/geometry.ts";
import { job } from "../../core/job.ts";
import { readPolygonShapes } from "../../core/shapefile.ts";
import type { ConstituencyCode } from "../deputies.ts";
import { type CommuneCode, fromContourId } from "./codes.ts";
import { type RollUnit, electoralRoll } from "./roll.ts";
import { inseeContours } from "./sources.ts";

export const constituencyShapes = job({
  name: "constituency shapes",
  dependencies: { inseeContours },
  async run({ inseeContours }): Promise<ReadonlyMap<ConstituencyCode, readonly Polygon[]>> {
    const files = unzipSync(new Uint8Array(await readFile(inseeContours)), { filter: (f) => /\.(shp|dbf)$/.test(f.name) });
    const file = (extension: string) => {
      const found = Object.entries(files).find(([name]) => name.endsWith(extension));
      if (found === undefined) throw new Error(`${inseeContours} has no ${extension} file`);
      return found[1];
    };
    const shapes = new Map<ConstituencyCode, Polygon[]>();
    for (const { id, rings } of readPolygonShapes(file(".shp"), file(".dbf"), "id_circo")) {
      const code = fromContourId(id);
      if (shapes.has(code)) throw new Error(`Two contours for ${code}`);
      shapes.set(code, polygonsFromShapefileRings(rings));
    }
    return shapes;
  },
});

// The front's "near a boundary" distance cannot exceed this margin: beyond it, clipped edges are not real boundaries.
const CLIP_MARGIN_METERS = 1000;
const SIMPLIFY_METERS = 5;
const DECIMALS = 5;
const MIN_AGREEMENT = 0.9;
const MAX_UNITS_WITHOUT_CONTOURS = 10;
const COLLAPSED_SQUARE_DEGREES = 1e-10;

export type ContourPart = {
  commune: CommuneCode;
  constituency: ConstituencyCode;
  polygons: readonly Polygon[];
};

const isCollapsed = (ring: Ring | null) => ring === null || Math.abs(ringArea(ring)) < COLLAPSED_SQUARE_DEGREES;

// Simplifying a sliver thinner than the tolerance flattens it to a back-and-forth line: keep that ring unsimplified.
function prepareRing(ring: Ring, box: BBox): Ring | null {
  const clipped = clipRing(ring, box);
  if (clipped === null) return null;
  const simplified = roundRing(simplifyRing(clipped, SIMPLIFY_METERS), DECIMALS);
  if (!isCollapsed(simplified)) return simplified;
  const unsimplified = roundRing(clipped, DECIMALS);
  return isCollapsed(unsimplified) ? null : unsimplified;
}

function clipPolygons(polygons: readonly Polygon[], box: BBox): Polygon[] {
  return polygons.flatMap((polygon): Polygon[] => {
    const outer = prepareRing(polygon.outer, box);
    if (outer === null) return [];
    return [{ outer, holes: polygon.holes.map((hole) => prepareRing(hole, box)).filter((hole) => hole !== null) }];
  });
}

function nearest(shapes: readonly (readonly [ConstituencyCode, readonly Polygon[]])[], lon: number, lat: number): ConstituencyCode {
  let best = shapes[0]![0];
  let bestMeters = Infinity;
  for (const [constituency, polygons] of shapes) {
    const meters = distanceMeters(polygons, [lon, lat]);
    if (meters < bestMeters) {
      bestMeters = meters;
      best = constituency;
    }
    if (meters === 0) break;
  }
  return best;
}

function agreement({ points }: RollUnit, shapes: readonly (readonly [ConstituencyCode, readonly Polygon[]])[]): number {
  let agreeing = 0;
  for (let i = 0; i < points.lon.length; i++) {
    if (nearest(shapes, points.lon[i]!, points.lat[i]!) === points.constituency[i]) agreeing++;
  }
  return agreeing / points.lon.length;
}

export const splitCommuneContours = job({
  name: "split commune contours",
  dependencies: { constituencyShapes, electoralRoll },
  run({ constituencyShapes, electoralRoll }): ContourPart[] {
    const parts: ContourPart[] = [];
    const omitted: string[] = [];
    for (const rollUnit of electoralRoll.values()) {
      const { unit } = rollUnit;
      const box = padBox(rollUnit.bbox, CLIP_MARGIN_METERS);
      const shapes = unit.candidates.map((c) => [c, clipPolygons(constituencyShapes.get(c) ?? [], box)] as const);
      const uncovered = shapes.filter(([, polygons]) => polygons.length === 0).map(([c]) => c);
      if (uncovered.length > 0) {
        omitted.push(`${unit.code} ${unit.name} (no contour of ${uncovered.join(", ")} near its addresses)`);
        continue;
      }
      const share = agreement(rollUnit, shapes);
      if (share < MIN_AGREEMENT) {
        omitted.push(`${unit.code} ${unit.name} (${(share * 100).toFixed(1)}% agree with the roll)`);
        continue;
      }
      parts.push(...shapes.map(([constituency, polygons]) => ({ commune: unit.code, constituency, polygons })));
    }
    console.log(`  contours for ${electoralRoll.size - omitted.length} split units, ${omitted.length} left out: ${omitted.join(", ")}`);
    if (omitted.length > MAX_UNITS_WITHOUT_CONTOURS) throw new Error(`${omitted.length} split units left out of the contours`);
    return parts;
  },
});
