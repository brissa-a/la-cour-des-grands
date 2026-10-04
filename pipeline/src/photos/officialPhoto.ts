import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import type { DeputyId } from "../jobs/deputies.ts";
import { ORIGINALS_DIR } from "./paths.ts";

const MAX_AGE_HOURS = 24;

export type OfficialPhoto = {
  path: string;
  sha256: string;
};

export function officialPhotoUrl(id: DeputyId): string {
  return `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/${id.slice(2)}.jpg`;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function officialPhoto(id: DeputyId): Promise<OfficialPhoto | "missing"> {
  const path = `${ORIGINALS_DIR}/${id}.jpg`;
  const age = await stat(path).then(
    (s) => Date.now() - s.mtimeMs,
    () => Infinity,
  );
  const previous = async () => ({ path, sha256: sha256(await readFile(path)) });
  if (age < MAX_AGE_HOURS * 3600_000) return previous();
  const response = await fetch(officialPhotoUrl(id));
  if (response.status === 404) return "missing";
  if (!response.ok) {
    const fallback = age === Infinity ? "treated as missing" : "keeping the previous original";
    console.warn(`  photo of ${id}: HTTP ${response.status}, ${fallback}`);
    return age === Infinity ? "missing" : previous();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(ORIGINALS_DIR, { recursive: true });
  await writeFile(path, bytes);
  return { path, sha256: sha256(bytes) };
}
