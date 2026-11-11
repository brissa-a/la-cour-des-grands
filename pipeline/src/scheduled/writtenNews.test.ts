import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDate } from "../core/types.ts";
import { deputyId } from "../jobs/deputies.ts";
import { voteId } from "../jobs/votes.ts";
import type { Prompt, Writer, Written } from "./claude.ts";
import { type Changes, type DeputyChange, type NewVote, newsOf } from "./news.ts";
import { NEWS_PROMPT } from "./newsPrompt.ts";
import { MAX_BODY_BYTES } from "./ntfy.ts";
import { BY_CLAUDE, MAX_FACTS_BYTES, countedFacts, factsOf, promptOf, signedByClaude, writtenNews } from "./writtenNews.ts";

const vote = (n: number, title = `l'amendement n° ${n} sur la forêt`, bill: string | null = "projet de loi sur la forêt"): NewVote => ({
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
  deputies: [{ kind: "group", deputy: { id: deputyId("PA1"), name: "Jeanne Martin", group: "NI", constituency: { department: "Var", number: "7" } }, from: "LIOT" }],
};

const SIGNED_BY_CLAUDE = `\n\n_${BY_CLAUDE}_`;
const signedAutomatic = (cause: string): string => `\n\n_Résumé automatique à partir des données de l'Assemblée, sans Claude : ${cause}._`;

function automaticBody(changes: Changes, cause: string): string {
  const news = newsOf(changes, MAX_BODY_BYTES - Buffer.byteLength(signedAutomatic(cause)));
  assert.ok(news !== null);
  return news.body + signedAutomatic(cause);
}

const text = (answer: string): Promise<Written> => Promise.resolve({ kind: "text", text: answer });

function writing(answer: (prompt: Prompt, signal: AbortSignal) => Promise<Written>) {
  const prompts: Prompt[] = [];
  const logged: string[] = [];
  const writer: Writer = (prompt, signal) => {
    prompts.push(prompt);
    return answer(prompt, signal);
  };
  return { writer, prompts, logged, log: (line: string) => logged.push(line) };
}

test("Claude's answer becomes the body, signed as written by Claude, under the title and topic of the automatic news", async () => {
  const { writer, log, logged } = writing(() => text("\n**Projet de loi sur la forêt** : adopté, 300 pour, 200 contre.\n"));
  const news = await writtenNews(CHANGES, { writer, log });
  const automatic = newsOf(CHANGES);
  assert.ok(news !== null && automatic !== null);
  assert.deepEqual(news, { ...automatic, body: `**Projet de loi sur la forêt** : adopté, 300 pour, 200 contre.${SIGNED_BY_CLAUDE}` });
  assert.deepEqual(logged, []);
});

test("Claude is given the system prompt and, as its only message, the computed changes, the title shown and the automatic text, nothing else", async () => {
  const { writer, prompts, log } = writing(() => text("Texte."));
  await writtenNews(CHANGES, { writer, log });
  const automatic = newsOf(CHANGES);
  assert.ok(automatic !== null);
  assert.deepEqual(prompts, [
    {
      system: NEWS_PROMPT,
      user: `Faits (JSON) :\n${JSON.stringify(CHANGES)}\n\nTitre déjà affiché : Assemblée : 3 scrutins, 1 changement de groupe\n\nVersion automatique :\n${automatic.body}`,
    },
  ]);
  const [facts = ""] = /^Faits \(JSON\) :\n(.*)$/m.exec(prompts[0]?.user ?? "")?.slice(1) ?? [];
  assert.deepEqual(JSON.parse(facts), JSON.parse(JSON.stringify(CHANGES)));
  assert.deepEqual(promptOf(JSON.stringify(CHANGES), automatic), prompts[0]);
});

function keysOf(json: string): Set<string> {
  const keys = new Set<string>();
  JSON.parse(json, (key, value: unknown) => {
    if (!/^\d*$/.test(key)) keys.add(key);
    return value;
  });
  return keys;
}

test("the prompt names every field of the facts Claude is sent, whole or counted", () => {
  const jeanne = { id: deputyId("PA1"), name: "Jeanne Martin", group: "NI", constituency: { department: "Var", number: "7" } };
  const changes: Changes = {
    votes: CHANGES.votes,
    deputies: [{ kind: "replacement", arrived: jeanne, left: jeanne }, { kind: "arrival", deputy: jeanne }, { kind: "departure", deputy: jeanne }, { kind: "group", deputy: jeanne, from: null }],
  };
  const sent = new Set([...keysOf(JSON.stringify(changes)), ...keysOf(JSON.stringify(countedFacts(changes)))]);
  assert.deepEqual([...sent].filter((key) => !new RegExp(`\\b${key}\\b`).test(NEWS_PROMPT)), []);
});

const failed = (failure:Extract<Written, { kind: "failed" }>["failure"], reason: string) => (): Promise<Written> => Promise.resolve({ kind: "failed", failure, reason });

test("without a key, or when Claude fails, gives no answer in time, or answers nothing usable, the automatic text goes out, its signature saying why in a few words, and the reason is logged", async () => {
  const keyless: string[] = [];
  const noKey = await writtenNews(CHANGES, { writer: null, log: (line) => keyless.push(line) });
  assert.equal(noKey?.body, automaticBody(CHANGES, "pas de clé"));
  assert.deepEqual(keyless, ["News written automatically, Claude's set aside: no ANTHROPIC_API_KEY"]);
  const cases: readonly (readonly [(prompt: Prompt, signal: AbortSignal) => Promise<Written>, string, RegExp])[] = [
    [failed({ kind: "status", status: 401 }, "401 invalid x-api-key [ANTHROPIC_API_KEY]"), "clé refusée", /: 401 invalid x-api-key \[ANTHROPIC_API_KEY\]$/],
    [failed({ kind: "status", status: 403 }, "403 forbidden"), "clé refusée", /: 403 forbidden$/],
    [failed({ kind: "status", status: 402 }, "402 billing"), "problème de facturation", /: 402 billing$/],
    [failed({ kind: "status", status: 429 }, "429 rate limited"), "trop de demandes", /: 429 rate limited$/],
    [failed({ kind: "status", status: 529 }, "529 Overloaded"), "erreur HTTP 529", /: 529 Overloaded$/],
    [failed({ kind: "unreachable" }, "Connection error."), "API injoignable", /: Connection error\.$/],
    [failed({ kind: "unfinished" }, "stopped on max_tokens"), "réponse inachevée", /: stopped on max_tokens$/],
    [() => new Promise<Written>(() => undefined), "pas de réponse à temps", /: gave no answer within 0\.02 s$/],
    [() => Promise.reject(new Error("a bug")), "erreur inattendue", /: a bug$/],
    [() => text(" \n\t "), "réponse inutilisable", /: its answer is empty$/],
    [() => text("\u0000\u0007\u001b\u007f\u0085"), "réponse inutilisable", /: its answer is empty$/],
    [() => text("Texte \ud800 coupé"), "réponse inutilisable", /: its answer is not well-formed text$/],
    [() => text("é".repeat(2100)), "réponse inutilisable", /: its answer takes 4263 bytes signed, over 4095$/],
    [() => text("Voir [le texte](https://example.org)."), "réponse inutilisable", /: its answer holds a link or an image$/],
  ];
  for (const [answer, cause, reason] of cases) {
    const { writer, log, logged } = writing(answer);
    const news = await writtenNews(CHANGES, { writer, log, deadlineMs: 20 });
    assert.equal(news?.body, automaticBody(CHANGES, cause), cause);
    assert.equal(logged.length, 1, cause);
    assert.match(logged[0] ?? "", /^News written automatically, Claude's set aside/, cause);
    assert.match(logged[0] ?? "", reason, cause);
  }
});

test("a writer that outlives the deadline is told to stop", async () => {
  const signals: AbortSignal[] = [];
  const { writer, log } = writing((_, signal) => {
    signals.push(signal);
    return new Promise<Written>(() => undefined);
  });
  await writtenNews(CHANGES, { writer, log, deadlineMs: 10 });
  assert.deepEqual(signals.map((s) => s.aborted), [true]);
});

test("an answer holding a link, an image, HTML, a code block, a web address or an invisible formatting character is refused, plain Markdown kept", () => {
  for (const [answer, what] of [
    ["Voir [le texte](https://example.org).", "a link or an image"],
    ["![](http://example.org/x.png)", "a link or an image"],
    ["Adopté <b>300</b> pour.", "HTML"],
    ["```\nAdopté.", "a code block"],
    ["~~~\nAdopté.", "a code block"],
    ["Sur assemblee-nationale.fr ou https://www.assemblee-nationale.fr", "a web address"],
    ["Adopté\u202E.étpodA", "an invisible formatting character"],
    ["Adopté\u200B.", "an invisible formatting character"],
  ] as const) {
    assert.deepEqual(signedByClaude(answer), { kind: "refused", reason: `its answer holds ${what}` }, answer);
  }
  const plain = "**Projet de loi** : adopté, 300 pour, 200 contre.\n- 4 articles [1er, 5 bis] adoptés (première lecture) ; 2 > 1 _ici_";
  assert.deepEqual(signedByClaude(plain), { kind: "accepted", body: plain + SIGNED_BY_CLAUDE });
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

test("the automatic text, signed whatever the cause, stays within 4,095 bytes however much is new", async () => {
  const many: Changes = {
    votes: Array.from({ length: 3000 }, (_, i) => vote(i + 1, `l'amendement ${i}`, `loi ${i}`)),
    deputies: [],
  };
  for (const [writer, cause] of [
    [null, "pas de clé"],
    [writing(() => assert.fail("Claude asked with too many facts")).writer, "trop de nouveautés"],
  ] as const) {
    const news = await writtenNews(many, { writer, log: () => undefined });
    assert.ok(news !== null);
    assert.ok(Buffer.byteLength(news.body) <= MAX_BODY_BYTES, String(Buffer.byteLength(news.body)));
    assert.ok(Buffer.byteLength(news.body) > MAX_BODY_BYTES - 40, String(Buffer.byteLength(news.body)));
    assert.ok(news.body.endsWith(signedAutomatic(cause)), cause);
    assert.match(news.body, /… et \d+ autres sujets\n\n_Résumé automatique/);
  }
});

test("when nothing is new there is no news, and Claude is not asked", async () => {
  const { writer, prompts, log } = writing(() => text("Texte."));
  assert.equal(await writtenNews({ votes: [], deputies: [] }, { writer, log }), null);
  assert.deepEqual(prompts, []);
});

test("articles, amendments and other votes are counted by text and kind, with their first and last dates; whole texts, censures, solemn votes, motions and deputies stay whole", () => {
  const dated = (v: NewVote, date: string): NewVote => ({ ...v, date: isoDate(date) });
  const whole = CHANGES.votes[2];
  assert.ok(whole !== undefined);
  const changes: Changes = {
    votes: [
      dated(vote(1), "2026-11-10"),
      dated(vote(2), "2026-11-08"),
      dated(vote(4), "2026-11-12"),
      dated(vote(10), "2026-11-09"),
      { ...dated(vote(5), "2026-11-09"), scope: "article" },
      dated(vote(6, "l'amendement n° 6", "projet de loi sur l'eau"), "2026-11-11"),
      dated(vote(7, "la demande de suspension", null), "2026-11-07"),
      { ...dated(vote(8, "la demande de clôture", null), "2026-11-06"), scope: "other" },
      whole,
    ],
    deputies: CHANGES.deputies,
  };
  assert.deepEqual(countedFacts(changes), {
    votes: [whole],
    counted: [
      { bill: "projet de loi sur la forêt", scope: "amendment", adopted: 3, rejected: 1, from: "2026-11-08", to: "2026-11-12" },
      { bill: "projet de loi sur la forêt", scope: "article", adopted: 0, rejected: 1, from: "2026-11-09", to: "2026-11-09" },
      { bill: "projet de loi sur l'eau", scope: "amendment", adopted: 1, rejected: 0, from: "2026-11-11", to: "2026-11-11" },
      { bill: null, scope: "amendment", adopted: 0, rejected: 1, from: "2026-11-07", to: "2026-11-07" },
      { bill: null, scope: "other", adopted: 1, rejected: 0, from: "2026-11-06", to: "2026-11-06" },
    ],
    deputies: CHANGES.deputies,
  });
});

test("Claude is sent the facts whole up to 50,000 bytes, counted beyond, and is not asked at all when even counted they would not fit", async () => {
  const one = (title: string): Changes => ({ votes: [vote(1, title)], deputies: [] });
  const room = MAX_FACTS_BYTES - Buffer.byteLength(JSON.stringify(one("")));
  assert.equal(factsOf(one("a".repeat(room))), JSON.stringify(one("a".repeat(room))));
  assert.equal(factsOf(one("a".repeat(room + 1))), JSON.stringify(countedFacts(one("a".repeat(room + 1)))));
  const many: Changes = { votes: Array.from({ length: 400 }, (_, i) => vote(i + 1)), deputies: [] };
  const { writer, prompts, log } = writing(() => text("Texte."));
  await writtenNews(many, { writer, log });
  assert.ok(Buffer.byteLength(JSON.stringify(many)) > MAX_FACTS_BYTES);
  assert.equal(prompts[0]?.user.split("\n")[1], JSON.stringify(countedFacts(many)));
  const member = (i: number) => ({ id: deputyId(`PA${i}`), name: "Jeanne Martin", group: "NI", constituency: { department: "Var", number: "7" } });
  const crowd: Changes = { votes: [], deputies: Array.from({ length: 1000 }, (_, i): DeputyChange => ({ kind: "replacement", arrived: member(i), left: member(i + 1000) })) };
  const overflowing = writing(() => assert.fail("Claude asked with too many facts"));
  const news = await writtenNews(crowd, { writer: overflowing.writer, log: overflowing.log });
  assert.equal(factsOf(crowd), null);
  assert.equal(news?.body, automaticBody(crowd, "trop de nouveautés"));
  assert.deepEqual(overflowing.logged, ["News written automatically, Claude's set aside: the facts take over 50000 bytes, even counted"]);
});
