import type { IsoDate } from "../core/types.ts";
import type { DeputyId } from "../jobs/deputies.ts";
import type { VoteId } from "../jobs/votes.ts";
import { type Markdown, capitalized, joined, md, rendered, shortened } from "./markdown.ts";
import { MAX_BODY_BYTES, type Notification } from "./ntfy.ts";

export type Tally = { readonly for: number; readonly against: number; readonly abstain: number };

export type VoteResult = "adopted" | "rejected";

export type HeadlineScope = "whole_text" | "censure" | "solemn" | "motion";
export type BulkScope = "article" | "amendment" | "other";
export type Scope = HeadlineScope | BulkScope;

export type VoteFacts = {
  readonly id: VoteId;
  readonly number: number;
  readonly date: IsoDate;
  readonly title: string;
  readonly result: VoteResult;
  readonly bill: string | null;
};

export type NewVote = VoteFacts & ({ readonly scope: HeadlineScope; readonly tally: Tally } | { readonly scope: BulkScope });

export type Seat = { readonly department: string; readonly number: string };

export type Member = { readonly id: DeputyId; readonly name: string; readonly group: string | null; readonly seat: Seat };

export type DeputyChange =
  | { readonly kind: "replacement"; readonly arrived: Member; readonly left: Member }
  | { readonly kind: "arrival"; readonly deputy: Member }
  | { readonly kind: "departure"; readonly deputy: Member }
  | { readonly kind: "group"; readonly deputy: Member; readonly from: string | null };

export type Changes = { readonly votes: readonly NewVote[]; readonly deputies: readonly DeputyChange[] };

const MAX_HEADING = 160;
const MAX_LABEL = 120;
const MAX_NAME = 60;
const MAX_HEADLINES = 4;
const MAX_LISTED_DEPUTIES = 8;

const RANK: Readonly<Record<Scope, number>> = { whole_text: 0, censure: 1, solemn: 2, motion: 3, article: 4, amendment: 4, other: 4 };
const LAST_HEADLINE_RANK = RANK.motion;

const plural = (count: number, singular: string, several: string): string => `${count} ${count === 1 ? singular : several}`;

const PARTICIPLES: Readonly<Record<VoteResult, string>> = { adopted: "adopté", rejected: "rejeté" };

type Agreement = { readonly feminine?: boolean; readonly several?: boolean };

function resultWord(result: VoteResult, { feminine = false, several = false }: Agreement = {}): string {
  return PARTICIPLES[result] + (feminine ? "e" : "") + (several ? "s" : "");
}

// The opening article gives gender and number ("la première partie", "les crédits"); an elided "l'" says nothing, so masculine.
function agreementOf(subject: string): Agreement {
  const article = /^(\S+)\s/.exec(subject.trimStart().toLowerCase())?.[1];
  return { feminine: article === "la" || article === "une", several: article === "les" || article === "des" };
}

type Headline = NewVote & { readonly scope: HeadlineScope; readonly tally: Tally };

const isHeadline = (vote: NewVote): vote is Headline => "tally" in vote;

function figures(vote: Headline, subject: string): string {
  const outcome = capitalized(resultWord(vote.result, vote.scope === "censure" ? { feminine: true } : agreementOf(subject)));
  const { for: yes, against, abstain } = vote.tally;
  if (vote.scope === "censure") return `${outcome}, ${yes} voix pour`;
  return `${outcome}, ${yes} pour, ${against} contre${abstain === 0 ? "" : `, ${plural(abstain, "abstention", "abstentions")}`}`;
}

// What the title says before the bill it names: "la motion de rejet préalable, déposée par …, du projet de loi …".
function beforeBill(title: string, bill: string): string {
  const at = title.toLowerCase().indexOf(bill.toLowerCase());
  return at === -1 ? title : title.slice(0, at).trimEnd().replace(/[\s,]*(?:du|de la)$/i, "");
}

// The title gives the reading in parentheses: "l'ensemble du projet de loi … (texte de la commission mixte paritaire)."
function readingOf(title: string): string | null {
  const reading = /\(([^()]*(?:lecture|commission mixte paritaire)[^()]*)\)/.exec(title)?.[1];
  return reading === undefined ? null : shortened(reading.replace("commission mixte paritaire", "CMP"), MAX_LABEL);
}

function headlineLabel(vote: Headline, bill: string): string {
  switch (vote.scope) {
    case "whole_text": {
      const reading = readingOf(vote.title);
      return reading === null ? "ensemble du texte" : `ensemble du texte (${reading})`;
    }
    case "censure":
      return "motion de censure";
    case "solemn":
    case "motion":
      return shortened(beforeBill(vote.title, bill) || vote.title, MAX_LABEL);
  }
}

const BULK_NOUNS: Readonly<Record<BulkScope, readonly [string, string]>> = {
  article: ["article", "articles"],
  amendment: ["amendement", "amendements"],
  other: ["autre scrutin", "autres scrutins"],
};

