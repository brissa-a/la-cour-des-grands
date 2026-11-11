import { readFile } from "node:fs/promises";
import { parseDelimited } from "../core/delimited.ts";
import { fieldOf, list, parseJson } from "../core/json.ts";
import { isMissing } from "./files.ts";
import { CATALOG_FILE, type CatalogEntry, type SnapshotCatalog, parseCatalog } from "./catalog.ts";
import { type SnapshotPath, snapshotPath } from "./paths.ts";

export const DEPUTY_FLOOR = 550;
export const MAX_DEPUTY_DROP_PERCENT = 2;
export const MAX_PHOTO_DROP_PERCENT = 5;
const LISTED_PHOTOS = 5;

export type CountedFiles = { readonly deputies: SnapshotPath; readonly votes: SnapshotPath };

export type Snapshot = { readonly dir: string; readonly catalog: SnapshotCatalog };

export type Candidate = Snapshot & { readonly sizes: ReadonlyMap<SnapshotPath, number> };

export type Counts = { readonly deputies: number; readonly votes: number; readonly newVotes: number | null };

type Mismatch = "size" | "rows" | "header";

export type Refusal =
  | { readonly guard: "deputies-below-floor"; readonly candidate: number }
  | { readonly guard: "deputies-drop"; readonly current: number; readonly candidate: number }
  | { readonly guard: "votes-drop"; readonly current: number; readonly candidate: number }
  | { readonly guard: "entry-missing"; readonly file: SnapshotPath }
  | { readonly guard: "column-missing"; readonly file: SnapshotPath; readonly column: string }
  | { readonly guard: "file-missing"; readonly file: SnapshotPath }
  | { readonly guard: "file-empty"; readonly file: SnapshotPath }
  | { readonly guard: "catalog-mismatch"; readonly file: SnapshotPath; readonly field: Mismatch; readonly catalog: string; readonly actual: string }
  | { readonly guard: "photos-missing"; readonly file: SnapshotPath; readonly column: string; readonly photos: readonly string[] }
  | { readonly guard: "photos-drop"; readonly file: SnapshotPath; readonly column: string; readonly current: number; readonly candidate: number };

export function describeRefusal(refusal: Refusal): string {
  switch (refusal.guard) {
    case "deputies-below-floor":
      return `${refusal.candidate} deputies, under the floor of ${DEPUTY_FLOOR}`;
    case "deputies-drop":
      return `${refusal.candidate} deputies against ${refusal.current} in the current version, a drop of more than ${MAX_DEPUTY_DROP_PERCENT} %`;
    case "votes-drop":
      return `${refusal.candidate} votes against ${refusal.current} in the current version`;
    case "entry-missing":
      return `${refusal.file} is in the current catalog but not in the candidate's`;
    case "column-missing":
      return `${refusal.file} has lost its column ${refusal.column}`;
    case "file-missing":
      return `${refusal.file} is referenced by the catalog but missing`;
    case "file-empty":
      return `${refusal.file} is empty`;
    case "catalog-mismatch":
      return `${refusal.file}: the catalog says ${refusal.field} ${refusal.catalog}, the file has ${refusal.actual}`;
    case "photos-missing":
      return `${refusal.file}: ${refusal.photos.length} ${refusal.column} values point to no file of the snapshot (${refusal.photos.slice(0, LISTED_PHOTOS).join(", ")})`;
    case "photos-drop":
      return `${refusal.file}: ${refusal.candidate} ${refusal.column} values against ${refusal.current} in the current version, a drop of more than ${MAX_PHOTO_DROP_PERCENT} %`;
  }
}

export const readSnapshotCatalog = async (dir: string): Promise<SnapshotCatalog> =>
  parseCatalog(await readFile(`${dir}/${CATALOG_FILE}`, "utf8"));

type Records = readonly (readonly string[])[];

const readRecords = async (dir: string, file: SnapshotPath): Promise<Records> => parseDelimited(await readFile(`${dir}/${file}`, "utf8"), ",");

async function readIds(snapshot: Snapshot, file: SnapshotPath): Promise<Set<string>> {
  const records = await readRecords(snapshot.dir, file).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  return new Set(records.slice(1).flatMap((r) => r.slice(0, 1)));
}

const rowsOf = (catalog: SnapshotCatalog, file: SnapshotPath): number => catalog.get(file)?.rows ?? 0;

export async function countsOf(candidate: Snapshot, current: Snapshot | null, counted: CountedFiles): Promise<Counts> {
  const deputies = rowsOf(candidate.catalog, counted.deputies);
  const votes = rowsOf(candidate.catalog, counted.votes);
  if (current === null) return { deputies, votes, newVotes: null };
  const known = await readIds(current, counted.votes);
  const ids = await readIds(candidate, counted.votes);
  return { deputies, votes, newVotes: [...ids].filter((id) => !known.has(id)).length };
}

function countRefusals(candidate: Snapshot, current: Snapshot | null, counted: CountedFiles): Refusal[] {
  const deputies = rowsOf(candidate.catalog, counted.deputies);
  const votes = rowsOf(candidate.catalog, counted.votes);
  const refusals: Refusal[] = deputies < DEPUTY_FLOOR ? [{ guard: "deputies-below-floor", candidate: deputies }] : [];
  if (current === null) return refusals;
  const currentDeputies = rowsOf(current.catalog, counted.deputies);
  const currentVotes = rowsOf(current.catalog, counted.votes);
  if (deputies * 100 < currentDeputies * (100 - MAX_DEPUTY_DROP_PERCENT))
    refusals.push({ guard: "deputies-drop", current: currentDeputies, candidate: deputies });
  if (votes < currentVotes) refusals.push({ guard: "votes-drop", current: currentVotes, candidate: votes });
  return refusals;
}

