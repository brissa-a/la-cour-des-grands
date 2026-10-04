import { csv } from "../core/csv.ts";
import { deputy } from "./deputies.ts";

export const links = csv({
  entity: deputy,
  file: "links.csv",
  dependencies: {},
  features: {
    official_page: { title: "Fiche sur le site de l'Assemblée", type: "link" },
  },
  row: (d) => ({ official_page: `https://www.assemblee-nationale.fr/dyn/deputes/${d.id}` }),
});
