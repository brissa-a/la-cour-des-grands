import { strFromU8 } from "fflate";
import { csv } from "../core/csv.ts";
import { job } from "../core/job.ts";
import { list, optionalText, parseJson, record } from "../core/json.ts";
import { source } from "../core/source.ts";
import { type DeputyId, deputy, deputyId } from "./deputies.ts";

const deputiesPageData = source({
  name: "get-deputes-data.json",
  url: "https://www.assemblee-nationale.fr/dyn/ajax/deputes/get-deputes-data",
  maxAgeHours: 24,
});

const communesByDeputy = job({
  name: "communes by deputy",
  dependencies: { deputiesPageData },
  run({ deputiesPageData }): Map<DeputyId, string[]> {
    const { data } = record(parseJson(strFromU8(deputiesPageData)), "deputies page data");
    return new Map(
      list(data, "deputies page data").flatMap((raw): [DeputyId, string[]][] => {
        const entry = record(raw, "deputies page entry");
        const actUid = optionalText(entry.actUid, "actUid");
        const communes = optionalText(entry.communes, "communes");
        return actUid && communes ? [[deputyId(actUid), communes.split(",").map((c) => c.trim())]] : [];
      }),
    );
  },
});

export const communes = csv({
  entity: deputy,
  file: "communes.csv",
  dependencies: { communesByDeputy },
  features: {
    communes: { title: "Communes de la circonscription", type: "list" },
  },
  row: (d, { communesByDeputy }) => ({ communes: communesByDeputy.get(d.id) ?? null }),
});
