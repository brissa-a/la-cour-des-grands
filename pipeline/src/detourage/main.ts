import type { Depute } from "../depute.ts";
import { deputesDeLaLegislature } from "../sources/acteurs.ts";
import { type PhotoOfficielle, telechargerPhoto } from "./photos.ts";
import { MODELE, detourer } from "./rembg.ts";
import { chargerRegistre, enregistrerRegistre } from "./registre.ts";

const DOSSIER_IMAGES = "cache/detourage/images";
const TELECHARGEMENTS_SIMULTANES = 8;
const PHOTOS_PAR_LOT = 25;

type Candidat = Depute & PhotoOfficielle;

async function parLots<T, R>(elements: T[], taille: number, f: (e: T) => Promise<R>): Promise<R[]> {
  const resultats: R[] = [];
  for (let i = 0; i < elements.length; i += taille) {
    resultats.push(...(await Promise.all(elements.slice(i, i + taille).map(f))));
  }
  return resultats;
}

const deputes = await deputesDeLaLegislature();
const registre = await chargerRegistre();
console.log(`${deputes.length} députés dans la législature`);

const photos = await parLots(deputes, TELECHARGEMENTS_SIMULTANES, async (d) => {
  const photo = await telechargerPhoto(d.id);
  return photo === "absente" ? undefined : { ...d, ...photo };
});
const candidats = photos.filter((c): c is Candidat => c !== undefined);
console.log(`${candidats.length} photos officielles, ${deputes.length - candidats.length} absentes`);

const aJour = (c: Candidat) => {
  const detourage = registre.get(c.id);
  return detourage?.modele === MODELE && detourage.sha256Original === c.sha256;
};
const aFaire = candidats
  .filter((c) => !aJour(c))
  .sort((a, b) => Number(b.enExercice) - Number(a.enExercice));
console.log(`${aFaire.length} photos à détourer avec ${MODELE}`);

for (let i = 0; i < aFaire.length; i += PHOTOS_PAR_LOT) {
  const lot = aFaire.slice(i, i + PHOTOS_PAR_LOT);
  await detourer(
    lot.map((c) => c.chemin),
    DOSSIER_IMAGES,
  );
  const date = new Date().toISOString().slice(0, 10);
  lot.forEach((c) => registre.set(c.id, { modele: MODELE, date, sha256Original: c.sha256 }));
  await enregistrerRegistre(registre);
  console.log(`${Math.min(i + PHOTOS_PAR_LOT, aFaire.length)}/${aFaire.length}`);
}
