import { strFromU8, unzipSync } from "fflate";
import type { HexColor } from "../core/values.ts";
import { entity } from "../core/entity.ts";
import { type JsonRecord, fieldOf, isRecord, oneOrMany, optionalText, parseJson, record, text } from "../core/json.ts";
import { job } from "../core/job.ts";
import { source } from "../core/source.ts";
import { type IsoDate, isoDate } from "../core/types.ts";
import { type ConstituencyCode, constituencyCode } from "./address/codes.ts";

const LEGISLATURE = "17";

export const actors = source({
  name: "acteurs-historique.zip",
  url: "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip",
  maxAgeHours: 24,
});

export type DeputyId = string & { readonly __brand: "DeputyId" };

export function deputyId(value: string): DeputyId {
  if (!/^PA\d+$/.test(value)) throw new Error(`Invalid deputy id: ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the format test above proves a deputy id
  return value as DeputyId;
}

export type SeatNumber = number & { readonly __brand: "SeatNumber" };

export function seatNumber(value: string): SeatNumber {
  if (!/^\d{1,4}$/.test(value)) throw new Error(`Invalid seat number: ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the format test above proves a seat number, read without its zero padding
  return Number(value) as SeatNumber;
}

export const REGIONS = [
  "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté",
  "Bretagne",
  "Centre-Val de Loire",
  "Corse",
  "Grand Est",
  "Hauts-de-France",
  "Ile-de-France",
  "Normandie",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur",
  "Guadeloupe",
  "Guyane",
  "Martinique",
  "Mayotte",
  "Réunion",
  "Nouvelle-Calédonie",
  "Polynésie française",
  "Saint-Barthélemy et Saint-Martin",
  "Saint-Pierre-et-Miquelon",
  "Wallis-et-Futuna",
  "Français établis hors de France",
] as const;
export type Region = (typeof REGIONS)[number];

function region(raw: string | null): Region {
  const found = REGIONS.find((r) => r === raw);
  if (found === undefined) throw new Error(`Unknown region: ${raw}`);
  return found;
}

export type Mandate = {
  start: IsoDate;
  end: IsoDate | null;
  endReason: string | null;
  constituency: ConstituencyCode;
  region: Region;
  department: string;
  departmentNumber: string;
  constituencyNumber: string;
  seat: SeatNumber | null;
};

export type Group = {
  name: string;
  shortName: string;
  color: HexColor | null;
};

export type Deputy = {
  id: DeputyId;
  civility: "M." | "Mme";
  lastName: string;
  firstName: string;
  birthDate: IsoDate | null;
  mandates: [Mandate, ...Mandate[]];
  group: Group | null;
};

export const inOffice = (d: Deputy) => d.mandates.some((m) => m.end === null);
export const inOfficeOn = (mandates: readonly Mandate[], date: IsoDate) =>
  mandates.some((m) => m.start <= date && (m.end === null || m.end >= date));

export function lastMandate(d: Deputy): Mandate {
  const [first, ...others] = d.mandates;
  return others.at(-1) ?? first;
}

const nonEmpty = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const optionalDate = (x: unknown): IsoDate | null => {
  const value = nonEmpty(x);
  return value === null ? null : isoDate(value);
};

const optionalSeat = (x: unknown): SeatNumber | null => {
  const value = nonEmpty(x);
  return value === null ? null : seatNumber(value);
};

function hexColor(raw: unknown): HexColor | null {
  const value = nonEmpty(raw);
  if (value === null) return null;
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid color: ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the one constructor of HexColor: the format test above proves a #rrggbb color
  return value as HexColor;
}

export function mandate(raw: JsonRecord): Mandate {
  const lieu = fieldOf(raw.election, "lieu");
  const place = isRecord(lieu) ? lieu : {};
  const departmentNumber = optionalText(place.numDepartement, "mandate numDepartement") ?? "";
  const constituencyNumber = optionalText(place.numCirco, "mandate numCirco") ?? "";
  // dateDebut is the election date, shared by the substitutes and by a mandate resumed after government.
  const tookOffice = nonEmpty(fieldOf(raw.mandature, "datePriseFonction"));
  if (tookOffice === null) throw new Error(`Mandate ${text(raw.uid, "mandate uid")} has no datePriseFonction`);
  return {
    start: isoDate(tookOffice),
    end: optionalDate(raw.dateFin),
    endReason: nonEmpty(fieldOf(raw.mandature, "causeFin")),
    constituency: constituencyCode(`${departmentNumber}-${constituencyNumber}`),
    region: region(optionalText(place.region, "mandate region")),
    department: optionalText(place.departement, "mandate departement") ?? "",
    departmentNumber,
    constituencyNumber,
    seat: optionalSeat(fieldOf(raw.mandature, "placeHemicycle")),
  };
}

function civility(raw: string): Deputy["civility"] {
  if (raw === "M." || raw === "Mme") return raw;
  throw new Error(`Unexpected civility: ${raw}`);
}

type GroupMandate = { group: Group; end: string };

function groupMandate(raw: JsonRecord, groups: ReadonlyMap<string, Group>): GroupMandate[] {
  if (raw.typeOrgane !== "GP") return [];
  const ref = record(raw.organes, "mandate organes").organeRef;
  const group = typeof ref === "string" ? groups.get(ref) : undefined;
  return group === undefined ? [] : [{ group, end: optionalText(raw.dateFin, "mandate dateFin") ?? "9999" }];
}

export const deputies = job({
  name: "deputies",
  dependencies: { actors },
  run({ actors }): Deputy[] {
    const files = unzipSync(actors, {
      filter: (f) => (f.name.includes("/acteur/") || f.name.includes("/organe/")) && f.name.endsWith(".json"),
    });
    const groups = new Map<string, Group>();
    const actorRecords: { name: string; actor: JsonRecord }[] = [];
    for (const [name, content] of Object.entries(files)) {
      const parsed = record(parseJson(strFromU8(content)), name);
      if (name.includes("/organe/")) {
        const organ = record(parsed.organe, `${name}: organe`);
        if (organ.codeType === "GP" && organ.legislature === LEGISLATURE) {
          groups.set(text(organ.uid, `${name}: uid`), {
            name: text(organ.libelle, `${name}: libelle`),
            shortName: text(organ.libelleAbrev, `${name}: libelleAbrev`),
            color: hexColor(organ.couleurAssociee),
          });
        }
      } else {
        actorRecords.push({ name, actor: record(parsed.acteur, `${name}: acteur`) });
      }
    }

    const result: Deputy[] = [];
    for (const { name, actor } of actorRecords) {
      const rawMandates = oneOrMany(fieldOf(actor.mandats, "mandat")).map((m) => record(m, `${name}: mandat`));
      const [first, ...others] = rawMandates
        .filter((m) => m.typeOrgane === "ASSEMBLEE" && m.legislature === LEGISLATURE)
        .map(mandate)
        .sort((a, b) => a.start.localeCompare(b.start));
      if (first === undefined) continue;
      const lastGroup = rawMandates
        .flatMap((m) => groupMandate(m, groups))
        .sort((a, b) => a.end.localeCompare(b.end))
        .at(-1);
      const etatCivil = record(actor.etatCivil, `${name}: etatCivil`);
      const ident = record(etatCivil.ident, `${name}: ident`);
      result.push({
        id: deputyId(text(record(actor.uid, `${name}: uid`)["#text"], `${name}: uid`)),
        civility: civility(text(ident.civ, `${name}: civ`)),
        lastName: text(ident.nom, `${name}: nom`),
        firstName: text(ident.prenom, `${name}: prenom`),
        birthDate: optionalDate(fieldOf(etatCivil.infoNaissance, "dateNais")),
        mandates: [first, ...others],
        group: lastGroup?.group ?? null,
      });
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  },
});

export const deputy = entity({
  name: "deputy",
  folder: "deputies",
  key: "deputy_id",
  rows: deputies,
  id: (d: Deputy) => d.id,
});
