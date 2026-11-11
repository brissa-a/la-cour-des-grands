import { readFile } from "node:fs/promises";
import { readTable } from "../core/delimited.ts";
import { isoDate } from "../core/types.ts";
import { type DeputyId, deputyId } from "../jobs/deputies.ts";
import { type VoteId, voteId } from "../jobs/votes.ts";
import { type SnapshotPath, snapshotPath } from "../publication/paths.ts";
import type { Changes, DeputyChange, Member, NewVote, Scope, Tally, VoteFacts, VoteResult } from "./news.ts";

const VOTES = "votes/votes.csv";
const DEPUTIES = "deputies/init.csv";
const GROUPS = "deputies/values/group.csv";

type VoteKind = "ordinary" | "solemn" | "censure_motion";

function decoded<V>(mapping: Readonly<Record<string, V>>, raw: string, what: string): V {
  const value = Object.hasOwn(mapping, raw) ? mapping[raw] : undefined;
  if (value === undefined) throw new Error(`Unknown ${what}: ${raw}`);
  return value;
}

const KINDS: Readonly<Record<string, VoteKind>> = { ordinary: "ordinary", solemn: "solemn", censure_motion: "censure_motion" };
const RESULTS: Readonly<Record<string, VoteResult>> = { adopted: "adopted", rejected: "rejected" };
const IN_OFFICE: Readonly<Record<string, boolean>> = { yes: true, no: false };

// A text voted as a whole: "l'ensemble du projet de loi …", or the text itself, "la proposition de loi …".
const WHOLE_TEXT = /^(?:l'ensemble|le projet de loi|la proposition de (?:loi|résolution))/;
const AMENDMENT = /^(?:l'amendement|le sous-amendement|les amendements|les sous-amendements)\b/;

export function scopeOf(kind: VoteKind, title: string): Scope {
  const lower = title.toLowerCase();
  if (kind === "censure_motion") return "censure";
  if (WHOLE_TEXT.test(lower)) return "whole_text";
  if (kind === "solemn") return "solemn";
  if (lower.startsWith("la motion")) return "motion";
  if (lower.startsWith("l'article")) return "article";
  return AMENDMENT.test(lower) ? "amendment" : "other";
}

const readText = (dir: string, file: string): Promise<string> => readFile(`${dir}/${file}`, "utf8");

function count(raw: string, what: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${what} is not a count: ${raw}`);
  return Number(raw);
}

type ReadVote = { readonly facts: VoteFacts; readonly scope: Scope; readonly file: SnapshotPath };

async function newVotes(previous: string, current: string): Promise<ReadVote[]> {
  const known = new Set(readTable(await readText(previous, VOTES), ",", ["vote_id"]).map((row) => row.vote_id));
  const rows = readTable(await readText(current, VOTES), ",", ["vote_id", "number", "date", "title", "kind", "result", "bill", "file"]);
  return rows
    .filter((row) => !known.has(row.vote_id))
    .map((row) => {
      const id = voteId(row.vote_id);
      const facts = {
        id,
        number: count(row.number, `${id} number`),
        date: isoDate(row.date),
        title: row.title,
        result: decoded(RESULTS, row.result, `${id} result`),
        bill: row.bill === "" ? null : row.bill,
      };
      return { facts, scope: scopeOf(decoded(KINDS, row.kind, `${id} kind`), row.title), file: snapshotPath(row.file) };
    });
}

async function tallies(dir: string, votes: readonly ReadVote[]): Promise<Map<VoteId, Tally>> {
  const counted = new Map<VoteId, Tally>();
  for (const [file, inFile] of Map.groupBy(votes, (v) => v.file)) {
    const ids = inFile.map((v) => v.facts.id);
    const rows = readTable(await readText(dir, file), ",", ["deputy_id", ...ids]);
    for (const id of ids) {
      const cast = rows.map((row) => row[id]);
      const of = (position: string) => cast.filter((p) => p === position).length;
      counted.set(id, { for: of("for"), against: of("against"), abstain: of("abstain") });
    }
  }
  return counted;
}

const HEADLINE: ReadonlySet<Scope> = new Set(["whole_text", "censure", "solemn", "motion"]);

async function votesOf(previous: string, current: string): Promise<NewVote[]> {
  const read = await newVotes(previous, current);
  const counted = await tallies(current, read.filter((v) => HEADLINE.has(v.scope)));
  return read.map(({ facts, scope }): NewVote => {
    const tally = counted.get(facts.id);
    switch (scope) {
      case "whole_text":
      case "censure":
      case "solemn":
      case "motion":
        if (tally === undefined) throw new Error(`${facts.id} has no positions`);
        return { ...facts, scope, tally };
      case "article":
      case "amendment":
      case "other":
        return { ...facts, scope };
    }
  });
}

export type Sitting = Member & { readonly inOffice: boolean };

async function deputiesOf(dir: string): Promise<Map<DeputyId, Sitting>> {
  const groups = new Map(readTable(await readText(dir, GROUPS), ",", ["value", "short_fr"]).map((row) => [row.value, row.short_fr]));
  const rows = readTable(await readText(dir, DEPUTIES), ",", ["deputy_id", "first_name", "last_name", "in_office", "department", "constituency_number", "group"]);
  return new Map(
    rows.map((row) => {
      const id = deputyId(row.deputy_id);
      const group = row.group === "" ? null : (groups.get(row.group) ?? row.group);
      const constituency = { department: row.department, number: row.constituency_number };
      return [id, { id, name: `${row.first_name} ${row.last_name}`, group, constituency, inOffice: decoded(IN_OFFICE, row.in_office, `${id} in_office`) }];
    }),
  );
}

const member = ({ id, name, group, constituency }: Sitting): Member => ({ id, name, group, constituency });

const constituencyKey = ({ constituency }: Member): string => `${constituency.department}\n${constituency.number}`;

export function deputyChanges(before: ReadonlyMap<DeputyId, Sitting>, after: ReadonlyMap<DeputyId, Sitting>): DeputyChange[] {
  const arrived = [...after.values()].filter((d) => d.inOffice && before.get(d.id)?.inOffice !== true).map(member);
  const left = [...before.values()].filter((d) => d.inOffice && after.get(d.id)?.inOffice !== true).map((d) => member(after.get(d.id) ?? d));
  const leftByConstituency = Map.groupBy(left, constituencyKey);
  const replaced = new Set<DeputyId>();
  const entries: DeputyChange[] = arrived.map((deputy) => {
    const predecessor = leftByConstituency.get(constituencyKey(deputy))?.find((d) => !replaced.has(d.id));
    if (predecessor === undefined) return { kind: "arrival", deputy };
    replaced.add(predecessor.id);
    return { kind: "replacement", arrived: deputy, left: predecessor };
  });
  const departures = left.filter((d) => !replaced.has(d.id)).map((deputy): DeputyChange => ({ kind: "departure", deputy }));
  const moves = [...after.values()].flatMap((d): DeputyChange[] => {
    const was = before.get(d.id);
    return d.inOffice && was?.inOffice === true && was.group !== d.group ? [{ kind: "group", deputy: member(d), from: was.group }] : [];
  });
  return [...entries, ...departures, ...moves];
}

// What a newly published version brings over the one it replaces, read from both versions' files.
export async function readChanges(previous: string, current: string): Promise<Changes> {
  const [votes, before, after] = await Promise.all([votesOf(previous, current), deputiesOf(previous), deputiesOf(current)]);
  return { votes, deputies: deputyChanges(before, after) };
}