function bulkLine([singular, several]: readonly [string, string], votes: readonly [NewVote, ...NewVote[]]): Markdown {
  const adopted = votes.filter((v) => v.result === "adopted").length;
  const rejected = votes.length - adopted;
  const counted = plural(votes.length, singular, several);
  if (adopted === 0 || rejected === 0) return md`- ${counted} ${resultWord(votes[0].result, { several: votes.length > 1 })}`;
  return md`- ${counted} : ${adopted} ${resultWord("adopted", { several: adopted > 1 })}, ${rejected} ${resultWord("rejected", { several: rejected > 1 })}`;
}

// A vote that names no bill is a subject of its own.
type Subject = { readonly kind: "text"; readonly bill: string; readonly votes: readonly [NewVote, ...NewVote[]] } | { readonly kind: "single"; readonly vote: NewVote };

function subjectsOf(votes: readonly NewVote[]): Subject[] {
  const texts = new Map<string, { readonly bill: string; readonly first: NewVote; readonly others: NewVote[] }>();
  const singles: Subject[] = [];
  for (const vote of votes) {
    if (vote.bill === null) singles.push({ kind: "single", vote });
    else {
      const key = vote.bill.toLowerCase();
      const text = texts.get(key);
      if (text === undefined) texts.set(key, { bill: vote.bill, first: vote, others: [] });
      else text.others.push(vote);
    }
  }
  return [...[...texts.values()].map(({ bill, first, others }): Subject => ({ kind: "text", bill, votes: [first, ...others] })), ...singles];
}

const votesIn = (subject: Subject): readonly NewVote[] => (subject.kind === "text" ? subject.votes : [subject.vote]);
const rankOf = (subject: Subject): number => Math.min(...votesIn(subject).map((v) => RANK[v.scope]));
const lastNumber = (subject: Subject): number => Math.max(...votesIn(subject).map((v) => v.number));

const byImportance = (a: Subject, b: Subject): number =>
  rankOf(a) - rankOf(b) || votesIn(b).length - votesIn(a).length || lastNumber(b) - lastNumber(a);

const CENSURE_ARTICLE = /article 49, alinéa (\d)/;
const CENSURE_AUTHORS = /,? par (.+?)\.?$/;

function singleBlock(vote: NewVote): Markdown {
  if (!isHeadline(vote)) return md`**${capitalized(shortened(vote.title, MAX_HEADING))}**\n- ${capitalized(resultWord(vote.result, agreementOf(vote.title)))}`;
  if (vote.scope !== "censure") return md`**${capitalized(shortened(vote.title, MAX_HEADING))}**\n- ${figures(vote, vote.title)}`;
  const article = CENSURE_ARTICLE.exec(vote.title)?.[1];
  const authors = CENSURE_AUTHORS.exec(vote.title)?.[1];
  const heading = md`**Motion de censure${article === undefined ? "" : ` (49.${article})`}**\n- ${figures(vote, vote.title)}`;
  return authors === undefined ? heading : md`${heading}\n- Déposée par ${shortened(authors, MAX_LABEL)}`;
}

const BULK_SCOPES: readonly BulkScope[] = ["article", "amendment", "other"];

function textBlock(bill: string, votes: readonly [NewVote, ...NewVote[]]): Markdown {
  const title = capitalized(shortened(bill, MAX_HEADING));
  const heading = votes.length > 1 ? md`**${title}** · ${votes.length} scrutins` : md`**${title}**`;
  const listed = votes
    .filter(isHeadline)
    .toSorted((a, b) => RANK[a.scope] - RANK[b.scope] || a.number - b.number)
    .slice(0, MAX_HEADLINES);
  const kept = new Set(listed.map((v) => v.id));
  const bulk = Map.groupBy(
    votes.filter((v) => !kept.has(v.id)),
    (v): BulkScope => (isHeadline(v) ? "other" : v.scope),
  );
  const alone = listed.length === 0 && bulk.size === 1;
  const lines = BULK_SCOPES.flatMap((scope) => {
    const [first, ...others] = bulk.get(scope) ?? [];
    if (first === undefined) return [];
    return [bulkLine(alone && scope === "other" ? ["scrutin", "scrutins"] : BULK_NOUNS[scope], [first, ...others])];
  });
  return joined([heading, ...listed.map((v) => {
    const label = headlineLabel(v, bill);
    return md`- ${figures(v, label)} : ${label}`;
  }), ...lines], md`\n`);
}

const subjectBlock = (subject: Subject): Markdown => (subject.kind === "text" ? textBlock(subject.bill, subject.votes) : singleBlock(subject.vote));

function ordinal(number: string): string {
  return number === "1" ? "1re" : `${number}e`;
}

function seatText({ department, number }: Seat): string {
  const place = shortened(department, MAX_NAME);
  return number === "" ? place : `${place}, ${ordinal(shortened(number, MAX_NAME))} circ.`;
}

const nameOf = (member: Member): string => {
  const name = shortened(member.name, MAX_NAME);
  return member.group === null ? name : `${name} (${shortened(member.group, MAX_NAME)})`;
};

const groupOf = (group: string | null): string => (group === null ? "sans groupe" : shortened(group, MAX_NAME));