function lostEntries(candidate: SnapshotCatalog, current: SnapshotCatalog): Refusal[] {
  return [...current.values()].flatMap((entry): Refusal[] => {
    const kept = candidate.get(entry.file);
    if (kept === undefined) return [{ guard: "entry-missing", file: entry.file }];
    if (entry.shape.kind !== "table") return [];
    const columns = new Set(kept.shape.kind === "table" ? kept.shape.columns.map((c) => c.name) : []);
    return entry.shape.columns.flatMap((c): Refusal[] => (columns.has(c.name) ? [] : [{ guard: "column-missing", file: entry.file, column: c.name }]));
  });
}

const isSnapshotFile = (value: string, sizes: ReadonlyMap<SnapshotPath, number>): boolean => {
  try {
    return sizes.has(snapshotPath(value));
  } catch {
    return false;
  }
};

function headers(entry: CatalogEntry, header: readonly string[]): { catalog: string; actual: string } {
  switch (entry.shape.kind) {
    case "table":
      return { catalog: [entry.key, ...entry.shape.columns.map((c) => c.name)].join(","), actual: header.join(",") };
    case "generated-columns":
      return { catalog: `${entry.key} and ${entry.shape.count} columns`, actual: `${header[0] ?? ""} and ${Math.max(0, header.length - 1)} columns` };
  }
}

async function csvRefusals(candidate: Candidate, entry: CatalogEntry): Promise<Refusal[]> {
  const records = await readRecords(candidate.dir, entry.file);
  const [header = [], ...rows] = records;
  const refusals: Refusal[] = [];
  if (rows.length !== entry.rows)
    refusals.push({ guard: "catalog-mismatch", file: entry.file, field: "rows", catalog: String(entry.rows), actual: String(rows.length) });
  const { catalog, actual } = headers(entry, header);
  if (catalog !== actual) refusals.push({ guard: "catalog-mismatch", file: entry.file, field: "header", catalog, actual });
  if (entry.shape.kind !== "table") return refusals;
  for (const column of entry.shape.columns.filter((c) => c.type === "image")) {
    const index = header.indexOf(column.name);
    const photos = rows.flatMap((r) => r.slice(index, index + 1)).filter((v) => v !== "" && !isSnapshotFile(v, candidate.sizes));
    if (photos.length > 0) refusals.push({ guard: "photos-missing", file: entry.file, column: column.name, photos });
  }
  return refusals;
}

async function geojsonRefusals(candidate: Candidate, entry: CatalogEntry): Promise<Refusal[]> {
  const features = list(fieldOf(parseJson(await readFile(`${candidate.dir}/${entry.file}`, "utf8")), "features"), `${entry.file} features`);
  return features.length === entry.rows
    ? []
    : [{ guard: "catalog-mismatch", file: entry.file, field: "rows", catalog: String(entry.rows), actual: String(features.length) }];
}

async function entryRefusals(candidate: Candidate, entry: CatalogEntry): Promise<Refusal[]> {
  const missing = entry.references.filter((r) => !candidate.sizes.has(r)).map((file): Refusal => ({ guard: "file-missing", file }));
  const size = candidate.sizes.get(entry.file);
  if (size === undefined) return [{ guard: "file-missing", file: entry.file }, ...missing];
  if (size !== entry.size)
    return [{ guard: "catalog-mismatch", file: entry.file, field: "size", catalog: String(entry.size), actual: String(size) }, ...missing];
  const content = entry.shape.kind === "table" && entry.shape.format === "geojson" ? geojsonRefusals(candidate, entry) : csvRefusals(candidate, entry);
  return [...(await content), ...missing];
}

async function filledValues(snapshot: Snapshot, file: SnapshotPath, column: string): Promise<number> {
  const records = await readRecords(snapshot.dir, file).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  const [header = [], ...rows] = records;
  const index = header.indexOf(column);
  return rows.filter((r) => (r[index] ?? "") !== "").length;
}

async function photoDrops(candidate: Snapshot, current: Snapshot): Promise<Refusal[]> {
  const refusals: Refusal[] = [];
  for (const entry of candidate.catalog.values()) {
    const before = current.catalog.get(entry.file);
    if (entry.shape.kind !== "table" || entry.shape.format !== "csv" || before?.shape.kind !== "table") continue;
    const kept = new Set(before.shape.columns.filter((c) => c.type === "image").map((c) => c.name));
    for (const column of entry.shape.columns.filter((c) => c.type === "image" && kept.has(c.name))) {
      const was = await filledValues(current, entry.file, column.name);
      const now = await filledValues(candidate, entry.file, column.name);
      if (now * 100 < was * (100 - MAX_PHOTO_DROP_PERCENT))
        refusals.push({ guard: "photos-drop", file: entry.file, column: column.name, current: was, candidate: now });
    }
  }
  return refusals;
}

export async function refusalsOf(candidate: Candidate, current: Snapshot | null, counted: CountedFiles): Promise<Refusal[]> {
  const empty = [...candidate.sizes].flatMap(([file, size]): Refusal[] => (size === 0 ? [{ guard: "file-empty", file }] : []));
  const coherence = (await Promise.all([...candidate.catalog.values()].map((e) => entryRefusals(candidate, e)))).flat();
  const losses = current === null ? [] : [...lostEntries(candidate.catalog, current.catalog), ...(await photoDrops(candidate, current))];
  return [...countRefusals(candidate, current, counted), ...losses, ...empty, ...coherence];
}
