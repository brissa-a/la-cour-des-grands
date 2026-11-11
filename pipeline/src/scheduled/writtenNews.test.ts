import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDate } from "../core/types.ts";
import { deputyId } from "../jobs/deputies.ts";
import { voteId } from "../jobs/votes.ts";
import type { Prompt, Writer } from "./claude.ts";
import { type Changes, type NewVote, newsOf } from "./news.ts";
import { NEWS_PROMPT } from "./newsPrompt.ts";
import { MAX_BODY_BYTES } from "./ntfy.ts";
import { AUTOMATIC, BY_CLAUDE, promptOf, signedByClaude, writtenNews } from "./writtenNews.ts";

const vote = (n: number, title = `l'amendement n° ${n} sur la forêt`, bill = "projet de loi sur la forêt"): NewVote => ({
  id: voteId(`VTANR5L17V${n}`),
  number: n,
  date: isoDate("2026-11-10"),
  title,
  result: n % 2 === 0 ? "adopted" : "rejected",
  bill,
  scope: "amendment",
});

const CHANGES: Changes = {
  votes: [vote(1), vote(2), { ...vote(3, "l'ensemble du projet de loi sur la forêt (première lecture)"), scope: "whole_text", tally: { for: 300, against: 200, abstain: 7 } }],
  deputies: [{ kind: "group", deputy: { id: deputyId("PA1"), name: "Jeanne Martin", group: "NI", seat: { department: "Var", number: "7" } }, from: "LIOT" }],
};

const SIGNED_BY_CLAUDE = `\n\n_${BY_CLAUDE}_`;
const SIGNED_AUTOMATIC = `\n\n_${AUTOMATIC}_`;

function automaticBody(changes: Changes): string {
  const news = newsOf(changes, MAX_BODY_BYTES - Buffer.byteLength(SIGNED_AUTOMATIC));
  assert.ok(news !== null);
  return news.body + SIGNED_AUTOMATIC;
}

function writing(answer: (prompt: Prompt, signal: AbortSignal) => Promise<string>) {
  const prompts: Prompt[] = [];
  const logged: string[] = [];
  const writer: Writer = (prompt, signal) => {
    prompts.push(prompt);
    return answer(prompt, signal);
  };
  return { writer, prompts, logged, log: (line: string) => logged.push(line) };
}

test("Claude's answer becomes the body, signed as written by Claude, under the title and topic of the automatic news", async () => {
  const { writer, log, logged } = writing(() => Promise.resolve("\n**Projet de loi sur la forêt** : adopté, 300 pour, 200 contre.\n"));
  const news = await writtenNews(CHANGES, { writer, log });
  const automatic = newsOf(CHANGES);
  assert.ok(news !== null && automatic !== null);
  assert.deepEqual(news, { ...automatic, body: `**Projet de loi sur la forêt** : adopté, 300 pour, 200 contre.${SIGNED_BY_CLAUDE}` });
  assert.deepEqual(logged, []);
});

test("Claude is given the system prompt and, as its only message, the computed changes, the title shown and the automatic text, nothing else", async () => {
  const { writer, prompts, log } = writing(() => Promise.resolve("Texte."));
  await writtenNews(CHANGES, { writer, log });
  const automatic = newsOf(CHANGES, MAX_BODY_BYTES - Buffer.byteLength(SIGNED_AUTOMATIC));
  assert.ok(automatic !== null);
  assert.deepEqual(prompts, [
    {
      system: NEWS_PROMPT,
      user: `Faits (JSON) :\n${JSON.stringify(CHANGES)}\n\nTitre déjà affiché : Assemblée : 3 scrutins, 1 changement de groupe\n\nVersion automatique :\n${automatic.body}`,
    },
  ]);
  const [facts = ""] = /^Faits \(JSON\) :\n(.*)$/m.exec(prompts[0]?.user ?? "")?.slice(1) ?? [];
  assert.deepEqual(JSON.parse(facts), JSON.parse(JSON.stringify(CHANGES)));
  assert.deepEqual(promptOf(CHANGES, automatic), prompts[0]);
});

