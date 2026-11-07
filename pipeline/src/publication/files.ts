import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { fieldOf } from "../core/json.ts";

export const isMissing = (error: unknown): boolean => fieldOf(error, "code") === "ENOENT";

export const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    (error: unknown) => {
      if (isMissing(error)) return false;
      throw error;
    },
  );

export async function syncDirectory(dir: string): Promise<void> {
  const handle = await open(dir, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export const DIRECTORY_MODE = 0o755;
export const FILE_MODE = 0o644;
export const STORED_FILE_MODE = 0o444;

// The server reads the data root as another user: modes are set explicitly, whatever the process umask.
export async function makeDirectory(path: string): Promise<void> {
  const first = await mkdir(path, { recursive: true });
  if (first === undefined) return;
  let dir = first;
  await chmod(dir, DIRECTORY_MODE);
  for (const segment of relative(first, path).split(sep)) {
    dir = join(dir, segment);
    await chmod(dir, DIRECTORY_MODE);
  }
}

export async function writeDurably(path: string, content: Uint8Array | string, mode = FILE_MODE): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.chmod(mode);
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function replaceAtomically(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  const temporary = join(dir, `.${basename(path)}.${randomUUID()}.tmp`);
  await writeDurably(temporary, content);
  await rename(temporary, path);
  await syncDirectory(dir);
}

export async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    const info = await lstat(path);
    if (info.isFile()) files.push(relative(dir, path));
    else if (!info.isDirectory()) throw new Error(`${path} is neither a file nor a directory`);
  }
  return files;
}

export async function discard(path: string, trash: string): Promise<void> {
  await makeDirectory(trash);
  const moved = `${trash}/${randomUUID()}`;
  try {
    await rename(path, moved);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  await rm(moved, { recursive: true, force: true });
}
