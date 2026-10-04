import { strFromU8 } from "fflate";
import { csv } from "../core/csv.ts";
import { job } from "../core/job.ts";
import { source } from "../core/source.ts";
import { type DeputyId, deputy } from "./deputies.ts";

const deputiesPageData = source({
  name: "get-deputes-data.json",
  url: "https://www.assemblee-nationale.fr/dyn/ajax/deputes/get-deputes-data",
  maxAgeHours: 24,
});

type RawEntry = { actUid: string | null; communes: string | null };

const communesByDeputy = job({
  name: "communes by deputy",
  dependencies: { deputiesPageData },
  run({ deputiesPageData }): Map<DeputyId, string[]> {
    const { data } = JSON.parse(strFromU8(deputiesPageData)) as { data: RawEntry[] };
    return new Map(
      data.flatMap(({ actUid, communes }) =>
        actUid && communes ? [[actUid as DeputyId, communes.split(",").map((c) => c.trim())]] : [],
      ),
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
