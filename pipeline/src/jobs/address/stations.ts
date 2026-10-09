import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { readTable } from "../../core/delimited.ts";
import { job } from "../../core/job.ts";
import type { ConstituencyCode } from "../deputies.ts";
import { type CommuneCode, communeCode, fromInseeCode, fromMinistryCode, ministryStationKey, paddedCommuneCode } from "./codes.ts";
import { inseeStations, ministryStations, reuStations } from "./sources.ts";

export const WHOLE_CITY_CODES: ReadonlySet<string> = new Set(["75056", "69123", "13055"]);

export type PollingStations = {
  byReuStation: ReadonlyMap<string, ConstituencyCode>;
  byCommune2022: ReadonlyMap<CommuneCode, ReadonlySet<ConstituencyCode>>;
};

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  const set = map.get(key);
  if (set === undefined) map.set(key, new Set([value]));
  else set.add(value);
}

export const pollingStations = job({
  name: "polling stations",
  dependencies: { inseeStations, ministryStations, reuStations },
  async run({ inseeStations, ministryStations, reuStations }): Promise<PollingStations> {
    const byCommune2022 = new Map<CommuneCode, Set<ConstituencyCode>>();

    const ministry = new Map<string, ConstituencyCode>();
    for (const row of readTable(await readFile(ministryStations, "utf8"), ",", ["codeCirconscription", "codeCommune", "codeBureauVote"])) {
      const constituency = fromMinistryCode(row.codeCirconscription);
      ministry.set(row.codeBureauVote, constituency);
      if (!WHOLE_CITY_CODES.has(row.codeCommune) && !row.codeCommune.startsWith("ZZ")) addTo(byCommune2022, communeCode(row.codeCommune), constituency);
    }

    const zip = unzipSync(new Uint8Array(await readFile(inseeStations)), { filter: (f) => f.name.endsWith(".csv") });
    const [inseeCsv, ...others] = Object.values(zip);
    if (inseeCsv === undefined || others.length > 0) throw new Error(`${inseeStations}: expected exactly one CSV`);
    const insee = new Map<string, ConstituencyCode>();
    for (const row of readTable(strFromU8(inseeCsv), "\t", ["commune_code", "code_normalise_complet", "circonscription_code"])) {
      const constituency = fromInseeCode(row.circonscription_code);
      insee.set(`${row.commune_code}_${row.code_normalise_complet}`, constituency);
      addTo(byCommune2022, paddedCommuneCode(row.commune_code), constituency);
    }

    const byReuStation = new Map<string, ConstituencyCode>();
    const disagreements: string[] = [];
    const unmapped: string[] = [];
    for (const row of readTable(await readFile(reuStations, "utf8"), ",", ["id_brut_reu", "id_brut_insee", "code_commune", "id_brut_miom"])) {
      const fromMinistry = ministry.get(ministryStationKey(row.id_brut_miom));
      const fromInsee = insee.get(row.id_brut_insee);
      const constituency = fromMinistry ?? fromInsee;
      if (constituency === undefined) {
        unmapped.push(row.id_brut_reu);
        continue;
      }
      if (fromMinistry !== undefined && fromInsee !== undefined && fromMinistry !== fromInsee) {
        disagreements.push(`${row.id_brut_reu} (ministry ${fromMinistry}, INSEE ${fromInsee})`);
      }
      byReuStation.set(row.id_brut_reu, constituency);
      addTo(byCommune2022, communeCode(row.code_commune), constituency);
    }
    console.log(`  ${byReuStation.size} REU polling stations mapped, ${unmapped.length} unmapped: ${unmapped.join(", ")}`);
    console.log(`  ${disagreements.length} ministry/INSEE disagreements (ministry kept): ${disagreements.join(", ")}`);
    return { byReuStation, byCommune2022 };
  },
});
