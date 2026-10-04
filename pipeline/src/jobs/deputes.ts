import { strFromU8, unzipSync } from "fflate";
import { job } from "../coeur/job.ts";
import { source } from "../coeur/source.ts";
import { type DateIso, dateIso } from "../coeur/types.ts";
import { type DeputeId, deputeId } from "../depute.ts";

const LEGISLATURE = "17";

export const acteurs = source({
  nom: "acteurs-historique.zip",
  url: "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip",
  validiteHeures: 24,
});

export type CodeCirco = string & { readonly __brand: "CodeCirco" };

export type Mandat = {
  debut: DateIso;
  fin: DateIso | null;
  causeFin: string | null;
  codeCirco: CodeCirco;
  region: string;
  departement: string;
  numDepartement: string;
  numCirco: string;
  placeHemicycle: string | null;
};

export type Groupe = {
  libelle: string;
  abrege: string;
  couleur: string | null;
};

export type DeputeLegislature = {
  id: DeputeId;
  civilite: "M." | "Mme";
  nom: string;
  prenom: string;
  dateNaissance: DateIso | null;
  mandats: [Mandat, ...Mandat[]];
  groupe: Groupe | null;
};

export const enExercice = (d: DeputeLegislature) => d.mandats.some((m) => m.fin === null);
export const dernierMandat = (d: DeputeLegislature) => d.mandats.at(-1)!;

type MandatBrut = {
  typeOrgane: string;
  legislature?: string | null;
  dateDebut: string;
  dateFin?: string | null;
  organes: { organeRef: string };
  election?: { lieu?: { region?: string; departement?: string; numDepartement?: string; numCirco?: string } } | null;
  mandature?: { placeHemicycle?: string | null; causeFin?: string | null } | null;
};

type ActeurBrut = {
  uid: { "#text": string };
  etatCivil: {
    ident: { civ: string; nom: string; prenom: string };
    infoNaissance?: { dateNais?: string | null } | null;
  };
  mandats?: { mandat: MandatBrut | MandatBrut[] } | null;
};

type OrganeBrut = {
  uid: string;
  codeType: string;
  legislature?: string | null;
  libelle: string;
  libelleAbrev: string;
  couleurAssociee?: string | null;
};

const enListe = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const texte = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);

function mandat(brut: MandatBrut): Mandat {
  const lieu = brut.election?.lieu ?? {};
  const numDepartement = lieu.numDepartement ?? "";
  const numCirco = lieu.numCirco ?? "";
  return {
    debut: dateIso(brut.dateDebut),
    fin: texte(brut.dateFin) === null ? null : dateIso(brut.dateFin!),
    causeFin: texte(brut.mandature?.causeFin),
    codeCirco: `${numDepartement}-${numCirco}` as CodeCirco,
    region: lieu.region ?? "",
    departement: lieu.departement ?? "",
    numDepartement,
    numCirco,
    placeHemicycle: texte(brut.mandature?.placeHemicycle),
  };
}

function civilite(civ: string): DeputeLegislature["civilite"] {
  if (civ === "M." || civ === "Mme") return civ;
  throw new Error(`Civilité inattendue : ${civ}`);
}

export const deputes = job({
  nom: "deputes",
  dependances: { acteurs },
  calcul({ acteurs }): DeputeLegislature[] {
    const fichiers = unzipSync(acteurs, {
      filter: (f) => (f.name.includes("/acteur/") || f.name.includes("/organe/")) && f.name.endsWith(".json"),
    });
    const groupes = new Map<string, Groupe>();
    const acteursBruts: ActeurBrut[] = [];
    for (const [nom, contenu] of Object.entries(fichiers)) {
      const json = JSON.parse(strFromU8(contenu));
      if (nom.includes("/organe/")) {
        const o = json.organe as OrganeBrut;
        if (o.codeType === "GP" && o.legislature === LEGISLATURE) {
          groupes.set(o.uid, { libelle: o.libelle, abrege: o.libelleAbrev, couleur: texte(o.couleurAssociee) });
        }
      } else {
        acteursBruts.push(json.acteur as ActeurBrut);
      }
    }

    const resultat: DeputeLegislature[] = [];
    for (const a of acteursBruts) {
      const mandatsBruts = enListe(a.mandats?.mandat);
      const mandats = mandatsBruts
        .filter((m) => m.typeOrgane === "ASSEMBLEE" && m.legislature === LEGISLATURE)
        .map(mandat)
        .sort((x, y) => x.debut.localeCompare(y.debut));
      const [premier, ...autres] = mandats;
      if (premier === undefined) continue;
      const mandatsGroupe = mandatsBruts
        .filter((m) => m.typeOrgane === "GP" && groupes.has(m.organes.organeRef))
        .sort((x, y) => (x.dateFin ?? "9999").localeCompare(y.dateFin ?? "9999"));
      const groupeActuel = mandatsGroupe.at(-1);
      resultat.push({
        id: deputeId(a.uid["#text"]),
        civilite: civilite(a.etatCivil.ident.civ),
        nom: a.etatCivil.ident.nom,
        prenom: a.etatCivil.ident.prenom,
        dateNaissance: texte(a.etatCivil.infoNaissance?.dateNais) === null ? null : dateIso(a.etatCivil.infoNaissance!.dateNais!),
        mandats: [premier, ...autres],
        groupe: groupeActuel ? groupes.get(groupeActuel.organes.organeRef)! : null,
      });
    }
    return resultat.sort((x, y) => x.id.localeCompare(y.id));
  },
});
