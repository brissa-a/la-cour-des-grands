import { strFromU8, unzipSync } from "fflate";
import { yesNo, yesNoValues } from "../core/categories.ts";
import { category, csv, generatedCsvs, type GeneratedFile } from "../core/csv.ts";
import { labelledValues } from "../core/values.ts";
import { entity } from "../core/entity.ts";
import { job } from "../core/job.ts";
import { source } from "../core/source.ts";
import { type IsoDate, isoDate } from "../core/types.ts";
import { type Deputy, type DeputyId, deputy } from "./deputies.ts";

const scrutins = source({
  name: "scrutins.zip",
  url: "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip",
  maxAgeHours: 24,
});

export type VoteId = string & { readonly __brand: "VoteId" };

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

function decode<const M extends Record<string, string>>(mapping: M, raw: string, what: string): M[keyof M] {
  if (!Object.hasOwn(mapping, raw)) throw new Error(`Unknown ${what}: ${raw}`);
  return mapping[raw as keyof M];
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

type RawVoters = { votant: { acteurRef: string } | { acteurRef: string }[] } | null;

type RawScrutin = {
  uid: string;
  numero: string;
  dateScrutin: string;
  titre: string;
  typeVote: { libelleTypeVote: string };
  sort: { code: string };
  ventilationVotes: {
    organe: {
      groupes: {
        groupe: RawGroupVote | RawGroupVote[];
      };
    };
  };
};

type RawGroupVote = {
  vote: {
    decompteNominatif: { pours: RawVoters; contres: RawVoters; abstentions: RawVoters; nonVotants: RawVoters };
  };
};

const RAW_POSITIONS = { pours: "for", contres: "against", abstentions: "abstain", nonVotants: "not_voting" } as const;

const MAX_VOTES_IN_SHARED_FILE = 5;
const OTHER_VOTES_FILE = "votes/other.csv";

const asList = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

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

function parse(raw: RawScrutin): Omit<Ballot, "file"> {
  const positions = new Map<DeputyId, CastPosition>();
  for (const group of asList(raw.ventilationVotes.organe.groupes.groupe)) {
    const nominal = group.vote.decompteNominatif;
    for (const [rawPosition, position] of Object.entries(RAW_POSITIONS)) {
      for (const voter of asList(nominal[rawPosition as keyof typeof RAW_POSITIONS]?.votant)) {
        positions.set(voter.acteurRef as DeputyId, position);
      }
    }
  }
  const title = normalize(raw.titre);
  const kind = decode(KIND_BY_AN_LABEL, raw.typeVote.libelleTypeVote, "vote kind");
  return {
    id: raw.uid as VoteId,
    number: Number(raw.numero),
    date: isoDate(raw.dateScrutin),
    title,
    kind,
    result: decode(RESULT_BY_AN_CODE, raw.sort.code, "vote result"),
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
    const parsed = Object.values(files)
      .map((content) => parse((JSON.parse(strFromU8(content)) as { scrutin: RawScrutin }).scrutin))
      .sort((a, b) => a.number - b.number);

    const votesByBill = Map.groupBy(parsed, (b) => b.bill?.toLowerCase() ?? null);
    const fileByBill = new Map<string | null, string>();
    const usedFiles = new Set<string>();
    for (const [bill, votes] of votesByBill) {
      if (bill === null || votes.length <= MAX_VOTES_IN_SHARED_FILE) {
        fileByBill.set(bill, OTHER_VOTES_FILE);
        continue;
      }
      const base = slug(bill);
      let file = `votes/${base}.csv`;
      for (let n = 2; usedFiles.has(file); n++) file = `votes/${base}-${n}.csv`;
      usedFiles.add(file);
      fileByBill.set(bill, file);
    }
    return parsed.map((b) => ({ ...b, file: fileByBill.get(b.bill?.toLowerCase() ?? null)! }));
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

function inOfficeOn(d: Deputy, date: IsoDate): boolean {
  return d.mandates.some((m) => m.start <= date && (m.end === null || m.end >= date));
}


function positionFiles(name: string, files: (ballots: Ballot[]) => GeneratedFile<Ballot>[]) {
  return generatedCsvs({
    name,
    entity: deputy,
    columnEntity: vote,
    dependencies: {},
    feature: category("Position de vote", votePositions),
    files,
    value: (d, ballot) => ballot.positions.get(d.id) ?? (inOfficeOn(d, ballot.date) ? "absent" : null),
    gzipBudget: 150_000,
  });
}

export const majorVotes = positionFiles("deputies/major-votes.csv", (ballots) => [
  { file: "major-votes.csv", columns: ballots.filter((b) => b.major) },
]);

export const votesByBill = positionFiles("deputies/votes/*.csv", (ballots) =>
  [...Map.groupBy(ballots, (b) => b.file)].map(([file, columns]) => ({ file, columns })),
);
