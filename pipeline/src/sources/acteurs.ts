import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { type Depute, deputeId } from "../depute.ts";

const URL_ACTEURS =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip";
const CHEMIN_CACHE = "cache/sources/acteurs-historique.zip";
const DUREE_VALIDITE_MS = 24 * 60 * 60 * 1000;
const LEGISLATURE = "17";

type MandatBrut = {
  typeOrgane?: string;
  legislature?: string | null;
  dateFin?: string | null;
};

type ActeurBrut = {
  acteur: {
    uid: { "#text": string };
    mandats?: { mandat: MandatBrut | MandatBrut[] } | null;
  };
};

async function zipActeurs(): Promise<Uint8Array> {
  const recent = await stat(CHEMIN_CACHE).then(
    (s) => Date.now() - s.mtimeMs < DUREE_VALIDITE_MS,
    () => false,
  );
  if (recent) return readFile(CHEMIN_CACHE);
  const reponse = await fetch(URL_ACTEURS);
  if (!reponse.ok) throw new Error(`Téléchargement des acteurs : HTTP ${reponse.status}`);
  const zip = new Uint8Array(await reponse.arrayBuffer());
  await mkdir(dirname(CHEMIN_CACHE), { recursive: true });
  await writeFile(CHEMIN_CACHE, zip);
  return zip;
}

export async function deputesDeLaLegislature(): Promise<Depute[]> {
  const fichiers = unzipSync(await zipActeurs(), {
    filter: (f) => f.name.includes("/acteur/") && f.name.endsWith(".json"),
  });
  const deputes: Depute[] = [];
  for (const contenu of Object.values(fichiers)) {
    const { acteur } = JSON.parse(strFromU8(contenu)) as ActeurBrut;
    const brut = acteur.mandats?.mandat ?? [];
    const mandats = (Array.isArray(brut) ? brut : [brut]).filter(
      (m) => m.typeOrgane === "ASSEMBLEE" && m.legislature === LEGISLATURE,
    );
    if (mandats.length === 0) continue;
    deputes.push({
      id: deputeId(acteur.uid["#text"]),
      enExercice: mandats.some((m) => !m.dateFin),
    });
  }
  return deputes;
}
