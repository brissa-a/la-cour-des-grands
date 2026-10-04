import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { type Job, job } from "./job.ts";

export function source(definition: { nom: string; url: string; validiteHeures: number }): Job<Uint8Array> {
  const chemin = `cache/sources/${definition.nom}`;
  return job({
    nom: `source ${definition.nom}`,
    dependances: {},
    async calcul() {
      const age = await stat(chemin).then(
        (s) => Date.now() - s.mtimeMs,
        () => Infinity,
      );
      if (age < definition.validiteHeures * 3600_000) return new Uint8Array(await readFile(chemin));
      const reponse = await fetch(definition.url);
      if (!reponse.ok) throw new Error(`${definition.url} : HTTP ${reponse.status}`);
      const octets = new Uint8Array(await reponse.arrayBuffer());
      await mkdir("cache/sources", { recursive: true });
      await writeFile(chemin, octets);
      return octets;
    },
  });
}