function deputyLine(change: DeputyChange): Markdown {
  switch (change.kind) {
    case "replacement":
      return md`- ${nameOf(change.arrived)} remplace ${nameOf(change.left)}, ${seatText(change.arrived.seat)}`;
    case "arrival":
      return md`- ${nameOf(change.deputy)} entre à l'Assemblée, ${seatText(change.deputy.seat)}`;
    case "departure":
      return md`- ${nameOf(change.deputy)} quitte l'Assemblée, ${seatText(change.deputy.seat)}`;
    case "group":
      return md`- ${shortened(change.deputy.name, MAX_NAME)} : ${groupOf(change.from)} → ${groupOf(change.deputy.group)}`;
  }
}

function deputiesBlock(changes: readonly DeputyChange[]): Markdown[] {
  if (changes.length === 0) return [];
  const listed = changes.slice(0, MAX_LISTED_DEPUTIES).map(deputyLine);
  const more = changes.length - listed.length;
  return [joined([md`**Députés**`, ...listed, ...(more === 0 ? [] : [md`- et ${plural(more, "autre changement", "autres changements")}`])], md`\n`)];
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dayOf(date: IsoDate): { readonly day: string; readonly month: string; readonly year: string } {
  const [year = "", month = "", day = ""] = date.split("-");
  const dayNumber = Number(day);
  return { day: dayNumber === 1 ? "1er" : String(dayNumber), month: MONTHS[Number(month) - 1] ?? month, year };
}

export function datesText(first: IsoDate, last: IsoDate): string {
  const from = dayOf(first);
  const to = dayOf(last);
  if (first === last) return `le ${to.day} ${to.month} ${to.year}`;
  if (from.year !== to.year) return `du ${from.day} ${from.month} ${from.year} au ${to.day} ${to.month} ${to.year}`;
  if (from.month !== to.month) return `du ${from.day} ${from.month} au ${to.day} ${to.month} ${to.year}`;
  return `du ${from.day} au ${to.day} ${to.month} ${to.year}`;
}

function intro(votes: readonly NewVote[]): Markdown[] {
  const [first, ...others] = votes.map((v) => v.date).toSorted();
  if (first === undefined) return [];
  return [md`${capitalized(plural(votes.length, "scrutin", "scrutins"))} ${datesText(first, others.at(-1) ?? first)}`];
}

const SEPARATOR = md`\n\n`;
const bytes = (markdown: Markdown): number => Buffer.byteLength(rendered(markdown));
const others = (count: number): Markdown => md`… et ${plural(count, "autre sujet", "autres sujets")}`;

// Blocks are kept whole: all of them when they fit, else the most important first, each while it fits with the line that counts the others.
// The head and that line must fit on their own: a dated count of votes and « … et N autres sujets » stay under 100 bytes.
export function fitted(head: readonly Markdown[], blocks: readonly Markdown[], maxBytes = MAX_BODY_BYTES): string {
  const all = rendered(joined([...head, ...blocks], SEPARATOR));
  if (Buffer.byteLength(all) <= maxBytes) return all;
  const gap = bytes(SEPARATOR);
  const kept: Markdown[] = [...head];
  let size = Math.max(0, head.reduce((sum, block) => sum + gap + bytes(block), 0) - gap);
  for (const [i, block] of blocks.entries()) {
    const withBlock = (kept.length === 0 ? 0 : size + gap) + bytes(block);
    if (withBlock + gap + bytes(others(blocks.length - i - 1)) > maxBytes) return rendered(joined([...kept, others(blocks.length - i)], SEPARATOR));
    kept.push(block);
    size = withBlock;
  }
  return rendered(joined(kept, SEPARATOR));
}

function titleOf({ votes, deputies }: Changes): string {
  const count = (kind: DeputyChange["kind"]) => deputies.filter((c) => c.kind === kind).length;
  const parts = [
    [votes.length, "scrutin", "scrutins"],
    [count("replacement"), "député remplacé", "députés remplacés"],
    [count("arrival"), "arrivée", "arrivées"],
    [count("departure"), "départ", "départs"],
    [count("group"), "changement de groupe", "changements de groupe"],
  ] as const;
  return `Assemblée : ${parts.flatMap(([n, singular, several]) => (n === 0 ? [] : [plural(n, singular, several)])).join(", ")}`;
}

export function newsOf(changes: Changes, maxBytes = MAX_BODY_BYTES): Notification | null {
  if (changes.votes.length === 0 && changes.deputies.length === 0) return null;
  const subjects = subjectsOf(changes.votes).toSorted(byImportance);
  const headline = subjects.filter((s) => rankOf(s) <= LAST_HEADLINE_RANK).map(subjectBlock);
  const rest = subjects.filter((s) => rankOf(s) > LAST_HEADLINE_RANK).map(subjectBlock);
  return {
    topic: "news",
    priority: 3,
    title: titleOf(changes),
    body: fitted(intro(changes.votes), [...headline, ...deputiesBlock(changes.deputies), ...rest], maxBytes),
    tags: ["classical_building"],
    markdown: true,
  };
}
