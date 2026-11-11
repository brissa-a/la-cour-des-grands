import { randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdtemp, readFile, readdir, rename, rm, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { DIRECTORY_MODE, STORED_FILE_MODE, exists, filesUnder, isMissing, makeDirectory, writeDurably } from "./files.ts";
import { type SnapshotPath, snapshotPath } from "./paths.ts";
import { type DataVersion, type ManifestLine, type Sha256, sha256Of, versionOf } from "./version.ts";

export type StagedSnapshot = {
  readonly dir: string;
  readonly version: DataVersion;
  readonly sizes: ReadonlyMap<SnapshotPath, number>;
};

async function keep(store: string, sha256: Sha256, content: Uint8Array): Promise<string> {
  const stored = `${store}/${sha256}`;
  if (await exists(stored)) return stored;
  const temporary = `${store}/.${randomUUID()}.tmp`;
  await writeDurably(temporary, content, STORED_FILE_MODE);
  await rename(temporary, stored);
  return stored;
}

const readUnlessMissing = (path: string): Promise<Buffer | null> =>
  readFile(path).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });

export async function stage(paths: { staging: string; store: string }, sources: ReadonlyMap<SnapshotPath, string>): Promise<StagedSnapshot> {
  await makeDirectory(paths.staging);
  await makeDirectory(paths.store);
  const dir = await mkdtemp(`${paths.staging}/`);
  try {
    await chmod(dir, DIRECTORY_MODE);
    const lines: ManifestLine[] = [];
    const sizes = new Map<SnapshotPath, number>();
    for (const [path, source] of sources) {
      const content = await readUnlessMissing(source);
      if (content === null) continue;
      const sha256 = sha256Of(content);
      await makeDirectory(dirname(`${dir}/${path}`));
      await link(await keep(paths.store, sha256, content), `${dir}/${path}`);
      lines.push({ path, sha256 });
      sizes.set(path, content.length);
    }
    return { dir, version: versionOf(lines), sizes };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function readSnapshot(dir: string): Promise<Omit<StagedSnapshot, "dir">> {
  const lines: ManifestLine[] = [];
  const sizes = new Map<SnapshotPath, number>();
  for (const file of await filesUnder(dir)) {
    const path = snapshotPath(file);
    const content = await readFile(`${dir}/${path}`);
    lines.push({ path, sha256: sha256Of(content) });
    sizes.set(path, content.length);
  }
  return { version: versionOf(lines), sizes };
}

export async function collectGarbage(store: string): Promise<void> {
  const names = await readdir(store).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  for (const name of names) {
    const path = `${store}/${name}`;
    if ((await lstat(path)).nlink === 1) await unlink(path);
  }
}
