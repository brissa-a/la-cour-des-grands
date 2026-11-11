import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDate } from "../core/types.ts";
import { deputyId } from "../jobs/deputies.ts";
import { voteId } from "../jobs/votes.ts";
import { md } from "./markdown.ts";
import { type BulkScope, type DeputyChange, type HeadlineScope, type Member, type NewVote, type Tally, type VoteResult, datesText, fitted, newsOf } from "./news.ts";
import { MAX_BODY_BYTES } from "./ntfy.ts";

const BILL = "projet de loi relatif à la résilience des infrastructures critiques";
const OTHER_BILL = "proposition de loi visant à protéger les forêts";

let numbered = 9000;

type Facts = { readonly result?: VoteResult; readonly bill?: string | null; readonly date?: string };

function facts(title: string, { result = "adopted", bill = BILL, date = "2026-11-09" }: Facts) {
  numbered += 1;
  return { id: voteId(`VTANR5L17V${numbered}`), number: numbered, date: isoDate(date), title, result, bill };
}

const bulk = (scope: BulkScope, title: string, options: Facts = {}): NewVote => ({ ...facts(title, options), scope });

const headline = (scope: HeadlineScope, title: string, tally: Tally, options: Facts = {}): NewVote => ({ ...facts(title, options), scope, tally });

const member = (name: string, group: string | null, department = "Var", number = "7"): Member => ({
  id: deputyId(`PA${(numbered += 1)}`),
  name,
  group,
  seat: { department, number },
});

const TALLY: Tally = { for: 312, against: 210, abstain: 15 };

function body(votes: readonly NewVote[], deputies: readonly DeputyChange[] = []): string {
  const news = newsOf({ votes, deputies });
  assert.ok(news !== null);
  return news.body;
}

test("the votes on one text are told together: final vote with its figures and reading, then articles and amendments by outcome", () => {
  const votes = [
    bulk("amendment", `l'amendement n° 303 de M. Sabatou à l'article premier du ${BILL} (première lecture).`, { result: "rejected" }),
    bulk("article", `l'article premier du ${BILL} (première lecture).`),
    bulk("amendment", `l'amendement n° 347 de M. Bothorel à l'article premier du ${BILL} (première lecture).`),
    bulk("amendment", `le sous-amendement n° 405 de M. Latombe du ${BILL} (première lecture).`, { result: "rejected" }),
    bulk("article", `l'article 5 bis du ${BILL} (première lecture).`, { date: "2026-11-10" }),
    headline("whole_text", `l'ensemble du ${BILL} (texte de la commission mixte paritaire).`, TALLY, { date: "2026-11-10" }),
  ];
  assert.equal(
    body(votes),
    [
      "6 scrutins du 9 au 10 novembre 2026",
      "",
      "**Projet de loi relatif à la résilience des infrastructures critiques** · 6 scrutins",
      "- Adopté, 312 pour, 210 contre, 15 abstentions : ensemble du texte (texte de la CMP)",
      "- 2 articles adoptés",
      "- 3 amendements : 1 adopté, 2 rejetés",
    ].join("\n"),
  );
});

test("motions are told in the feminine with the vote that matters to each: a censure by its votes for, with its authors", () => {
  const censure = headline("censure", "la motion de censure déposée en application de l'article 49, alinéa 3, de la Constitution par Mme Mathilde Panot et 90 députés.", { for: 331, against: 0, abstain: 0 }, { bill: null });
  const rejection = headline("motion", `la motion de rejet préalable, déposée par Mme Mathilde Panot, du ${OTHER_BILL} (première lecture).`, { for: 126, against: 247, abstain: 1 }, { bill: OTHER_BILL, result: "rejected" });
  const single = bulk("other", "la demande de constitution d'une commission spéciale.", { bill: null, result: "rejected" });
  assert.deepEqual(body([single, rejection, censure]).split("\n\n").slice(1), [
    "**Motion de censure (49.3)**\n- Adoptée, 331 voix pour\n- Déposée par Mme Mathilde Panot et 90 députés",
    "**Proposition de loi visant à protéger les forêts**\n- Rejetée, 126 pour, 247 contre, 1 abstention : la motion de rejet préalable, déposée par Mme Mathilde Panot",
    "**La demande de constitution d'une commission spéciale.**\n- Rejeté",
  ]);
});

