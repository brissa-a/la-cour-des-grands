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

export type Value<F extends Feature> = F extends { type: "category"; values: readonly (infer V)[] }
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

type PublishedFeature = Feature & { column: string; colors?: Colors };

type ColumnsOf = {
  entity: string;
  count: number;
  feature: Feature & { colors?: Colors };
};

export type PublishedFile = {
  file: string;
  entity: string;
  key: string;
  rows: number;
  size: number;
  gzipSize: number;
  layout?: Layout;
} & ({ features: PublishedFeature[] } | { columnsOf: ColumnsOf });

type Cell = string | number | readonly string[] | null;

export const OUTPUT_DIR = "output/v2";

function cell(value: Cell): string {
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

async function writeTable<R>(table: {
  path: string;
  entity: Entity<R>;
  items: R[];
  columns: string[];
  description: { features: PublishedFeature[] } | { columnsOf: ColumnsOf };
  cells: (item: R) => Cell[];
  gzipBudget: number | undefined;
  layout: Layout | undefined;
}): Promise<PublishedFile> {
  const { entity } = table;
  const lines = table.items.map((item) => [entity.id(item), ...table.cells(item)].map(cell).join(","));
  const header = [entity.key, ...table.columns].map(cell).join(",");
  const content = new TextEncoder().encode([header, ...lines].join("\n") + "\n");
  const gzipSize = gzipSync(content).length;
  if (table.gzipBudget !== undefined && gzipSize > table.gzipBudget) {
    throw new Error(`${table.path} exceeds its budget: ${gzipSize} > ${table.gzipBudget} gzipped bytes`);
  }
  await writeOutput(table.path, content);
  return {
    file: table.path,
    entity: entity.name,
    key: entity.key,
    rows: lines.length,
    size: content.length,
    gzipSize,
    ...table.description,
    ...(table.layout ? { layout: table.layout } : {}),
  };
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
  const path = `${definition.entity.folder}/${definition.file}`;
  return job({
    name: path,
    dependencies: { items: definition.entity.rows },
    async run({ items }) {
      const results = await resolve(definition.dependencies);
      const columns = Object.keys(definition.features) as (keyof F & string)[];
      const colors: Partial<Record<keyof F, Colors>> = definition.colors?.(items, results) ?? {};
      return writeTable({
        path,
        entity: definition.entity,
        items,
        columns,
        description: {
          features: columns.map((column) => {
            const columnColors = colors[column];
            return { ...(definition.features[column] as Feature), column, ...(columnColors ? { colors: columnColors } : {}) };
          }),
        },
        cells: (item) => {
          const row = definition.row(item, results);
          return columns.map((c) => row[c]);
        },
        gzipBudget: definition.gzipBudget,
        layout: definition.layout as Layout | undefined,
      });
    },
  });
}

export type GeneratedFile<C> = { file: string; columns: C[] };

export function generatedCsvs<R, C, const D extends Dependencies, const F extends Feature>(definition: {
  name: string;
  entity: Entity<R>;
  columnEntity: Entity<C>;
  dependencies: D;
  feature: F;
  colors?: Colors;
  files: (columns: C[], results: Results<D>) => GeneratedFile<C>[];
  value: (item: R, column: C, results: Results<D>) => Value<F> | null;
  gzipBudget?: number;
}): Job<PublishedFile[]> {
  const { colors } = definition;
  return job({
    name: definition.name,
    dependencies: { items: definition.entity.rows, columnItems: definition.columnEntity.rows },
    async run({ items, columnItems }) {
      const results = await resolve(definition.dependencies);
      return Promise.all(
        definition.files(columnItems, results).map(({ file, columns }) =>
          writeTable({
            path: `${definition.entity.folder}/${file}`,
            entity: definition.entity,
            items,
            columns: columns.map((c) => definition.columnEntity.id(c)),
            description: {
              columnsOf: {
                entity: definition.columnEntity.name,
                count: columns.length,
                feature: { ...(definition.feature as Feature), ...(colors ? { colors } : {}) },
              },
            },
            cells: (item) => columns.map((column) => definition.value(item, column, results)),
            gzipBudget: definition.gzipBudget,
            layout: undefined,
          }),
        ),
      );
    },
  });
}
