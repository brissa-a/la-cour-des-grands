import { randomUUID } from "node:crypto";
import { lstat, open, readdir, rename, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
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

export async function writeDurably(path: string, content: Uint8Array | string, mode = 0o644): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
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