test("subjects come by importance: a final vote, then a censure, a solemn vote, a motion, then the changes of deputies, then the rest by size", () => {
  const spread = bulk("article", "l'article 1", { bill: "projet de loi sur le vent" });
  const older = bulk("article", "l'article 9", { bill: "projet de loi sur la terre" });
  const article = bulk("article", "l'article 2", { bill: "projet de loi sur l'eau" });
  const terraces = bulk("article", "l'article 3", { bill: "projet de loi sur les terrasses" });
  const gardens = bulk("article", "l'article 4", { bill: "projet de loi sur les jardins" });
  const moreTerraces = bulk("article", "l'article 5", { bill: "projet de loi sur les terrasses" });
  const stillSpread = bulk("article", "l'article 2", { bill: "projet de loi sur le vent" });
  const amendments = [1, 2, 3].map((n) => bulk("amendment", `l'amendement n° ${n}`, { bill: "projet de loi de finances pour 2027" }));
  const late = bulk("amendment", "l'amendement n° 4", { bill: "projet de loi sur le feu" });
  const motion = headline("motion", "la motion de renvoi en commission", TALLY, { bill: "projet de loi sur l'air" });
  const solemn = headline("solemn", "la première partie du projet de loi de finances pour 2026", TALLY, { bill: "projet de loi de finances pour 2026" });
  const censure = headline("censure", "la motion de censure", TALLY, { bill: null });
  const final = headline("whole_text", "l'ensemble du projet de loi sur le feu", TALLY, { bill: "projet de loi sur le feu" });
  const deputies: DeputyChange[] = [{ kind: "arrival", deputy: member("Isabelle Delyon", "RN") }];
  const headings = body([spread, older, article, terraces, gardens, stillSpread, moreTerraces, ...amendments, motion, solemn, censure, final, late], deputies)
    .split("\n\n")
    .slice(1)
    .map((block) => block.split("\n")[0]);
  assert.deepEqual(headings, [
    "**Projet de loi sur le feu** · 2 scrutins",
    "**Motion de censure**",
    "**Projet de loi de finances pour 2026**",
    "**Projet de loi sur l'air**",
    "**Députés**",
    "**Projet de loi de finances pour 2027** · 3 scrutins",
    "**Projet de loi sur le vent** · 2 scrutins",
    "**Projet de loi sur les terrasses** · 2 scrutins",
    "**Projet de loi sur les jardins**",
    "**Projet de loi sur l'eau**",
    "**Projet de loi sur la terre**",
  ]);
});

test("each vote that matters is labelled by what the title says before the text, its reading, or its kind", () => {
  const lines = (vote: NewVote) => body([vote]).split("\n").slice(3);
  const bill = "proposition de loi sur la mer";
  assert.deepEqual(lines(headline("whole_text", `l'ensemble de la ${bill}`, { for: 53, against: 0, abstain: 0 }, { bill })), ["- Adopté, 53 pour, 0 contre : ensemble du texte"]);
  assert.deepEqual(lines(headline("whole_text", `la ${bill} (lecture définitive)`, TALLY, { bill })), ["- Adopté, 312 pour, 210 contre, 15 abstentions : ensemble du texte (lecture définitive)"]);
  assert.deepEqual(lines(headline("solemn", `la première partie de la ${bill} (première lecture).`, TALLY, { bill })), ["- Adopté, 312 pour, 210 contre, 15 abstentions : la première partie"]);
  assert.deepEqual(lines(headline("motion", `la motion de rejet préalable, déposée par Mme de la Tour, du ${bill}`, TALLY, { bill, result: "rejected" })), [
    "- Rejetée, 312 pour, 210 contre, 15 abstentions : la motion de rejet préalable, déposée par Mme de la Tour",
  ]);
  assert.deepEqual(lines(headline("solemn", `${bill} (vote solennel)`, TALLY, { bill })), [`- Adopté, 312 pour, 210 contre, 15 abstentions : ${bill} (vote solennel)`]);
  assert.deepEqual(lines(headline("censure", `la motion de censure sur la ${bill}`, { for: 120, against: 0, abstain: 0 }, { bill, result: "rejected" })), ["- Rejetée, 120 voix pour : motion de censure"]);
  assert.deepEqual(body([headline("solemn", "la déclaration du Gouvernement sur l'*Europe*", TALLY, { bill: null })]).split("\n\n")[1], "**La déclaration du Gouvernement sur l'\\*Europe\\***\n- Adopté, 312 pour, 210 contre, 15 abstentions");
  assert.deepEqual(body([headline("censure", "la motion de censure par M. Untel et 57 députés", { for: 12, against: 0, abstain: 0 }, { bill: null, result: "rejected" })]).split("\n\n")[1], "**Motion de censure**\n- Rejetée, 12 voix pour\n- Déposée par M. Untel et 57 députés");
});

