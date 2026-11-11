import type { IsoDate } from "../core/types.ts";
import { reasonOf } from "../publication/publish.ts";
import type { Failure, Prompt, Writer, Written } from "./claude.ts";
import { type BulkScope, type Changes, newsOf } from "./news.ts";
import { NEWS_PROMPT } from "./newsPrompt.ts";
import { MAX_BODY_BYTES, type Notification } from "./ntfy.ts";

export const BY_CLAUDE = "Rédigé par Claude à partir des données de l'Assemblée.";
export const NEWS_DEADLINE_MS = 60_000;
// Some 15,000 tokens: a few cents, and an answer well within the deadline.
export const MAX_FACTS_BYTES = 50_000;

export type SetAside =
  | { readonly kind: "no-key" }
  | { readonly kind: "too-many-facts" }
  | { readonly kind: "failed"; readonly failure: Failure }
  | { readonly kind: "late" }
  | { readonly kind: "unusable" }
  | { readonly kind: "crashed" };

function statusCause(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "clé refusée";
    case 402:
      return "problème de facturation";
    case 429:
      return "trop de demandes";
    default:
      return `erreur HTTP ${status}`;
  }
}

function failureCause(failure: Failure): string {
  switch (failure.kind) {
    case "status":
      return statusCause(failure.status);
    case "unreachable":
      return "API injoignable";
    case "unfinished":
      return "réponse inachevée";
  }
}

export function causeOf(setAside: SetAside): string {
  switch (setAside.kind) {
    case "no-key":
      return "pas de clé";
    case "too-many-facts":
      return "trop de nouveautés";
    case "failed":
      return failureCause(setAside.failure);
    case "late":
      return "pas de réponse à temps";
    case "unusable":
      return "réponse inutilisable";
    case "crashed":
      return "erreur inattendue";
  }
}

export const automaticLine = (setAside: SetAside): string => `Résumé automatique à partir des données de l'Assemblée, sans Claude : ${causeOf(setAside)}.`;

const signature = (line: string): string => `\n\n_${line}_`;

type Counted = { readonly bill: string | null; readonly scope: BulkScope; readonly adopted: number; readonly rejected: number; readonly from: IsoDate; readonly to: IsoDate };

// Articles, amendments and other votes counted by text; the votes on a whole text, censures, solemn votes and motions kept whole.
export function countedFacts({ votes, deputies }: Changes) {
  const counted = new Map<string, Counted>();
  for (const vote of votes) {
    if ("tally" in vote) continue;
    const key = JSON.stringify([vote.bill, vote.scope]);
    const adopted = vote.result === "adopted" ? 1 : 0;
    const seen = counted.get(key);
    counted.set(
      key,
      seen === undefined
        ? { bill: vote.bill, scope: vote.scope, adopted, rejected: 1 - adopted, from: vote.date, to: vote.date }
        : { ...seen, adopted: seen.adopted + adopted, rejected: seen.rejected + 1 - adopted, from: vote.date < seen.from ? vote.date : seen.from, to: vote.date > seen.to ? vote.date : seen.to },
    );
  }
  return { votes: votes.filter((vote) => "tally" in vote), counted: [...counted.values()], deputies };
}

// The facts in full while they stay small, else counted, else none: what Claude is sent stays bounded.
export function factsOf(changes: Changes): string | null {
  for (const facts of [JSON.stringify(changes), JSON.stringify(countedFacts(changes))]) {
    if (Buffer.byteLength(facts) <= MAX_FACTS_BYTES) return facts;
  }
  return null;
}

export function promptOf(facts: string, automatic: Notification): Prompt {
  return {
    system: NEWS_PROMPT,
    user: `Faits (JSON) :\n${facts}\n\nTitre déjà affiché : ${automatic.title}\n\nVersion automatique :\n${automatic.body}`,
  };
}

export type Checked = { readonly kind: "accepted"; readonly body: string } | { readonly kind: "refused"; readonly reason: string };

// What a phone would fetch, follow or render unseen, or what would swallow the signature.
const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/\]\(/, "a link or an image"],
  [/</, "HTML"],
  [/```|~~~/, "a code block"],
  [/:\/\//, "a web address"],
  [/\p{Cf}/u, "an invisible formatting character"],
];

// Claude's answer is untrusted: whatever it holds, the body sent is well-formed text within ntfy's limit, signed, or none.
export function signedByClaude(answer: string): Checked {
  if (!answer.isWellFormed()) return { kind: "refused", reason: "its answer is not well-formed text" };
  const text = answer
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{Cc}\n\t]/gu, "")
    .trim();
  if (text === "") return { kind: "refused", reason: "its answer is empty" };
  const forbidden = FORBIDDEN.find(([pattern]) => pattern.test(text));
  if (forbidden !== undefined) return { kind: "refused", reason: `its answer holds ${forbidden[1]}` };
  const body = text + signature(BY_CLAUDE);
  const bytes = Buffer.byteLength(body);
  return bytes > MAX_BODY_BYTES ? { kind: "refused", reason: `its answer takes ${bytes} bytes signed, over ${MAX_BODY_BYTES}` } : { kind: "accepted", body };
}

function withinDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | "late"> {
  const controller = new AbortController();
  return new Promise<T | "late">((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      resolve("late");
    }, ms);
    work(controller.signal)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

type Outcome = { readonly kind: "accepted"; readonly body: string } | { readonly kind: "set-aside"; readonly setAside: SetAside; readonly reason: string };

const setAside = (kind: SetAside, reason: string): Outcome => ({ kind: "set-aside", setAside: kind, reason });

async function claudeOutcome(changes: Changes, automatic: Notification, writer: Writer, deadlineMs: number): Promise<Outcome> {
  const facts = factsOf(changes);
  if (facts === null) return setAside({ kind: "too-many-facts" }, `the facts take over ${MAX_FACTS_BYTES} bytes, even counted`);
  let written: Written | "late";
  try {
    written = await withinDeadline((signal) => writer(promptOf(facts, automatic), signal), deadlineMs);
  } catch (error) {
    return setAside({ kind: "crashed" }, reasonOf(error));
  }
  if (written === "late") return setAside({ kind: "late" }, `gave no answer within ${deadlineMs / 1000} s`);
  if (written.kind === "failed") return setAside({ kind: "failed", failure: written.failure }, written.reason);
  const checked = signedByClaude(written.text);
  return checked.kind === "accepted" ? checked : setAside({ kind: "unusable" }, checked.reason);
}

export type NewsDeps = { readonly writer: Writer | null; readonly log: (line: string) => void; readonly deadlineMs?: number };

// Written by Claude from the computed changes alone; the automatic text stands in, saying why, whenever Claude's cannot be sent.
export async function writtenNews(changes: Changes, { writer, log, deadlineMs = NEWS_DEADLINE_MS }: NewsDeps): Promise<Notification | null> {
  const automatic = newsOf(changes);
  if (automatic === null) return null;
  const outcome = writer === null ? setAside({ kind: "no-key" }, "no ANTHROPIC_API_KEY") : await claudeOutcome(changes, automatic, writer, deadlineMs);
  if (outcome.kind === "accepted") return { ...automatic, body: outcome.body };
  log(`News written automatically, Claude's set aside: ${outcome.reason}`);
  const line = signature(automaticLine(outcome.setAside));
  const fallback = newsOf(changes, MAX_BODY_BYTES - Buffer.byteLength(line)) ?? automatic;
  return { ...fallback, body: fallback.body + line };
}
