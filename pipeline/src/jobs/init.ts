import { yesNo, yesNoValues } from "../core/categories.ts";
import { category, csv } from "../core/csv.ts";
import { type IsoDate, today } from "../core/types.ts";
import { fixedValues, valueTable } from "../core/values.ts";
import { type DeputyId, type Group, REGIONS, deputies, deputy, inOffice, lastMandate } from "./deputies.ts";
import { seats } from "./hemicycle.ts";
import { PHOTOS_BASE_URL, photos } from "./photos.ts";

function ageOn(birthDate: IsoDate, date: IsoDate): number {
  const years = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

const values = (column: string) => `${deputy.folder}/values/${column}.csv`;

const civilities = fixedValues(values("civility"), [
  { value: "M.", label_fr: "M." },
  { value: "Mme", label_fr: "Mme" },
]);

const regions = fixedValues(
  values("region"),
  REGIONS.map((r) => ({ value: r, label_fr: r })),
);

const groups = valueTable({
  path: values("group"),
  dependencies: { deputies, seats },
  rows: ({ deputies, seats }) => {
    const xByDeputy = new Map<DeputyId, number>(seats.flatMap((s) => (s.deputy ? [[s.deputy, s.x]] : [])));
    const byName = new Map<string, { group: Group; xs: number[] }>();
    for (const d of deputies) {
      if (d.group === null) continue;
      const entry = byName.get(d.group.name) ?? { group: d.group, xs: [] };
      const x = xByDeputy.get(d.id);
      if (x !== undefined) entry.xs.push(x);
      byName.set(d.group.name, entry);
    }
    const meanX = (xs: number[]) => (xs.length === 0 ? Infinity : xs.reduce((a, b) => a + b, 0) / xs.length);
    return [...byName.values()]
      .sort((a, b) => meanX(a.xs) - meanX(b.xs) || a.group.name.localeCompare(b.group.name))
      .map(({ group }) => ({
        value: group.name,
        label_fr: group.name,
        short_fr: group.shortName,
        ...(group.color ? { color: group.color } : {}),
      }));
  },
});

export const init = csv({
  entity: deputy,
  file: "init.csv",
  gzipBudget: 50_000,
  dependencies: { photos },
  features: {
    photo: { title: "Photo", type: "image" },
    last_name: { title: "Nom", type: "text" },
    first_name: { title: "Prénom", type: "text" },
    civility: category("Civilité", civilities),
    birth_date: { title: "Date de naissance", type: "date" },
    age: { title: "Âge", type: "number" },
    in_office: category("En exercice", yesNoValues(deputy.folder)),
    constituency: { title: "Circonscription", type: "code" },
    region: category("Région", regions),
    department: { title: "Département", type: "text" },
    department_number: { title: "N° de département", type: "code" },
    constituency_number: { title: "N° de circonscription", type: "code" },
    mandate_periods: { title: "Périodes de mandat", type: "list" },
    group: category("Groupe politique", groups),
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
  }),
});