test("the other votes on a text are counted by kind, in the singular for one, by outcome when they differ, as plain votes when they are all there is", () => {
  const lines = (votes: readonly NewVote[]) => body(votes).split("\n").slice(3);
  assert.deepEqual(lines([bulk("other", "la demande n° 1", { result: "rejected" }), bulk("other", "la demande n° 2", { result: "rejected" })]), ["- 2 scrutins rejetés"]);
  assert.deepEqual(lines([bulk("article", "l'article 1")]), ["- 1 article adopté"]);
  assert.deepEqual(lines([bulk("other", "la demande n° 4")]), ["- 1 scrutin adopté"]);
  assert.deepEqual(lines([bulk("article", "l'article 4"), bulk("other", "la demande n° 5"), bulk("other", "la demande n° 6")]), ["- 1 article adopté", "- 2 autres scrutins adoptés"]);
  assert.deepEqual(
    lines([
      bulk("article", "l'article 3", { result: "rejected" }),
      bulk("amendment", "l'amendement n° 1", { result: "rejected" }),
      bulk("article", "l'article 1"),
      bulk("other", "la demande n° 3"),
      bulk("article", "l'article 2"),
    ]),
    ["- 3 articles : 2 adoptés, 1 rejeté", "- 1 amendement rejeté", "- 1 autre scrutin adopté"],
  );
});

test("a text with many votes that matter lists four of them, the most important first, and counts the others", () => {
  const motions = [1, 2, 3, 4].map((n) => headline("motion", `la motion n° ${n}`, TALLY, { result: "rejected" }));
  const final = headline("whole_text", `l'ensemble du ${BILL} (première lecture).`, TALLY);
  const lines = body([...motions.toReversed(), final]).split("\n").slice(2);
  assert.deepEqual(lines, [
    "**Projet de loi relatif à la résilience des infrastructures critiques** · 5 scrutins",
    "- Adopté, 312 pour, 210 contre, 15 abstentions : ensemble du texte (première lecture)",
    "- Rejetée, 312 pour, 210 contre, 15 abstentions : la motion n° 1",
    "- Rejetée, 312 pour, 210 contre, 15 abstentions : la motion n° 2",
    "- Rejetée, 312 pour, 210 contre, 15 abstentions : la motion n° 3",
    "- 1 autre scrutin rejeté",
  ]);
});

test("deputies who come and go are told by name, group and seat: a newcomer on the seat of one who left replaces them", () => {
  const left = member("Frédéric Boccaletti", "RN");
  const deputies: DeputyChange[] = [
    { kind: "replacement", arrived: member("Isabelle Delyon", "RN"), left },
    { kind: "arrival", deputy: member("Anne Neuve", null, "Français établis hors de France", "1") },
    { kind: "departure", deputy: member("Paul Parti", "LIOT", "Corse", "") },
    { kind: "group", deputy: member("Jean Change", "NI"), from: "LIOT" },
    { kind: "group", deputy: member("Marie Sans", null), from: "EPR" },
  ];
  const news = newsOf({ votes: [], deputies });
  assert.ok(news !== null);
  assert.equal(news.title, "Assemblée : 1 député remplacé, 1 arrivée, 1 départ, 2 changements de groupe");
  assert.equal(
    news.body,
    [
      "**Députés**",
      "- Isabelle Delyon (RN) remplace Frédéric Boccaletti (RN), Var, 7e circ.",
      "- Anne Neuve entre à l'Assemblée, Français établis hors de France, 1re circ.",
      "- Paul Parti (LIOT) quitte l'Assemblée, Corse",
      "- Jean Change : LIOT → NI",
      "- Marie Sans : EPR → sans groupe",
    ].join("\n"),
  );
  const arrivals = (length: number) => newsOf({ votes: [], deputies: Array.from({ length }, (): DeputyChange => ({ kind: "arrival", deputy: member("A B", null) })) })?.body.split("\n");
  assert.deepEqual(arrivals(11)?.slice(-2), ["- A B entre à l'Assemblée, Var, 7e circ.", "- et 3 autres changements"]);
  assert.deepEqual(arrivals(9)?.slice(-1), ["- et 1 autre changement"]);
  assert.equal(arrivals(8)?.length, 9);
});

test("the news has a short title of what is new, goes to its own topic in Markdown, and is not sent when nothing is new", () => {
  const news = newsOf({ votes: [bulk("article", "l'article 2")], deputies: [] });
  assert.ok(news !== null);
  assert.deepEqual({ ...news, body: "" }, {
    topic: "news",
    priority: 3,
    title: "Assemblée : 1 scrutin",
    body: "",
    tags: ["classical_building"],
    markdown: true,
  });
  assert.equal(news.body.split("\n")[0], "1 scrutin le 9 novembre 2026");
  assert.equal(newsOf({ votes: [], deputies: [] }), null);
});

