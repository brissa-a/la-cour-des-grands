import { strFromU8, unzipSync } from "fflate";
import { yesNo, yesNoValues } from "../core/categories.ts";
import { category, csv, generatedCsvs, type GeneratedFile } from "../core/csv.ts";
import { labelledValues } from "../core/values.ts";
import { entity } from "../core/entity.ts";
import { job } from "../core/job.ts";
import { type JsonRecord, fieldOf, oneOrMany, parseJson, record, text } from "../core/json.ts";
import { source } from "../core/source.ts";
import { type IsoDate, isoDate } from "../core/types.ts";
import { type DeputyId, deputy, deputyId, inOfficeOn } from "./deputies.ts";

const scrutins = source({
  name: "scrutins.zip",
  url: "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip",
  maxAgeHours: 24,
});

export type VoteId = string & { readonly __brand: "VoteId" };

export function voteId(value: string): VoteId {
  if (!/^VTANR5L\d+V\d+$/.test(value)) throw new Error(`Invalid vote id: ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the format test above proves a vote id
  return value as VoteId;
}

type Position = "for" | "against" | "abstain" | "not_voting" | "absent";
type CastPosition = Exclude<Position, "absent">;

const KIND_BY_AN_LABEL = {
  "scrutin public ordinaire": "ordinary",
  "scrutin public solennel": "solemn",
  "motion de censure": "censure_motion",
} as const;
type Kind = (typeof KIND_BY_AN_LABEL)[keyof typeof KIND_BY_AN_LABEL];

const RESULT_BY_AN_CODE = { adopté: "adopted", rejeté: "rejected" } as const;
type Result = (typeof RESULT_BY_AN_CODE)[keyof typeof RESULT_BY_AN_CODE];

function decode<V extends string>(mapping: Readonly<Record<string, V>>, raw: string, what: string): V {
  const value = Object.hasOwn(mapping, raw) ? mapping[raw] : undefined;
  if (value === undefined) throw new Error(`Unknown ${what}: ${raw}`);
  return value;
}

export type Ballot = {
  id: VoteId;
  number: number;
  date: IsoDate;
  title: string;
  kind: Kind;
  result: Result;
  major: boolean;
  bill: string | null;
  file: string;
  positions: Map<DeputyId, CastPosition>;
};

const RAW_POSITIONS = { pours: "for", contres: "against", abstentions: "abstain", nonVotants: "not_voting" } as const;

const MAX_VOTES_IN_SHARED_FILE = 5;
const OTHER_VOTES_FILE = "votes/other.csv";

const normalize = (text: string) => text.replaceAll("’", "'").replace(/\s+/g, " ").trim();

// The reading, e.g. "(première lecture)", is the first parenthesis after the bill name.
const BILL = /(?:projet|proposition) de (?:loi|résolution).*?(?= \(|\.?$)/i;

export function billOf(title: string): string | null {
  return BILL.exec(normalize(title))?.[0] ?? null;
}

export function isMajor(title: string, kind: Kind): boolean {
  return normalize(title).toLowerCase().startsWith("l'ensemble") || kind !== "ordinary";
}

const MAX_SLUG_LENGTH = 80;

function slug(text: string): string {
  const full = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (full.length <= MAX_SLUG_LENGTH) return full;
  return full.slice(0, MAX_SLUG_LENGTH + 1).replace(/-[^-]*$/, "");
}

const child = (parent: JsonRecord, key: string, what: string): JsonRecord => record(parent[key], `${what} ${key}`);

function parse(raw: JsonRecord): Omit<Ballot, "file"> {
  const id = voteId(text(raw.uid, "vote uid"));
  const positions = new Map<DeputyId, CastPosition>();
  const groups = child(child(child(raw, "ventilationVotes", id), "organe", id), "groupes", id).groupe;
  for (const group of oneOrMany(groups)) {
    const nominal = child(child(record(group, `${id} groupe`), "vote", id), "decompteNominatif", id);
    for (const [rawPosition, position] of Object.entries(RAW_POSITIONS)) {
      for (const voter of oneOrMany(fieldOf(nominal[rawPosition], "votant"))) {
        positions.set(deputyId(text(record(voter, `${id} votant`).acteurRef, `${id} acteurRef`)), position);
      }
    }
  }
  const title = normalize(text(raw.titre, `${id} titre`));
  const kind = decode(KIND_BY_AN_LABEL, text(child(raw, "typeVote", id).libelleTypeVote, `${id} libelleTypeVote`), "vote kind");
  return {
    id,
    number: Number(text(raw.numero, `${id} numero`)),
    date: isoDate(text(raw.dateScrutin, `${id} dateScrutin`)),
    title,
    kind,
    result: decode(RESULT_BY_AN_CODE, text(child(raw, "sort", id).code, `${id} sort code`), "vote result"),
    major: isMajor(title, kind),
    bill: billOf(title),
    positions,
  };
}

export const ballots = job({
  name: "ballots",
  dependencies: { scrutins },
  run({ scrutins }): Ballot[] {
    const files = unzipSync(scrutins, { filter: (f) => f.name.endsWith(".json") });
    const parsed = Object.entries(files)
      .map(([name, content]) => parse(record(record(parseJson(strFromU8(content)), name).scrutin, `${name}: scrutin`)))
      .sort((a, b) => a.number - b.number);

    const votesByBill = Map.groupBy(parsed, (b) => b.bill?.toLowerCase() ?? null);
    const filed: Ballot[] = [];
    const usedFiles = new Set<string>();
    for (const [bill, votes] of votesByBill) {
      let file = OTHER_VOTES_FILE;
      if (bill !== null && votes.length > MAX_VOTES_IN_SHARED_FILE) {
        const base = slug(bill);
        file = `votes/${base}.csv`;
        for (let n = 2; usedFiles.has(file); n++) file = `votes/${base}-${n}.csv`;
        usedFiles.add(file);
      }
      filed.push(...votes.map((b) => ({ ...b, file })));
    }
    return filed.sort((a, b) => a.number - b.number);
  },
});

const VOTES_FOLDER = "votes";

export const vote = entity({
  name: "vote",
  folder: VOTES_FOLDER,
  key: "vote_id",
  rows: ballots,
  id: (b: Ballot) => b.id,
});

const kinds = labelledValues<Kind>(`${VOTES_FOLDER}/values/kind.csv`, {
  ordinary: "Scrutin public ordinaire",
  solemn: "Scrutin public solennel",
  censure_motion: "Motion de censure",
});

const results = labelledValues<Result>(`${VOTES_FOLDER}/values/result.csv`, { adopted: "Adopté", rejected: "Rejeté" });

const votePositions = labelledValues<Position>(`${deputy.folder}/values/vote_position.csv`, {
  for: "Pour",
  against: "Contre",
  abstain: "Abstention",
  not_voting: "Non-votant",
  absent: "Absent",
});

export const votesCatalog = csv({
  entity: vote,
  file: "votes.csv",
  dependencies: {},
  features: {
    number: { title: "Numéro", type: "number" },
    date: { title: "Date", type: "date" },
    title: { title: "Objet", type: "text" },
    kind: category("Type de scrutin", kinds),
    result: category("Résultat", results),
    major: category("Vote majeur", yesNoValues(VOTES_FOLDER)),
    bill: { title: "Texte", type: "text" },
    file: { title: "Fichier des positions", type: "code" },
    url: { title: "Scrutin sur le site de l'Assemblée", type: "link" },
  },
  row: (b) => ({
    number: b.number,
    date: b.date,
    title: b.title,
    kind: b.kind,
    result: b.result,
    major: yesNo(b.major),
    bill: b.bill,
    file: `${deputy.folder}/${b.file}`,
    url: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${b.number}`,
  }),
});

function positionFiles(name: string, files: (ballots: Ballot[]) => GeneratedFile<Ballot>[]) {
  return generatedCsvs({
    name,
    entity: deputy,
    columnEntity: vote,
    dependencies: {},
    feature: category("Position de vote", votePositions),
    files,
    value: (d, ballot) => ballot.positions.get(d.id) ?? (inOfficeOn(d.mandates, ballot.date) ? "absent" : null),
    gzipBudget: 150_000,
  });
}

export const majorVotes = positionFiles("deputies/major-votes.csv", (ballots) => [
  { file: "major-votes.csv", columns: ballots.filter((b) => b.major) },
]);

export const votesByBill = positionFiles("deputies/votes/*.csv", (ballots) =>
  [...Map.groupBy(ballots, (b) => b.file)].map(([file, columns]) => ({ file, columns })),
);
