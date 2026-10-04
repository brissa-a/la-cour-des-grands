import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import type { Entity } from "./entity.ts";
import { type Dependencies, type Job, type Results, job, resolve } from "./job.ts";
import type { IsoDate } from "./types.ts";

type SimpleFeature = {
  title: string;
  type: "text" | "number" | "date" | "code" | "list" | "link" | "image";
};

type CategoryFeature = {
  title: string;
  type: "category";
  values?: readonly string[];
};

type ReferenceFeature = {
  title: string;
  type: "reference";
  entity: string;
};

export type Feature = SimpleFeature | CategoryFeature | ReferenceFeature;
export type Features = Record<string, Feature>;

type Value<F extends Feature> = F extends { type: "category"; values: readonly (infer V)[] }
  ? V
  : F extends { type: "number" }
    ? number
    : F extends { type: "list" }
      ? readonly string[]
      : F extends { type: "date" }
        ? IsoDate
        : string;

export type Row<F extends Features> = { [K in keyof F]: Value<F[K]> | null };

export type Colors = Record<string, string>;

type Layout = { background: string };
type LayoutOption<F extends Features> = F extends { x: { type: "number" }; y: { type: "number" } } ? Layout : never;

export type PublishedFile = {
  file: string;
  entity: string;
  key: string;
  rows: number;
  size: number;
  gzipSize: number;
  features: (Feature & { column: string; colors?: Colors })[];
  layout?: Layout;
};

export const OUTPUT_DIR = "output/v2";

function cell(value: string | number | readonly string[] | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") {
    const invalid = value.find((v) => v.includes("|"));
    if (invalid !== undefined) throw new Error(`List value containing "|": ${invalid}`);
    return cell(value.join("|"));
  }
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export async function writeOutput(path: string, content: Uint8Array | string): Promise<void> {
  await mkdir(dirname(`${OUTPUT_DIR}/${path}`), { recursive: true });
  await writeFile(`${OUTPUT_DIR}/${path}`, content);
}

export function csv<R, const D extends Dependencies, const F extends Features>(definition: {
  entity: Entity<R>;
  file: string;
  dependencies: D;
  features: F;
  row: (item: R, results: Results<D>) => Row<F>;
  colors?: (items: R[], results: Results<D>) => Partial<Record<keyof F, Colors>>;
  layout?: LayoutOption<F>;
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
      const lines = items.map((item) => {
        const row = definition.row(item, results);
        return [cell(entity.id(item)), ...columns.map((c) => cell(row[c]))].join(",");
      });
      const content = new TextEncoder().encode([[entity.key, ...columns].join(","), ...lines].join("\n") + "\n");
      const gzipSize = gzipSync(content).length;
      if (definition.gzipBudget !== undefined && gzipSize > definition.gzipBudget) {
        throw new Error(`${path} exceeds its budget: ${gzipSize} > ${definition.gzipBudget} gzipped bytes`);
      }
      await writeOutput(path, content);
      const colors: Partial<Record<keyof F, Colors>> = definition.colors?.(items, results) ?? {};
      return {
        file: path,
        entity: entity.name,
        key: entity.key,
        rows: lines.length,
        size: content.length,
        gzipSize,
        features: columns.map((column) => {
          const columnColors = colors[column];
          return {
            ...(definition.features[column] as Feature),
            column,
            ...(columnColors ? { colors: columnColors } : {}),
          };
        }),
        ...(definition.layout ? { layout: definition.layout as Layout } : {}),
      };
    },
  });
}
