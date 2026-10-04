import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { DeputeId } from "../depute.ts";

export const DOSSIER_ORIGINAUX = "cache/detourage/originaux";

export type PhotoOfficielle = {
  chemin: string;
  sha256: string;
};

export function urlPhotoOfficielle(id: DeputeId): string {
  return `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/${id.slice(2)}.jpg`;
}

export async function telechargerPhoto(id: DeputeId): Promise<PhotoOfficielle | "absente"> {
  const reponse = await fetch(urlPhotoOfficielle(id));
  if (reponse.status === 404) return "absente";
  if (!reponse.ok) throw new Error(`Photo de ${id} : HTTP ${reponse.status}`);
  const octets = new Uint8Array(await reponse.arrayBuffer());
  const chemin = `${DOSSIER_ORIGINAUX}/${id}.jpg`;
  await mkdir(DOSSIER_ORIGINAUX, { recursive: true });
  await writeFile(chemin, octets);
  return { chemin, sha256: createHash("sha256").update(octets).digest("hex") };
}
