import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

export const MODELE = "bria-rmbg";
export type Modele = typeof MODELE;

const REMBG = ".venv-rembg/bin/rembg";

export async function detourer(photos: string[], dossierSortie: string): Promise<void> {
  const travail = await mkdtemp(join(tmpdir(), "lcdg-rembg-"));
  const entree = join(travail, "entree");
  const sortie = join(travail, "sortie");
  await mkdir(entree);
  await mkdir(sortie);
  await Promise.all(photos.map((p) => copyFile(p, join(entree, basename(p)))));
  await promisify(execFile)(REMBG, ["p", "-m", MODELE, entree, sortie], {
    env: { ...process.env, U2NET_HOME: resolve("cache/modeles") },
    maxBuffer: 64 * 1024 * 1024,
  });
  await mkdir(dossierSortie, { recursive: true });
  const produits = await readdir(sortie);
  await Promise.all(produits.map((f) => rename(join(sortie, f), join(dossierSortie, f))));
  await rm(travail, { recursive: true });
}
