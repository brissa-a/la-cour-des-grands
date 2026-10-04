import { yesNo, yesNoCategory } from "../core/categories.ts";
import { type Colors, category, csv, dynamicCategory } from "../core/csv.ts";
import { type IsoDate, today } from "../core/types.ts";
import { REGIONS, deputy, inOffice, lastMandate } from "./deputies.ts";
import { PHOTOS_BASE_URL, photos } from "./photos.ts";

function ageOn(birthDate: IsoDate, date: IsoDate): number {
  const years = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

const REGION_COLORS = {
  "Auvergne-Rhône-Alpes": "#1f77b4",
  "Bourgogne-Franche-Comté": "#8c564b",
  Bretagne: "#2ca02c",
  "Centre-Val de Loire": "#bcbd22",
  Corse: "#9467bd",
  "Grand Est": "#ff7f0e",
  "Hauts-de-France": "#d62728",
  "Ile-de-France": "#e377c2",
  Normandie: "#17becf",
  "Nouvelle-Aquitaine": "#aec7e8",
  Occitanie: "#ffbb78",
  "Pays de la Loire": "#98df8a",
  "Provence-Alpes-Côte d'Azur": "#c5b0d5",
  Guadeloupe: "#00796b",
  Guyane: "#00897b",
  Martinique: "#009688",
  Mayotte: "#26a69a",
  Réunion: "#4db6ac",
  "Nouvelle-Calédonie": "#0277bd",
  "Polynésie française": "#0288d1",
  "Saint-Barthélemy et Saint-Martin": "#80cbc4",
  "Saint-Pierre-et-Miquelon": "#4fc3f7",
  "Wallis-et-Futuna": "#29b6f6",
  "Français établis hors de France": "#757575",
} as const;

export const init = csv({
  entity: deputy,
  file: "init.csv",
  gzipBudget: 50_000,
  dependencies: { photos },
  features: {
    photo: { title: "Photo", type: "image" },
    last_name: { title: "Nom", type: "text" },
    first_name: { title: "Prénom", type: "text" },
    civility: category("Civilité", ["M.", "Mme"], { "M.": "#4a86a8", Mme: "#b0549a" }),
    birth_date: { title: "Date de naissance", type: "date" },
    age: { title: "Âge", type: "number", gradient: ["#fde0c5", "#7a2e0e"] },
    in_office: yesNoCategory("En exercice"),
    constituency: { title: "Circonscription", type: "code" },
    region: category("Région", REGIONS, REGION_COLORS),
    department: { title: "Département", type: "text" },
    department_number: { title: "N° de département", type: "code" },
    constituency_number: { title: "N° de circonscription", type: "code" },
    mandate_periods: { title: "Périodes de mandat", type: "list" },
    group: dynamicCategory("Groupe politique"),
    group_short: dynamicCategory("Groupe (sigle)"),
  },
  row: (d, { photos }) => ({
    photo: photos.has(d.id) ? `${PHOTOS_BASE_URL}/${d.id}.webp` : null,
    last_name: d.lastName,
    first_name: d.firstName,
    civility: d.civility,
    birth_date: d.birthDate,
    age: d.birthDate && ageOn(d.birthDate, today()),
    in_office: yesNo(inOffice(d)),
    constituency: lastMandate(d).constituency,
    region: lastMandate(d).region,
    department: lastMandate(d).department,
    department_number: lastMandate(d).departmentNumber,
    constituency_number: lastMandate(d).constituencyNumber,
    mandate_periods: d.mandates.map((m) => `${m.start}/${m.end ?? ""}`),
    group: d.group?.name ?? null,
    group_short: d.group?.shortName ?? null,
  }),
  colors: (deputies) => {
    const groups = deputies.flatMap((d) => (d.group?.color ? [{ ...d.group, color: d.group.color }] : []));
    return {
      group: Object.fromEntries(groups.map((g) => [g.name, g.color])) as Colors,
      group_short: Object.fromEntries(groups.map((g) => [g.shortName, g.color])) as Colors,
    };
  },
});
