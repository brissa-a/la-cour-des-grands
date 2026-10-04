import { strFromU8, unzipSync } from "fflate";
import { job } from "../core/job.ts";
import { source } from "../core/source.ts";
import { type IsoDate, isoDate } from "../core/types.ts";

const LEGISLATURE = "17";

export const actors = source({
  name: "acteurs-historique.zip",
  url: "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip",
  maxAgeHours: 24,
});

export type DeputyId = string & { readonly __brand: "DeputyId" };

export function deputyId(value: string): DeputyId {
  if (!/^PA\d+$/.test(value)) throw new Error(`Invalid deputy id: ${value}`);
  return value as DeputyId;
}

export type ConstituencyCode = string & { readonly __brand: "ConstituencyCode" };

export type Mandate = {
  start: IsoDate;
  end: IsoDate | null;
  endReason: string | null;
  constituency: ConstituencyCode;
  region: string;
  department: string;
  departmentNumber: string;
  constituencyNumber: string;
  seat: string | null;
};

export type Group = {
  name: string;
  shortName: string;
  color: string | null;
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
export const lastMandate = (d: Deputy) => d.mandates.at(-1)!;

type RawMandate = {
  typeOrgane: string;
  legislature?: string | null;
  dateDebut: string;
  dateFin?: string | null;
  organes: { organeRef: string };
  election?: { lieu?: { region?: string; departement?: string; numDepartement?: string; numCirco?: string } } | null;
  mandature?: { placeHemicycle?: string | null; causeFin?: string | null } | null;
};

type RawActor = {
  uid: { "#text": string };
  etatCivil: {
    ident: { civ: string; nom: string; prenom: string };
    infoNaissance?: { dateNais?: string | null } | null;
  };
  mandats?: { mandat: RawMandate | RawMandate[] } | null;
};

type RawOrgan = {
  uid: string;
  codeType: string;
  legislature?: string | null;
  libelle: string;
  libelleAbrev: string;
  couleurAssociee?: string | null;
};

const asList = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const nonEmpty = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const optionalDate = (x: unknown): IsoDate | null => {
  const value = nonEmpty(x);
  return value === null ? null : isoDate(value);
};

function mandate(raw: RawMandate): Mandate {
  const place = raw.election?.lieu ?? {};
  const departmentNumber = place.numDepartement ?? "";
  const constituencyNumber = place.numCirco ?? "";
  return {
    start: isoDate(raw.dateDebut),
    end: optionalDate(raw.dateFin),
    endReason: nonEmpty(raw.mandature?.causeFin),
    constituency: `${departmentNumber}-${constituencyNumber}` as ConstituencyCode,
    region: place.region ?? "",
    department: place.departement ?? "",
    departmentNumber,
    constituencyNumber,
    seat: nonEmpty(raw.mandature?.placeHemicycle),
  };
}

function civility(raw: string): Deputy["civility"] {
  if (raw === "M." || raw === "Mme") return raw;
  throw new Error(`Unexpected civility: ${raw}`);
}

export const deputies = job({
  name: "deputies",
  dependencies: { actors },
  run({ actors }): Deputy[] {
    const files = unzipSync(actors, {
      filter: (f) => (f.name.includes("/acteur/") || f.name.includes("/organe/")) && f.name.endsWith(".json"),
    });
    const groups = new Map<string, Group>();
    const rawActors: RawActor[] = [];
    for (const [name, content] of Object.entries(files)) {
      const parsed = JSON.parse(strFromU8(content));
      if (name.includes("/organe/")) {
        const organ = parsed.organe as RawOrgan;
        if (organ.codeType === "GP" && organ.legislature === LEGISLATURE) {
          groups.set(organ.uid, {
            name: organ.libelle,
            shortName: organ.libelleAbrev,
            color: nonEmpty(organ.couleurAssociee),
          });
        }
      } else {
        rawActors.push(parsed.acteur as RawActor);
      }
    }

    const result: Deputy[] = [];
    for (const actor of rawActors) {
      const rawMandates = asList(actor.mandats?.mandat);
      const [first, ...others] = rawMandates
        .filter((m) => m.typeOrgane === "ASSEMBLEE" && m.legislature === LEGISLATURE)
        .map(mandate)
        .sort((a, b) => a.start.localeCompare(b.start));
      if (first === undefined) continue;
      const lastGroupMandate = rawMandates
        .filter((m) => m.typeOrgane === "GP" && groups.has(m.organes.organeRef))
        .sort((a, b) => (a.dateFin ?? "9999").localeCompare(b.dateFin ?? "9999"))
        .at(-1);
      result.push({
        id: deputyId(actor.uid["#text"]),
        civility: civility(actor.etatCivil.ident.civ),
        lastName: actor.etatCivil.ident.nom,
        firstName: actor.etatCivil.ident.prenom,
        birthDate: optionalDate(actor.etatCivil.infoNaissance?.dateNais),
        mandates: [first, ...others],
        group: lastGroupMandate ? groups.get(lastGroupMandate.organes.organeRef)! : null,
      });
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  },
});
