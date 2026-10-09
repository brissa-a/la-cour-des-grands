import { readFile } from "node:fs/promises";
import { readTable } from "../../core/delimited.ts";
import { job } from "../../core/job.ts";
import { type ConstituencyCode, deputies, lastMandate } from "../deputies.ts";
import { type CommuneCode, communeCode, sortedConstituencies } from "./codes.ts";
import { WHOLE_CITY_CODES, pollingStations } from "./stations.ts";
import { cogCommunes, cogEvents } from "./sources.ts";

export type AtLeastTwo<T> = readonly [T, T, ...T[]];

export type CommuneConstituencies = {
  code: CommuneCode;
  constituencies: readonly [ConstituencyCode, ...ConstituencyCode[]];
};

export type SplitUnit = {
  code: CommuneCode;
  name: string;
  candidates: AtLeastTwo<ConstituencyCode>;
};

const POLLING_STATIONS_EXTRACTED = "2022-03-30";
const MERGES_AND_RECODINGS = new Set(["31", "32", "33", "34", "41", "50"]);
const REESTABLISHMENT = "21";
const MAX_HOPS = 10;
const OVERSEAS_COLLECTIVITY = /^(975|97[78]|98[678])/;
const SEATS = 577;
const ABROAD = "099-";
const MAX_UNITS_WITHOUT_CONSTITUENCY = 10;

export type CommuneCodes = {
  names: ReadonlyMap<CommuneCode, string>;
  wholeCityOf: ReadonlyMap<CommuneCode, CommuneCode>;
  reestablishedFrom: ReadonlyMap<CommuneCode, string>;
  current: (code2022: string) => string;
};

export const communeCodes = job({
  name: "commune codes",
  dependencies: { cogCommunes, cogEvents },
  async run({ cogCommunes, cogEvents }): Promise<CommuneCodes> {
    const names = new Map<CommuneCode, string>();
    const wholeCityOf = new Map<CommuneCode, CommuneCode>();
    for (const row of readTable(await readFile(cogCommunes, "utf8"), ",", ["TYPECOM", "COM", "LIBELLE", "COMPARENT"])) {
      if (row.TYPECOM !== "COM" && row.TYPECOM !== "ARM") continue;
      const code = communeCode(row.COM);
      names.set(code, row.LIBELLE);
      if (row.TYPECOM === "ARM") wholeCityOf.set(code, communeCode(row.COMPARENT));
    }

    const successor = new Map<string, string>();
    const reestablishedFrom = new Map<CommuneCode, string>();
    const events = readTable(await readFile(cogEvents, "utf8"), ",", ["MOD", "DATE_EFF", "COM_AV", "TYPECOM_AP", "COM_AP"]);
    for (const row of events) {
      if (row.DATE_EFF <= POLLING_STATIONS_EXTRACTED || row.TYPECOM_AP !== "COM" || row.COM_AV === row.COM_AP) continue;
      if (MERGES_AND_RECODINGS.has(row.MOD)) successor.set(row.COM_AV, row.COM_AP);
      if (row.MOD === REESTABLISHMENT) reestablishedFrom.set(communeCode(row.COM_AP), row.COM_AV);
    }
    const current = (code2022: string) => {
      let code = code2022;
      for (let hops = 0; hops < MAX_HOPS; hops++) {
        const next = successor.get(code);
        if (next === undefined) return code;
        code = next;
      }
      throw new Error(`Commune ${code2022}: more than ${MAX_HOPS} successive merges`);
    };
    return { names, wholeCityOf, reestablishedFrom, current };
  },
});

const isAtLeastTwo = <T>(list: readonly T[]): list is AtLeastTwo<T> => list.length >= 2;
const isNonEmpty = <T>(list: readonly T[]): list is readonly [T, ...T[]] => list.length >= 1;

export const communeConstituencies = job({
  name: "commune constituencies",
  dependencies: { communeCodes, pollingStations, deputies },
  run({ communeCodes, pollingStations, deputies }): CommuneConstituencies[] {
    const { names, wholeCityOf, reestablishedFrom, current } = communeCodes;
    const byUnit = new Map<string, Set<ConstituencyCode>>();
    for (const [code2022, constituencies] of pollingStations.byCommune2022) {
      const unit = current(code2022);
      const set = byUnit.get(unit) ?? new Set();
      for (const c of constituencies) set.add(c);
      byUnit.set(unit, set);
    }
    for (const [arrondissement, city] of wholeCityOf) {
      const set = byUnit.get(city) ?? new Set();
      for (const c of byUnit.get(arrondissement) ?? []) set.add(c);
      byUnit.set(city, set);
    }

    const codes = new Set<CommuneCode>([...names.keys(), ...[...byUnit.keys()].filter((c) => OVERSEAS_COLLECTIVITY.test(c)).map(communeCode)]);
    const units: CommuneConstituencies[] = [];
    const missing: string[] = [];
    for (const code of [...codes].sort()) {
      const parent = reestablishedFrom.get(code);
      const set = byUnit.get(code) ?? (parent === undefined ? undefined : byUnit.get(current(parent)));
      const constituencies = sortedConstituencies(set ?? []);
      if (isNonEmpty(constituencies)) units.push({ code, constituencies });
      else missing.push(`${code} ${names.get(code) ?? ""}`);
    }

    const seats = new Set(deputies.map((d) => lastMandate(d).constituency));
    if (seats.size !== SEATS) throw new Error(`Deputies cover ${seats.size} constituencies, expected ${SEATS}`);
    const published = new Set(units.flatMap((u) => u.constituencies));
    const unknown = [...published].filter((c) => !seats.has(c));
    if (unknown.length > 0) throw new Error(`Constituencies unknown to the deputies data: ${unknown.join(", ")}`);
    const absent = [...seats].filter((c) => !c.startsWith(ABROAD) && !published.has(c));
    if (absent.length > 0) throw new Error(`Constituencies without any commune: ${absent.join(", ")}`);
    console.log(`  ${units.length} communes and arrondissements; without any constituency: ${missing.join(", ")}`);
    if (missing.length > MAX_UNITS_WITHOUT_CONSTITUENCY) throw new Error(`${missing.length} communes without any constituency`);
    return units;
  },
});

export const splitCommunes = job({
  name: "split communes",
  dependencies: { communeConstituencies, communeCodes },
  run({ communeConstituencies, communeCodes }): SplitUnit[] {
    const split = communeConstituencies.flatMap(({ code, constituencies }): SplitUnit[] =>
      isAtLeastTwo(constituencies) && !WHOLE_CITY_CODES.has(code)
        ? [{ code, name: communeCodes.names.get(code) ?? code, candidates: constituencies }]
        : [],
    );
    console.log(`  ${split.length} split communes and arrondissements`);
    return split;
  },
});
