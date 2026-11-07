import { csv, partitionedCsvs } from "../../core/csv.ts";
import { entity } from "../../core/entity.ts";
import { geojson } from "../../core/geojson.ts";
import { type CommuneConstituencies, communeConstituencies } from "./communes.ts";
import { type ContourPart, splitCommuneContours } from "./contours.ts";
import { type RollRow, electoralRollRows } from "./roll.ts";

const COMMUNES_FOLDER = "communes";
const COMMUNE_KEY = "commune_code";

const commune = entity({
  name: "commune",
  folder: COMMUNES_FOLDER,
  key: COMMUNE_KEY,
  rows: communeConstituencies,
  id: (c: CommuneConstituencies) => c.code,
});

const communeContour = entity({
  name: "commune",
  folder: COMMUNES_FOLDER,
  key: COMMUNE_KEY,
  rows: splitCommuneContours,
  id: (c: ContourPart) => c.commune,
});

const address = entity({
  name: "address",
  folder: `${COMMUNES_FOLDER}/addresses`,
  key: "address",
  rows: electoralRollRows,
  id: (r: RollRow) => r.address,
});

export const communeConstituencyTable = csv({
  entity: commune,
  file: "constituencies.csv",
  dependencies: {},
  features: {
    constituencies: { title: "Circonscriptions", type: "list" },
  },
  row: (c) => ({ constituencies: c.constituencies }),
  gzipBudget: 120_000,
});

export const constituencyContours = geojson({
  entity: communeContour,
  file: "constituency-contours.geojson",
  dependencies: {},
  features: {
    constituency: { title: "Circonscription", type: "code" },
  },
  properties: (c) => ({ constituency: c.constituency }),
  geometry: (c) => c.polygons,
  gzipBudget: 150_000,
});

export const electoralRollFiles = partitionedCsvs({
  name: "communes/addresses/*.csv",
  entity: address,
  dependencies: {},
  partition: (r) => `${r.commune}.csv`,
  features: {
    number: { title: "Numéro", type: "code" },
    constituencies: { title: "Circonscriptions", type: "list" },
  },
  row: (r) => ({ number: r.number, constituencies: r.constituencies }),
  gzipBudget: 60_000,
});
