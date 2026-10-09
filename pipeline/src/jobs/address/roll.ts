import { columnIndexes, parseDelimitedLine } from "../../core/delimited.ts";
import type { BBox } from "../../core/geometry.ts";
import { job } from "../../core/job.ts";
import { lines } from "../../core/lines.ts";
import type { ConstituencyCode } from "../deputies.ts";
import type { CommuneCode } from "./codes.ts";
import { type SplitUnit, communeCodes, splitCommunes } from "./communes.ts";
import { isReuGeoType, parseReuLabel } from "./label.ts";
import { pollingStations } from "./stations.ts";
import { type RollEntry, type Street, addToStreet, compressStreets } from "./streets.ts";
import { reuAddresses } from "./sources.ts";

export type RollUnit = {
  unit: SplitUnit;
  bbox: BBox;
  streets: Map<string, Street>;
  points: { lon: number[]; lat: number[]; constituency: ConstituencyCode[] };
};

const COLUMNS = ["code_commune_ref", "id_brut_bv_reu", "geo_adresse", "geo_type", "longitude", "latitude"] as const;
const MAX_UNMAPPED_SHARE = 0.01;
const LOGGED_EXAMPLES = 10;

export const electoralRoll = job({
  name: "electoral roll of split communes",
  dependencies: { reuAddresses, pollingStations, communeCodes, splitCommunes },
  async run({ reuAddresses, pollingStations, communeCodes, splitCommunes }): Promise<ReadonlyMap<CommuneCode, RollUnit>> {
    const splitByCode = new Map<string, SplitUnit>(splitCommunes.map((u) => [u.code, u]));
    const unitOf2022 = new Map<string, SplitUnit | null>();
    const unitOf = (code2022: string) => {
      let unit = unitOf2022.get(code2022);
      if (unit === undefined) {
        unit = splitByCode.get(communeCodes.current(code2022)) ?? null;
        unitOf2022.set(code2022, unit);
      }
      return unit;
    };

    const roll = new Map<CommuneCode, RollUnit>();
    let indexes: Record<(typeof COLUMNS)[number], number> | undefined;
    let width = 0;
    let total = 0;
    let kept = 0;
    let unmapped = 0;
    const unparsed: string[] = [];
    const outsideCandidates: string[] = [];
    for await (const line of lines(reuAddresses)) {
      if (indexes === undefined) {
        const header = parseDelimitedLine(line, ",");
        indexes = columnIndexes(header, COLUMNS);
        if (indexes.code_commune_ref !== 0) throw new Error("code_commune_ref must be the first REU column");
        width = header.length;
        continue;
      }
      if (line === "") continue;
      total++;
      const unit = unitOf(line.slice(0, line.indexOf(",")));
      if (unit === null) continue;
      kept++;
      const fields = parseDelimitedLine(line, ",");
      if (fields.length !== width) throw new Error(`REU row with ${fields.length} fields: ${line}`);
      const constituency = pollingStations.byReuStation.get(fields[indexes.id_brut_bv_reu]!);
      if (constituency === undefined) {
        unmapped++;
        continue;
      }
      if (!unit.candidates.includes(constituency)) outsideCandidates.push(`${unit.code}: ${constituency}`);
      const type = fields[indexes.geo_type]!;
      if (!isReuGeoType(type)) throw new Error(`Unknown REU geo_type ${type}: ${line}`);
      const lon = Number(fields[indexes.longitude]);
      const lat = Number(fields[indexes.latitude]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error(`REU row without coordinates: ${line}`);

      let entry = roll.get(unit.code);
      if (entry === undefined) {
        entry = { unit, bbox: [lon, lat, lon, lat], streets: new Map(), points: { lon: [], lat: [], constituency: [] } };
        roll.set(unit.code, entry);
      }
      const [west, south, east, north] = entry.bbox;
      entry.bbox = [Math.min(west, lon), Math.min(south, lat), Math.max(east, lon), Math.max(north, lat)];
      entry.points.lon.push(lon);
      entry.points.lat.push(lat);
      entry.points.constituency.push(constituency);

      if (type === "municipality") continue;
      const label = parseReuLabel(fields[indexes.geo_adresse]!, type);
      if (label === null) unparsed.push(fields[indexes.geo_adresse]!);
      else addToStreet(entry.streets, label.street, label.number, constituency);
    }

    console.log(`  ${kept} of ${total} REU rows in ${roll.size} split units; ${unmapped} without a mapped polling station`);
    console.log(`  ${unparsed.length} labels not parsed: ${unparsed.slice(0, LOGGED_EXAMPLES).join(" | ")}`);
    if (unmapped > kept * MAX_UNMAPPED_SHARE) throw new Error(`${unmapped} REU rows have no mapped polling station`);
    if (outsideCandidates.length > 0) throw new Error(`Roll constituencies outside their commune: ${[...new Set(outsideCandidates)].join(", ")}`);
    const empty = splitCommunes.filter((u) => !roll.has(u.code));
    if (empty.length > 0) throw new Error(`Split communes without REU addresses: ${empty.map((u) => `${u.code} ${u.name}`).join(", ")}`);
    return roll;
  },
});

export type RollRow = RollEntry & { commune: CommuneCode };

export const electoralRollRows = job({
  name: "electoral roll rows",
  dependencies: { electoralRoll },
  run({ electoralRoll }): RollRow[] {
    const rows: RollRow[] = [];
    for (const [commune, { streets }] of electoralRoll) {
      const entries = compressStreets(streets).sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
      const duplicate = entries.find((e, i) => i > 0 && entries[i - 1]!.address === e.address);
      if (duplicate !== undefined) throw new Error(`${commune}: duplicate roll address "${duplicate.address}"`);
      rows.push(...entries.map((e) => ({ ...e, commune })));
    }
    const ambiguous = rows.filter((r) => r.number !== null && r.constituencies.length > 1).length;
    const mixedWithoutNumbers = rows.filter((r) => r.number === null && r.constituencies.length > 1).length;
    console.log(`  ${rows.length} roll rows; ${ambiguous} numbers in several constituencies; ${mixedWithoutNumbers} mixed streets without numbers`);
    return rows;
  },
});
