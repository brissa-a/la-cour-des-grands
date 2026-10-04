import { csv } from "../coeur/csv.ts";
import { dernierMandat, enExercice } from "./deputes.ts";

export const init = csv({
  fichier: "init.csv",
  budgetCompresse: 50_000,
  dependances: {},
  features: {
    nom: { titre: "Nom", type: "texte" },
    prenom: { titre: "Prénom", type: "texte" },
    civilite: { titre: "Civilité", type: "categorie", valeurs: ["M.", "Mme"] },
    en_exercice: { titre: "En exercice", type: "categorie", valeurs: ["oui", "non"] },
    code_circo: { titre: "Circonscription", type: "position" },
    periodes_mandat: { titre: "Périodes de mandat", type: "liste" },
    groupe: { titre: "Groupe politique", type: "categorie" },
    groupe_abrege: { titre: "Groupe (sigle)", type: "categorie" },
  },
  ligne: (d) => ({
    nom: d.nom,
    prenom: d.prenom,
    civilite: d.civilite,
    en_exercice: enExercice(d) ? "oui" : "non",
    code_circo: dernierMandat(d).codeCirco,
    periodes_mandat: d.mandats.map((m) => `${m.debut}/${m.fin ?? ""}`),
    groupe: d.groupe?.libelle ?? null,
    groupe_abrege: d.groupe?.abrege ?? null,
  }),
  couleurs: (deputes) => {
    const groupes = deputes.flatMap((d) => (d.groupe?.couleur ? [d.groupe] : []));
    return {
      groupe: Object.fromEntries(groupes.map((g) => [g.libelle, g.couleur!])),
      groupe_abrege: Object.fromEntries(groupes.map((g) => [g.abrege, g.couleur!])),
    };
  },
});
