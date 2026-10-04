import { writeFile } from "node:fs/promises";
import { DOSSIER_SORTIE, type FichierPublie } from "./csv.ts";
import { type Job, job } from "./job.ts";
import { aujourdhui } from "./types.ts";

export function catalogue(fichiers: Job<FichierPublie>[]): Job<void> {
  return job({
    nom: "catalogue.json",
    dependances: Object.fromEntries(fichiers.map((f) => [f.nom, f])),
    async calcul(publies) {
      const contenu = { genere: aujourdhui(), fichiers: Object.values(publies) };
      await writeFile(`${DOSSIER_SORTIE}/catalogue.json`, JSON.stringify(contenu, null, 1) + "\n");
    },
  });
}
