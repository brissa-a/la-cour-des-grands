import { readFile, writeFile } from "node:fs/promises";
import type { DeputeId } from "../depute.ts";
import type { Modele } from "./rembg.ts";

export type Detourage = {
  modele: Modele;
  date: string;
  sha256Original: string;
};

export type Registre = Map<DeputeId, Detourage>;

const CHEMIN = "cache/detourage/registre.json";

export async function chargerRegistre(): Promise<Registre> {
  const texte = await readFile(CHEMIN, "utf8").catch(() => "{}");
  return new Map(Object.entries(JSON.parse(texte) as Record<DeputeId, Detourage>)) as Registre;
}

export async function enregistrerRegistre(registre: Registre): Promise<void> {
  const trie = Object.fromEntries([...registre].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(CHEMIN, JSON.stringify(trie, null, 1) + "\n");
}
