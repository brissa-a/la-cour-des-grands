import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { type Deputy, deputies } from "../jobs/deputies.ts";
import { type Dependencies, type Job, type Results, job, resolve } from "./job.ts";
import type { IsoDate } from "./types.ts";

type SimpleFeature = {
  title: string;
  type: "text" | "number" | "date" | "code" | "list" | "link" | "image" | "position";
};

type CategoryFeature = {
  title: string;
  type: "category";
  values?: readonly string[];
};

export type Feature = SimpleFeature | CategoryFeature;
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

export type PublishedFile = {
  file: string;
  rows: number;
  size: number;
  gzipSize: number;
  features: (Feature & { column: string; colors?: Colors })[];
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

export function csv<const D extends Dependencies, const F extends Features>(definition: {
  file: string;
  dependencies: D;
  features: F;
  row: (deputy: Deputy, results: Results<D>) => Row<F>;
  colors?: (deputies: Deputy[], results: Results<D>) => Partial<Record<keyof F, Colors>>;
  gzipBudget?: number;
}): Job<PublishedFile> {
  return job({
    name: definition.file,
    dependencies: { deputies },
    async run({ deputies }) {
      const results = await resolve(definition.dependencies);
      const columns = Object.keys(definition.features) as (keyof F & string)[];
      const lines = deputies.map((d) => {
        const row = definition.row(d, results);
        return [d.id, ...columns.map((c) => cell(row[c]))].join(",");
      });
      const content = new TextEncoder().encode([["deputy_id", ...columns].join(","), ...lines].join("\n") + "\n");
      const gzipSize = gzipSync(content).length;
      if (definition.gzipBudget !== undefined && gzipSize > definition.gzipBudget) {
        throw new Error(`${definition.file} exceeds its budget: ${gzipSize} > ${definition.gzipBudget} gzipped bytes`);
      }
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(`${OUTPUT_DIR}/${definition.file}`, content);
      const colors: Partial<Record<keyof F, Colors>> = definition.colors?.(deputies, results) ?? {};
      return {
        file: definition.file,
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
      };
    },
  });
}
