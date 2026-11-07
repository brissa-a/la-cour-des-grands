import { mkdir, readFile, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { parseJson, record, text } from "../core/json.ts";
import { type CountedFiles, type Counts, type Refusal, type Snapshot, countsOf, readSnapshotCatalog, refusalsOf } from "./guards.ts";
import { exists, isMissing, replaceAtomically } from "./files.ts";
import { type DataRoot, type SnapshotPath, layout } from "./paths.ts";
import { collectGarbage, readSnapshot, stage } from "./store.ts";
import { type DataVersion, dataVersion } from "./version.ts";

export const KEPT_VERSIONS = 10;
export const KEPT_REJECTED = 3;

type Layout = ReturnType<typeof layout>;

export type Current = { readonly version: DataVersion; readonly publishedAt: string };

export type Outcome =
  | { readonly status: "published"; readonly version: DataVersion; readonly previous: DataVersion | null; readonly counts: Counts; readonly override: { readonly refusals: readonly Refusal[] } | null }
  | { readonly status: "unchanged"; readonly version: DataVersion; readonly counts: Counts }
  | {
      readonly status: "rejected";
      readonly version: DataVersion;
      readonly previous: DataVersion | null;
      readonly counts: Counts;
      readonly refusals: readonly [Refusal, ...Refusal[]];
    };

function isoInstant(value: string): string {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`Not an ISO 8601 UTC instant: ${value}`);
  return value;
}

export async function readCurrent(root: DataRoot): Promise<Current | null> {
  const path = layout(root).current;
  const content = await readFile(path, "utf8").catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (content === null) return null;
  const pointer = record(parseJson(content), path);
  return { version: dataVersion(text(pointer.version, `${path} version`)), publishedAt: isoInstant(text(pointer.publishedAt, `${path} publishedAt`)) };
}

async function currentSnapshot(paths: Layout, current: Current | null): Promise<Snapshot | null> {
  if (current === null) return null;
  const dir = paths.version(current.version);
  return { dir, catalog: await readSnapshotCatalog(dir) };
}

const VERSION_NAME = /^[0-9a-f]{40}$/;

async function newestFirst(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  const dated = await Promise.all(
    entries.filter((e) => e.isDirectory() && VERSION_NAME.test(e.name)).map(async (e) => ({ name: e.name, time: (await stat(`${dir}/${e.name}`)).mtimeMs })),
  );
  return dated.sort((a, b) => b.time - a.time).map((d) => d.name);
}

async function prune(dir: string, keep: number, kept: ReadonlySet<string>): Promise<void> {
  const names = await newestFirst(dir);
  const removed = names.slice(keep).filter((name) => !kept.has(name));
  for (const name of removed) await rm(`${dir}/${name}`, { recursive: true, force: true });
}

export async function pruneVersions(root: DataRoot): Promise<void> {
  const paths = layout(root);
  const current = await readCurrent(root);
  await prune(paths.v2, KEPT_VERSIONS, new Set(current === null ? [] : [current.version]));
  await prune(paths.rejected, KEPT_REJECTED, new Set());
  await collectGarbage(paths.store);
}

async function moveInto(dir: string, target: string, now: Date): Promise<void> {
  if (await exists(target)) await rm(dir, { recursive: true, force: true });
  else await rename(dir, target);
  await utimes(target, now, now);
}

async function point(root: DataRoot, dir: string, version: DataVersion, now: Date): Promise<void> {
  const paths = layout(root);
  await moveInto(dir, paths.version(version), now);
  await replaceAtomically(paths.current, JSON.stringify({ version, publishedAt: now.toISOString() }) + "\n");
  await pruneVersions(root);
}

async function setAside(root: DataRoot, dir: string, version: DataVersion, now: Date): Promise<void> {
  const paths = layout(root);
  await mkdir(paths.rejected, { recursive: true });
  const target = `${paths.rejected}/${version}`;
  await rm(target, { recursive: true, force: true });
  await moveInto(dir, target, now);
  await pruneVersions(root);
}

export type Publication = {
  readonly root: DataRoot;
  readonly sources: ReadonlyMap<SnapshotPath, string>;
  readonly counted: CountedFiles;
  readonly now: () => Date;
};

export async function publish({ root, sources, counted, now }: Publication): Promise<Outcome> {
  const paths = layout(root);
  await rm(paths.staging, { recursive: true, force: true });
  const current = await readCurrent(root);
  const previous = current?.version ?? null;
  const published = await currentSnapshot(paths, current);
  const staged = await stage(paths, sources);
  try {
    const candidate = { dir: staged.dir, sizes: staged.sizes, catalog: await readSnapshotCatalog(staged.dir) };
    const counts = await countsOf(candidate, published, counted);
    if (staged.version === previous) return { status: "unchanged", version: staged.version, counts };
    const [refusal, ...refusals] = await refusalsOf(candidate, published, counted);
    if (refusal !== undefined) {
      await setAside(root, staged.dir, staged.version, now());
      return { status: "rejected", version: staged.version, previous, counts, refusals: [refusal, ...refusals] };
    }
    await point(root, staged.dir, staged.version, now());
    return { status: "published", version: staged.version, previous, counts, override: null };
  } finally {
    await rm(staged.dir, { recursive: true, force: true });
  }
}

export async function publishRejected(root: DataRoot, version: DataVersion, counted: CountedFiles, now: () => Date): Promise<Outcome> {
  const paths = layout(root);
  const dir = `${paths.rejected}/${version}`;
  const read = await readSnapshot(dir);
  if (read.version !== version) throw new Error(`${dir} holds version ${read.version}, not ${version}`);
  const current = await readCurrent(root);
  const published = await currentSnapshot(paths, current);
  const candidate = { dir, sizes: read.sizes, catalog: await readSnapshotCatalog(dir) };
  const counts = await countsOf(candidate, published, counted);
  const refusals = await refusalsOf(candidate, published, counted);
  await point(root, dir, version, now());
  return { status: "published", version, previous: current?.version ?? null, counts, override: { refusals } };
}
