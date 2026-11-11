import { readFile, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { parseJson, record, text } from "../core/json.ts";
import { type CountedFiles, type Counts, type Refusal, type Snapshot, countsOf, readSnapshotCatalog, refusalsOf } from "./guards.ts";
import { discard, isMissing, makeDirectory, replaceAtomically } from "./files.ts";
import { type DataRoot, type SnapshotPath, layout } from "./paths.ts";
import { collectGarbage, readSnapshot, stage } from "./store.ts";
import { type DataVersion, dataVersion } from "./version.ts";

export const KEPT_VERSIONS = 10;
export const KEPT_REJECTED = 3;

type Layout = ReturnType<typeof layout>;

export type Current = { readonly version: DataVersion; readonly publishedAt: string };

export type Outcome =
  | {
      readonly status: "published";
      readonly version: DataVersion;
      readonly previous: DataVersion | null;
      readonly counts: Counts;
      readonly override: { readonly refusals: readonly Refusal[] } | null;
      readonly warning: string | null;
    }
  | { readonly status: "unchanged"; readonly version: DataVersion; readonly counts: Counts }
  | {
      readonly status: "rejected";
      readonly version: DataVersion;
      readonly previous: DataVersion | null;
      readonly counts: Counts;
      readonly refusals: readonly [Refusal, ...Refusal[]];
      readonly warning: string | null;
    };

export const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function isoInstant(value: string): string {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`Not an ISO 8601 UTC instant: ${value}`);
  return value;
}

export function parseCurrent(content: string, what: string): Current {
  const pointer = record(parseJson(content), what);
  return { version: dataVersion(text(pointer.version, `${what} version`)), publishedAt: isoInstant(text(pointer.publishedAt, `${what} publishedAt`)) };
}

export async function readCurrent(root: DataRoot): Promise<Current | null> {
  const path = layout(root).current;
  const content = await readFile(path, "utf8").catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  return content === null ? null : parseCurrent(content, path);
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

async function prune(dir: string, trash: string, keep: number, kept: ReadonlySet<string>): Promise<void> {
  const names = await newestFirst(dir);
  const removed = names.slice(keep).filter((name) => !kept.has(name));
  for (const name of removed) await discard(`${dir}/${name}`, trash);
}

export async function pruneVersions(root: DataRoot): Promise<void> {
  const paths = layout(root);
  await rm(paths.trash, { recursive: true, force: true });
  const current = await readCurrent(root);
  await prune(paths.v2, paths.trash, KEPT_VERSIONS, new Set(current === null ? [] : [current.version]));
  await prune(paths.rejected, paths.trash, KEPT_REJECTED, new Set());
  await collectGarbage(paths.store);
}

async function retention(root: DataRoot): Promise<string | null> {
  try {
    await pruneVersions(root);
    return null;
  } catch (error) {
    return `Old versions could not be pruned: ${reasonOf(error)}`;
  }
}

async function holdsVersion(dir: string, version: DataVersion): Promise<boolean> {
  try {
    return (await readSnapshot(dir)).version === version;
  } catch {
    return false;
  }
}

async function moveInto(dir: string, target: string, version: DataVersion, trash: string, now: Date): Promise<void> {
  if (await holdsVersion(target, version)) await rm(dir, { recursive: true, force: true });
  else {
    await discard(target, trash);
    await rename(dir, target);
  }
  await utimes(target, now, now);
}

async function point(root: DataRoot, dir: string, version: DataVersion, now: Date): Promise<string | null> {
  const paths = layout(root);
  await moveInto(dir, paths.version(version), version, paths.trash, now);
  await replaceAtomically(paths.current, JSON.stringify({ version, publishedAt: now.toISOString() }) + "\n");
  return retention(root);
}

async function setAside(root: DataRoot, dir: string, version: DataVersion, now: Date): Promise<string | null> {
  const paths = layout(root);
  await makeDirectory(paths.rejected);
  await moveInto(dir, paths.rejectedVersion(version), version, paths.trash, now);
  return retention(root);
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
      const warning = await setAside(root, staged.dir, staged.version, now());
      return { status: "rejected", version: staged.version, previous, counts, refusals: [refusal, ...refusals], warning };
    }
    const warning = await point(root, staged.dir, staged.version, now());
    return { status: "published", version: staged.version, previous, counts, override: null, warning };
  } finally {
    await rm(staged.dir, { recursive: true, force: true });
  }
}

export async function publishRejected(root: DataRoot, version: DataVersion, counted: CountedFiles, now: () => Date): Promise<Outcome> {
  const paths = layout(root);
  await rm(paths.staging, { recursive: true, force: true });
  const dir = paths.rejectedVersion(version);
  const read = await readSnapshot(dir);
  if (read.version !== version) throw new Error(`${dir} holds version ${read.version}, not ${version}`);
  const current = await readCurrent(root);
  const published = await currentSnapshot(paths, current);
  const candidate = { dir, sizes: read.sizes, catalog: await readSnapshotCatalog(dir) };
  const counts = await countsOf(candidate, published, counted);
  const refusals = await refusalsOf(candidate, published, counted);
  const warning = await point(root, dir, version, now());
  return { status: "published", version, previous: current?.version ?? null, counts, override: { refusals }, warning };
}