test("dates are said in French, the year once when it does not change", () => {
  assert.equal(datesText(isoDate("2026-11-01"), isoDate("2026-11-01")), "le 1er novembre 2026");
  assert.equal(datesText(isoDate("2026-11-09"), isoDate("2026-11-10")), "du 9 au 10 novembre 2026");
  assert.equal(datesText(isoDate("2026-10-30"), isoDate("2026-11-02")), "du 30 octobre au 2 novembre 2026");
  assert.equal(datesText(isoDate("2026-12-30"), isoDate("2027-01-02")), "du 30 décembre 2026 au 2 janvier 2027");
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  months.forEach((month, i) => assert.equal(datesText(isoDate(`2026-${String(i + 1).padStart(2, "0")}-15`), isoDate(`2026-${String(i + 1).padStart(2, "0")}-15`)), `le 15 ${month} 2026`));
});

const HOSTILE = "**Loi** _sur_ `le` [code](x) \\ 😀 é ";

// Each line must close every bold it opens: an escaped star is not one.
const balanced = (line: string): boolean => (line.replace(/\\./g, "").match(/\*\*/g) ?? []).length % 2 === 0;

test("whatever the votes, the body stays within ntfy's message size, whole characters and whole Markdown, the subjects left out counted", () => {
  for (const subjects of [1, 3, 40, 400, 3000]) {
    for (const repeat of [1, 30, 400]) {
      const votes = Array.from({ length: subjects }, (_, i) => {
        const bill = `${HOSTILE.repeat(repeat)}${i}`;
        return i % 2 === 0
          ? headline("whole_text", `l'ensemble du ${bill} (${HOSTILE.repeat(repeat)} lecture)`, TALLY, { bill })
          : headline("censure", `la motion de censure par ${HOSTILE.repeat(repeat)}.`, TALLY, { bill: null });
      });
      const deputies = Array.from({ length: subjects }, (): DeputyChange => ({ kind: "arrival", deputy: member(HOSTILE.repeat(repeat), HOSTILE.repeat(repeat), HOSTILE.repeat(repeat)) }));
      const text = body(votes, deputies);
      const what = `${subjects} subjects, text ×${repeat}`;
      assert.ok(Buffer.byteLength(text) <= MAX_BODY_BYTES, `${what}: ${Buffer.byteLength(text)} bytes`);
      assert.ok(text.isWellFormed(), what);
      assert.ok(text.split("\n").every(balanced), what);
      const blocks = text.split("\n\n").slice(1);
      const told = blocks.filter((b) => b.startsWith("**")).length;
      const counted = /^… et (\d+) autres? sujets?$/.exec(blocks.at(-1) ?? "")?.[1];
      assert.ok(told >= 1, what);
      assert.equal(told + Number(counted ?? 0), subjects + 1, what);
    }
  }
});

test("blocks are kept whole: all of them when they fit, else each while it fits with the line that counts the others, said in the singular for one", () => {
  const block = (letter: string, length = 10) => md`${letter.repeat(length)}`;
  const five = ["a", "b", "c", "d", "e"].map((letter) => block(letter));
  const told = (...letters: string[]) => letters.map((letter) => letter.repeat(10));
  assert.equal(fitted([], five, 58), told("a", "b", "c", "d", "e").join("\n\n"));
  assert.equal(fitted([], five, 57), [...told("a", "b"), "… et 3 autres sujets"].join("\n\n"));
  assert.equal(fitted([], five, 46), [...told("a", "b"), "… et 3 autres sujets"].join("\n\n"));
  assert.equal(fitted([], five, 45), [...told("a"), "… et 4 autres sujets"].join("\n\n"));
  assert.equal(fitted([], five, 33), "… et 5 autres sujets");
  assert.equal(fitted([], [block("a"), block("b"), block("c", 1)], 25), "aaaaaaaaaa\n\nbbbbbbbbbb\n\nc");
  assert.equal(fitted([], [block("a"), block("b", 30)], 32), "aaaaaaaaaa\n\n… et 1 autre sujet");
  assert.equal(fitted([], [block("a"), block("b", 30)], 31), "… et 2 autres sujets");
  assert.equal(fitted([], [block("a"), block("b"), block("c", 30)], 44), [...told("a", "b"), "… et 1 autre sujet"].join("\n\n"));
  const thirty = ["a", "b", "c"].map((letter) => block(letter, 30));
  assert.equal(fitted([block("i", 1)], thirty, 57), `i\n\n${"a".repeat(30)}\n\n… et 2 autres sujets`);
  assert.equal(fitted([block("i", 1)], thirty, 56), "i\n\n… et 3 autres sujets");
  assert.equal(fitted([block("intro", 1)], [block("a")], 17), "intro\n\naaaaaaaaaa");
  assert.equal(fitted([block("intro", 1)], [block("a", 30)], 36), "intro\n\n… et 1 autre sujet");
});
