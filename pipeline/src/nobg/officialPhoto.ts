import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { DeputyId } from "../jobs/deputies.ts";

const ORIGINALS_DIR = "cache/nobg/originals";

export type OfficialPhoto = {
  path: string;
  sha256: string;
};

export function officialPhotoUrl(id: DeputyId): string {
  return `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/${id.slice(2)}.jpg`;
}

export async function downloadOfficialPhoto(id: DeputyId): Promise<OfficialPhoto | "missing"> {
  const response = await fetch(officialPhotoUrl(id));
  if (response.status === 404) return "missing";
  if (!response.ok) throw new Error(`Photo of ${id}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = `${ORIGINALS_DIR}/${id}.jpg`;
  await mkdir(ORIGINALS_DIR, { recursive: true });
  await writeFile(path, bytes);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
}