test("without a key, or when Claude fails, gives no answer in time, or answers nothing usable, the automatic text goes out, signed as automatic, and why is logged", async () => {
  const fallback = automaticBody(CHANGES);
  const noKey = await writtenNews(CHANGES, { writer: null, log: () => assert.fail("nothing to log") });
  assert.equal(noKey?.body, fallback);
  const cases: readonly (readonly [string, (prompt: Prompt, signal: AbortSignal) => Promise<string>, RegExp])[] = [
    ["an error", () => Promise.reject(new Error("401 invalid x-api-key [ANTHROPIC_API_KEY]")), /: 401 invalid x-api-key \[ANTHROPIC_API_KEY\]$/],
    ["no answer", () => new Promise<string>(() => undefined), /: gave no answer within 0\.02 s$/],
    ["an empty answer", () => Promise.resolve(" \n\t "), /: its answer is empty$/],
    ["control characters alone", () => Promise.resolve("\u0000\u0007\u001b\u007f\u0085"), /: its answer is empty$/],
    ["a broken answer", () => Promise.resolve("Texte \ud800 coupé"), /: its answer is not well-formed text$/],
    ["a long answer", () => Promise.resolve("é".repeat(2100)), /: its answer takes 4263 bytes signed, over 4095$/],
  ];
  for (const [name, answer, reason] of cases) {
    const { writer, log, logged } = writing(answer);
    const news = await writtenNews(CHANGES, { writer, log, deadlineMs: 20 });
    assert.equal(news?.body, fallback, name);
    assert.equal(logged.length, 1, name);
    assert.match(logged[0] ?? "", /^News written automatically, Claude's set aside/, name);
    assert.match(logged[0] ?? "", reason, name);
  }
});

test("a writer that outlives the deadline is told to stop", async () => {
  const signals: AbortSignal[] = [];
  const { writer, log } = writing((_, signal) => {
    signals.push(signal);
    return new Promise<string>(() => undefined);
  });
  await writtenNews(CHANGES, { writer, log, deadlineMs: 10 });
  assert.deepEqual(signals.map((s) => s.aborted), [true]);
});

test("Claude's answer is kept up to 4,095 bytes once signed, counted in bytes, and refused one byte over", () => {
  const room = MAX_BODY_BYTES - Buffer.byteLength(SIGNED_BY_CLAUDE);
  const fits = `${"é".repeat(Math.floor(room / 2))}${room % 2 === 1 ? "a" : ""}`;
  assert.deepEqual(signedByClaude(fits), { kind: "accepted", body: fits + SIGNED_BY_CLAUDE });
  assert.equal(Buffer.byteLength(fits + SIGNED_BY_CLAUDE), MAX_BODY_BYTES);
  assert.equal(signedByClaude(`${fits}a`).kind, "refused");
  assert.equal(room % 4, 0);
  assert.equal(signedByClaude("🏛".repeat(room / 4)).kind, "accepted");
  assert.equal(signedByClaude(`${"🏛".repeat(room / 4)}a`).kind, "refused");
});

test("an answer empty once its control characters and blanks are gone, or holding a lone surrogate, is refused", () => {
  assert.deepEqual(signedByClaude(" \u0000\n\u0007 "), { kind: "refused", reason: "its answer is empty" });
  assert.deepEqual(signedByClaude("Texte \udc00"), { kind: "refused", reason: "its answer is not well-formed text" });
});

test("Claude's answer is sent as plain lines: Windows and old Mac line ends become newlines, control characters go, tabs and newlines stay", () => {
  assert.deepEqual(signedByClaude("Un\r\ndeux\rtrois\u0000\u001b[31m\u0085\tquatre\n"), { kind: "accepted", body: `Un\ndeux\ntrois[31m\tquatre${SIGNED_BY_CLAUDE}` });
});

test("the automatic text, signed, stays within 4,095 bytes however much is new", async () => {
  const many: Changes = {
    votes: Array.from({ length: 3000 }, (_, i) => vote(i + 1, `l'amendement ${i}`, `loi ${i}`)),
    deputies: [],
  };
  const news = await writtenNews(many, { writer: null, log: () => undefined });
  assert.ok(news !== null);
  assert.ok(Buffer.byteLength(news.body) <= MAX_BODY_BYTES, String(Buffer.byteLength(news.body)));
  assert.ok(Buffer.byteLength(news.body) > MAX_BODY_BYTES - 40, String(Buffer.byteLength(news.body)));
  assert.ok(news.body.endsWith(SIGNED_AUTOMATIC));
  assert.match(news.body, /… et \d+ autres sujets\n\n_Résumé automatique/);
});

test("when nothing is new there is no news, and Claude is not asked", async () => {
  const { writer, prompts, log } = writing(() => Promise.resolve("Texte."));
  assert.equal(await writtenNews({ votes: [], deputies: [] }, { writer, log }), null);
  assert.deepEqual(prompts, []);
});
