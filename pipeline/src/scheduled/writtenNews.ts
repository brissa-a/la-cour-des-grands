import { reasonOf } from "../publication/publish.ts";
import type { Prompt, Writer } from "./claude.ts";
import { type Changes, newsOf } from "./news.ts";
import { NEWS_PROMPT } from "./newsPrompt.ts";
import { MAX_BODY_BYTES, type Notification } from "./ntfy.ts";

export const BY_CLAUDE = "Rédigé par Claude à partir des données de l'Assemblée.";
export const AUTOMATIC = "Résumé automatique à partir des données de l'Assemblée.";
export const NEWS_DEADLINE_MS = 60_000;

const signature = (line: string): string => `\n\n_${line}_`;

export function promptOf(changes: Changes, automatic: Notification): Prompt {
  return {
    system: NEWS_PROMPT,
    user: `Faits (JSON) :\n${JSON.stringify(changes)}\n\nTitre déjà affiché : ${automatic.title}\n\nVersion automatique :\n${automatic.body}`,
  };
}

export type Checked = { readonly kind: "accepted"; readonly body: string } | { readonly kind: "refused"; readonly reason: string };

// Claude's answer is untrusted: whatever it holds, the body sent is well-formed text within ntfy's limit, signed, or none.
export function signedByClaude(answer: string): Checked {
  if (!answer.isWellFormed()) return { kind: "refused", reason: "its answer is not well-formed text" };
  const text = answer
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{Cc}\n\t]/gu, "")
    .trim();
  if (text === "") return { kind: "refused", reason: "its answer is empty" };
  const body = text + signature(BY_CLAUDE);
  const bytes = Buffer.byteLength(body);
  return bytes > MAX_BODY_BYTES ? { kind: "refused", reason: `its answer takes ${bytes} bytes signed, over ${MAX_BODY_BYTES}` } : { kind: "accepted", body };
}

function withinDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`gave no answer within ${ms / 1000} s`));
    }, ms);
    work(controller.signal)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

export type NewsDeps = { readonly writer: Writer | null; readonly log: (line: string) => void; readonly deadlineMs?: number };

// Written by Claude from the computed changes alone; the automatic text stands in whenever Claude's cannot be sent.
export async function writtenNews(changes: Changes, { writer, log, deadlineMs = NEWS_DEADLINE_MS }: NewsDeps): Promise<Notification | null> {
  const automatic = newsOf(changes, MAX_BODY_BYTES - Buffer.byteLength(signature(AUTOMATIC)));
  if (automatic === null) return null;
  const fallback = { ...automatic, body: automatic.body + signature(AUTOMATIC) };
  if (writer === null) return fallback;
  let checked: Checked;
  try {
    checked = signedByClaude(await withinDeadline((signal) => writer(promptOf(changes, automatic), signal), deadlineMs));
  } catch (error) {
    checked = { kind: "refused", reason: reasonOf(error) };
  }
  if (checked.kind === "accepted") return { ...automatic, body: checked.body };
  log(`News written automatically, Claude's set aside: ${checked.reason}`);
  return fallback;
}
