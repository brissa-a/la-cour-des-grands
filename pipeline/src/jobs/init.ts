import { csv } from "../core/csv.ts";
import { type IsoDate, today } from "../core/types.ts";
import { deputy, inOffice, lastMandate } from "./deputies.ts";

function ageOn(birthDate: IsoDate, date: IsoDate): number {
  const years = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

export const init = csv({
  entity: deputy,
  file: "init.csv",
  gzipBudget: 50_000,
  dependencies: {},
  features: {
    last_name: { title: "Nom", type: "text" },
    first_name: { title: "Prénom", type: "text" },
    civility: { title: "Civilité", type: "category", values: ["M.", "Mme"] },
    birth_date: { title: "Date de naissance", type: "date" },
    age: { title: "Âge", type: "number" },
    in_office: { title: "En exercice", type: "category", values: ["yes", "no"] },
    constituency: { title: "Circonscription", type: "reference", entity: "constituency" },
    region: { title: "Région", type: "category" },
    department: { title: "Département", type: "text" },
    department_number: { title: "N° de département", type: "code" },
    constituency_number: { title: "N° de circonscription", type: "code" },
    mandate_periods: { title: "Périodes de mandat", type: "list" },
    group: { title: "Groupe politique", type: "category" },
    group_short: { title: "Groupe (sigle)", type: "category" },
  },
  row: (d) => ({
    last_name: d.lastName,
    first_name: d.firstName,
    civility: d.civility,
    birth_date: d.birthDate,
    age: d.birthDate && ageOn(d.birthDate, today()),
    in_office: inOffice(d) ? "yes" : "no",
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
    const groups = deputies.flatMap((d) => (d.group?.color ? [d.group] : []));
    return {
      group: Object.fromEntries(groups.map((g) => [g.name, g.color!])),
      group_short: Object.fromEntries(groups.map((g) => [g.shortName, g.color!])),
    };
  },
});
