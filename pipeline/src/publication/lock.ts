import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { link, readFile, unlink } from "node:fs/promises";
import { fieldOf } from "../core/json.ts";
import { isMissing, makeDirectory, writeDurably } from "./files.ts";
import { type DataRoot, layout } from "./paths.ts";

export type LockOwner = { readonly pid: number; readonly host: string };

export type Lock = { readonly release: () => void };

export type Locking = { readonly kind: "acquired"; readonly lock: Lock } | { readonly kind: "held"; readonly path: string; readonly holder: string };

async function holderOf(path: string): Promise<string> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if (isMissing(error)) return "a run that has just finished";
    throw error;
  }
}

export async function acquireLock(root: DataRoot, owner: LockOwner, now: Date): Promise<Locking> {
  const paths = layout(root);
  await makeDirectory(paths.v2);
  const temporary = `${paths.v2}/.lock.${randomUUID()}.tmp`;
  await writeDurably(temporary, JSON.stringify({ ...owner, since: now.toISOString() }) + "\n");
  try {
    await link(temporary, paths.lock);
  } catch (error) {
    if (fieldOf(error, "code") !== "EEXIST") throw error;
    return { kind: "held", path: paths.lock, holder: await holderOf(paths.lock) };
  } finally {
    await unlink(temporary);
  }
  let held = true;
  return {
    kind: "acquired",
    lock: {
      release: () => {
        if (!held) return;
        held = false;
        unlinkSync(paths.lock);
      },
    },
  };
}
