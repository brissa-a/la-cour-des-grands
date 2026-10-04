import { strFromU8, unzipSync } from "fflate";
import { csv, generatedCsvs, type GeneratedFile } from "../core/csv.ts";
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

const POSITIONS = ["for", "against", "abstain", "not_voting", "absent"] as const;
type Position = (typeof POSITIONS)[number];
type CastPosition = Exclude<Position, "absent">;

export type Ballot = {
  id: VoteId;
  number: number;
  date: IsoDate;
  title: string;
  kind: string;
  result: string;
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

export function isMajor(title: string, kind: string): boolean {
  return normalize(title).toLowerCase().startsWith("l'ensemble") || kind !== "scrutin public ordinaire";
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
  const kind = raw.typeVote.libelleTypeVote;
  return {
    id: raw.uid as VoteId,
    number: Number(raw.numero),
    date: isoDate(raw.dateScrutin),
    title,
    kind,
    result: raw.sort.code,
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

export const vote = entity({
  name: "vote",
  folder: "votes",
  key: "vote_id",
  rows: ballots,
  id: (b: Ballot) => b.id,
});

export const votesCatalog = csv({
  entity: vote,
  file: "votes.csv",
  dependencies: {},
  features: {
    number: { title: "Numéro", type: "number" },
    date: { title: "Date", type: "date" },
    title: { title: "Objet", type: "text" },
    kind: { title: "Type de scrutin", type: "category" },
    result: { title: "Résultat", type: "category", values: ["adopté", "rejeté"] },
    major: { title: "Vote majeur", type: "category", values: ["yes", "no"] },
    bill: { title: "Texte", type: "text" },
    file: { title: "Fichier des positions", type: "code" },
  },
  row: (b) => ({
    number: b.number,
    date: b.date,
    title: b.title,
    kind: b.kind,
    result: b.result === "adopté" || b.result === "rejeté" ? b.result : null,
    major: b.major ? "yes" : "no",
    bill: b.bill,
    file: `${deputy.folder}/${b.file}`,
  }),
});

function inOfficeOn(d: Deputy, date: IsoDate): boolean {
  return d.mandates.some((m) => m.start <= date && (m.end === null || m.end >= date));
}

const POSITION_COLORS = {
  for: "#2e7d32",
  against: "#c62828",
  abstain: "#f9a825",
  not_voting: "#9e9e9e",
  absent: "#e0e0e0",
};

function positionFiles(name: string, files: (ballots: Ballot[]) => GeneratedFile<Ballot>[]) {
  return generatedCsvs({
    name,
    entity: deputy,
    columnEntity: vote,
    dependencies: {},
    feature: { title: "Position de vote", type: "category", values: POSITIONS },
    colors: POSITION_COLORS,
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
