import { catalogue } from "./coeur/catalogue.ts";
import type { Job } from "./coeur/job.ts";
import { init } from "./jobs/init.ts";

const fichiers = [init];
const tout = catalogue(fichiers);

const jobs: Job<unknown>[] = [...fichiers, tout];
const demande = process.argv[2];
const cible = demande === undefined ? tout : jobs.find((j) => j.nom === demande);
if (cible === undefined) {
  console.error(`Job inconnu : ${demande}. Jobs disponibles : ${jobs.map((j) => j.nom).join(", ")}`);
  process.exit(1);
}
await cible.resultat();
