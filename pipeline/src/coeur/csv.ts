import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { deputes, type DeputeLegislature } from "../jobs/deputes.ts";
import { type Dependances, type Job, type Resultats, job, resoudre } from "./job.ts";
import type { DateIso } from "./types.ts";

type FeatureSimple = {
  titre: string;
  type: "texte" | "nombre" | "date" | "code" | "liste" | "lien" | "image" | "position";
};

type FeatureCategorie = {
  titre: string;
  type: "categorie";
  valeurs?: readonly string[];
};

export type Feature = FeatureSimple | FeatureCategorie;
export type Features = Record<string, Feature>;

type Valeur<F extends Feature> = F extends { type: "categorie"; valeurs: readonly (infer V)[] }
  ? V
  : F extends { type: "nombre" }
    ? number
    : F extends { type: "liste" }
      ? readonly string[]
      : F extends { type: "date" }
        ? DateIso
        : string;

export type Ligne<F extends Features> = { [K in keyof F]: Valeur<F[K]> | null };

export type Couleurs = Record<string, string>;

export type FichierPublie = {
  fichier: string;
  lignes: number;
  taille: number;
  tailleCompressee: number;
  features: (Feature & { colonne: string; couleurs?: Couleurs })[];
};

export const DOSSIER_SORTIE = "sortie/v2";

function cellule(valeur: string | number | readonly string[] | null): string {
  if (valeur === null) return "";
  if (typeof valeur === "number") return String(valeur);
  if (typeof valeur !== "string") {
    const fautive = valeur.find((v) => v.includes("|"));
    if (fautive !== undefined) throw new Error(`Valeur de liste contenant « | » : ${fautive}`);
    return cellule(valeur.join("|"));
  }
  return /[",\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur;
}

export function csv<const D extends Dependances, const F extends Features>(definition: {
  fichier: string;
  dependances: D;
  features: F;
  ligne: (depute: DeputeLegislature, resultats: Resultats<D>) => Ligne<F>;
  couleurs?: (deputes: DeputeLegislature[], resultats: Resultats<D>) => Partial<Record<keyof F, Couleurs>>;
  budgetCompresse?: number;
}): Job<FichierPublie> {
  return job({
    nom: definition.fichier,
    dependances: { deputes },
    async calcul({ deputes }) {
      const resultats = await resoudre(definition.dependances);
      const colonnes = Object.keys(definition.features) as (keyof F & string)[];
      const lignes = deputes.map((d) => {
        const ligne = definition.ligne(d, resultats);
        return [d.id, ...colonnes.map((c) => cellule(ligne[c]))].join(",");
      });
      const contenu = new TextEncoder().encode([["depute_id", ...colonnes].join(","), ...lignes].join("\n") + "\n");
      const tailleCompressee = gzipSync(contenu).length;
      if (definition.budgetCompresse !== undefined && tailleCompressee > definition.budgetCompresse) {
        throw new Error(`${definition.fichier} dépasse son budget : ${tailleCompressee} > ${definition.budgetCompresse} octets compressés`);
      }
      await mkdir(DOSSIER_SORTIE, { recursive: true });
      await writeFile(`${DOSSIER_SORTIE}/${definition.fichier}`, contenu);
      const couleurs: Partial<Record<keyof F, Couleurs>> = definition.couleurs?.(deputes, resultats) ?? {};
      return {
        fichier: definition.fichier,
        lignes: lignes.length,
        taille: contenu.length,
        tailleCompressee,
        features: colonnes.map((colonne) => {
          const couleursColonne = couleurs[colonne];
          return {
            ...(definition.features[colonne] as Feature),
            colonne,
            ...(couleursColonne ? { couleurs: couleursColonne } : {}),
          };
        }),
      };
    },
  });
}
