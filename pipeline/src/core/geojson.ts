import { gzipSync } from "node:zlib";
import { type Feature, type Features, type PublishedFile, type Row, checkValues, describe, writeOutput } from "./csv.ts";
import type { Entity } from "./entity.ts";
import { type Polygon, orientRing } from "./geometry.ts";
import { type Dependencies, type Job, type Results, job, resolve } from "./job.ts";

const rfc7946Coordinates = (polygons: readonly Polygon[]) =>
  polygons.map((p) => [orientRing(p.outer, true), ...p.holes.map((h) => orientRing(h, false))]);

export function geojson<R, const D extends Dependencies, const F extends Features>(definition: {
  entity: Entity<R>;
  file: string;
  dependencies: D;
  features: F;
  properties: (item: R, results: Results<D>) => Row<F>;
  geometry: (item: R) => readonly Polygon[];
  gzipBudget?: number;
}): Job<PublishedFile> {
  const { entity } = definition;
  const path = `${entity.folder}/${definition.file}`;
  return job({
    name: path,
    dependencies: { items: entity.rows },
    async run({ items }) {
      const results = await resolve(definition.dependencies);
      const columns = Object.keys(definition.features) as (keyof F & string)[];
      const features = columns.map((column) => ({ ...(definition.features[column] as Feature), column }));
      const properties = items.map((item) => definition.properties(item, results));
      await checkValues(
        path,
        features,
        properties.map((p) => columns.map((c) => p[c])),
      );
      const lines = items.map((item, i) =>
        JSON.stringify({
          type: "Feature",
          properties: { [entity.key]: entity.id(item), ...properties[i] },
          geometry: { type: "MultiPolygon", coordinates: rfc7946Coordinates(definition.geometry(item)) },
        }),
      );
      const content = new TextEncoder().encode(`{"type":"FeatureCollection","features":[\n${lines.join(",\n")}\n]}\n`);
      const gzipSize = gzipSync(content).length;
      if (definition.gzipBudget !== undefined && gzipSize > definition.gzipBudget) {
        throw new Error(`${path} exceeds its budget: ${gzipSize} > ${definition.gzipBudget} gzipped bytes`);
      }
      await writeOutput(path, content);
      return {
        file: path,
        entity: entity.name,
        key: entity.key,
        rows: items.length,
        size: content.length,
        gzipSize,
        features: features.map((f) => ({ ...describe(f), column: f.column })),
        geometry: "MultiPolygon",
      };
    },
  });
}
