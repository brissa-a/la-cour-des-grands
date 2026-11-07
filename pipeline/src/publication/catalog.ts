import { type JsonRecord, fieldOf, list, parseJson, record, text } from "../core/json.ts";
import { type SnapshotPath, snapshotPath } from "./paths.ts";

export type Column = { readonly name: string; readonly type: string };

export type EntryShape =
  | { readonly kind: "table"; readonly format: "csv" | "geojson"; readonly columns: readonly Column[] }
  | { readonly kind: "generated-columns"; readonly count: number };

export type CatalogEntry = {
  readonly file: SnapshotPath;
  readonly key: string;
  readonly rows: number;
  readonly size: number;
  readonly shape: EntryShape;
  readonly references: readonly SnapshotPath[];
};

export type SnapshotCatalog = ReadonlyMap<SnapshotPath, CatalogEntry>;

export const CATALOG_FILE = snapshotPath("catalog.json");

function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${what} is not a count`);
  return value;
}

const optionalPath = (value: unknown, what: string): SnapshotPath[] =>
  value === undefined ? [] : [snapshotPath(text(value, what))];

function entry(raw: JsonRecord): CatalogEntry {
  const file = snapshotPath(text(raw.file, "catalog file"));
  const what = `catalog ${file}`;
  const background = optionalPath(fieldOf(raw.layout, "background"), `${what} layout background`);
  if (raw.columnsOf !== undefined) {
    const columnsOf = record(raw.columnsOf, `${what} columnsOf`);
    return {
      file,
      key: text(raw.key, `${what} key`),
      rows: count(raw.rows, `${what} rows`),
      size: count(raw.size, `${what} size`),
      shape: { kind: "generated-columns", count: count(columnsOf.count, `${what} columnsOf count`) },
      references: [...background, ...optionalPath(fieldOf(columnsOf.feature, "values"), `${what} columnsOf values`)],
    };
  }
  const features = list(raw.features, `${what} features`).map((f) => record(f, `${what} feature`));
  return {
    file,
    key: text(raw.key, `${what} key`),
    rows: count(raw.rows, `${what} rows`),
    size: count(raw.size, `${what} size`),
    shape: {
      kind: "table",
      format: raw.geometry === undefined ? "csv" : "geojson",
      columns: features.map((f) => ({ name: text(f.column, `${what} column`), type: text(f.type, `${what} column type`) })),
    },
    references: [...background, ...features.flatMap((f) => optionalPath(f.values, `${what} values`))],
  };
}

export function parseCatalog(content: string): SnapshotCatalog {
  const entries = new Map<SnapshotPath, CatalogEntry>();
  for (const raw of list(record(parseJson(content), "catalog").files, "catalog files")) {
    const parsed = entry(record(raw, "catalog entry"));
    if (entries.has(parsed.file)) throw new Error(`catalog lists ${parsed.file} twice`);
    entries.set(parsed.file, parsed);
  }
  return entries;
}

export const catalogFiles = (catalog: SnapshotCatalog): SnapshotPath[] => [
  ...new Set([CATALOG_FILE, ...[...catalog.values()].flatMap((e) => [e.file, ...e.references])]),
];
