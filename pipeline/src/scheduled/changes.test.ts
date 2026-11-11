import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test } from "node:test";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import { readChanges, scopeOf } from "./changes.ts";

const VOTES_HEADER = "vote_id,number,date,title,kind,result,major,bill,file,url";
const DEPUTIES_HEADER = "deputy_id,photo,last_name,first_name,civility,birth_date,age,in_office,constituency,region,department,department_number,constituency_number,mandate_periods,group";
const GROUPS = "value,label_fr,short_fr,color\nRassemblement National,Rassemblement National,RN,#313567\nNon inscrit,Non inscrit,NI,#8D949A\n";
const BILL = "projet de loi relatif à la résilience";
const BILL_FILE = "deputies/votes/projet-de-loi-relatif-a-la-resilience.csv";

const vote = (n: number, title: string, kind: string, result: string, bill: string, file = BILL_FILE) =>
  `VTANR5L17V${n},${n},2026-11-${String(n % 30).padStart(2, "0")},"${title}",${kind},${result},no,"${bill}",${file},https://example.org/${n}`;

const deputy = (id: string, last: string, first: string, inOffice: string, constituency: string, group: string) =>
  `${id},,${last},${first},M.,1970-01-01,56,${inOffice},83-${constituency},Provence-Alpes-Côte d'Azur,Var,83,${constituency},2024-07-08/,${group}`;

async function snapshot(files: Readonly<Record<string, string>>): Promise<string> {
  const dir = await temporaryDir();
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(`${dir}/${file}`), { recursive: true });
    await writeFile(`${dir}/${file}`, content);
  }
  return dir;
}

const lines = (...rows: string[]) => rows.join("\n") + "\n";

const PREVIOUS = {
  "votes/votes.csv": lines(VOTES_HEADER, vote(1, "l'article premier", "ordinary", "adopted", BILL)),
  "deputies/init.csv": lines(
    DEPUTIES_HEADER,
    deputy("PA1", "Boccaletti", "Frédéric", "yes", "7", "Rassemblement National"),
    deputy("PA2", "Reste", "Jean", "yes", "1", "Rassemblement National"),
    deputy("PA3", "Part", "Paul", "yes", "2", "Non inscrit"),
    deputy("PA4", "Ancien", "Luc", "no", "3", ""),
  ),
  "deputies/values/group.csv": GROUPS,
};

const CURRENT = {
  "votes/votes.csv": lines(
    VOTES_HEADER,
    vote(1, "l'article premier", "ordinary", "adopted", BILL),
    vote(2, "l'ensemble du projet de loi relatif à la résilience (première lecture).", "solemn", "adopted", BILL),
    vote(3, "l'amendement n° 3", "ordinary", "rejected", BILL),
    vote(4, "la motion de censure déposée par Mme X et 90 députés.", "censure_motion", "rejected", "", "deputies/votes/other.csv"),
    vote(5, "la première partie du projet de loi relatif à la résilience", "solemn", "rejected", BILL),
    vote(6, "la motion de rejet préalable du projet de loi relatif à la résilience", "ordinary", "rejected", BILL),
    vote(17, "la demande de suspension", "ordinary", "adopted", ""),
  ),
  [BILL_FILE]: lines("deputy_id,VTANR5L17V1,VTANR5L17V2,VTANR5L17V3,VTANR5L17V5,VTANR5L17V6", "PA2,for,for,,against,for", "PA3,against,abstain,for,against,", "PA5,for,against,absent,for,against", "PA6,,for,not_voting,,abstain"),
  "deputies/votes/other.csv": lines("deputy_id,VTANR5L17V4,VTANR5L17V17", "PA2,for,for", "PA3,,for", "PA5,not_voting,", "PA6,for,"),
  "deputies/init.csv": lines(
    DEPUTIES_HEADER,
    deputy("PA1", "Boccaletti", "Frédéric", "no", "7", "Rassemblement National"),
    deputy("PA2", "Reste", "Jean", "yes", "1", "Non inscrit"),
    deputy("PA4", "Ancien", "Luc", "no", "3", ""),
    deputy("PA5", "Delyon", "Isabelle", "yes", "7", "Rassemblement National"),
    deputy("PA6", "Neuve", "Anne", "yes", "4", ""),
  ),
  "deputies/values/group.csv": GROUPS,
};

test("what a version brings is read from both versions: its new votes with their outcome, the figures of those that matter, and its deputies' moves", async () => {
  const changes = await readChanges(await snapshot(PREVIOUS), await snapshot(CURRENT));
  assert.deepEqual(changes, {
    votes: [
      { id: "VTANR5L17V2", number: 2, date: "2026-11-02", title: "l'ensemble du projet de loi relatif à la résilience (première lecture).", result: "adopted", bill: BILL, scope: "whole_text", tally: { for: 2, against: 1, abstain: 1 } },
      { id: "VTANR5L17V3", number: 3, date: "2026-11-03", title: "l'amendement n° 3", result: "rejected", bill: BILL, scope: "amendment" },
      { id: "VTANR5L17V4", number: 4, date: "2026-11-04", title: "la motion de censure déposée par Mme X et 90 députés.", result: "rejected", bill: null, scope: "censure", tally: { for: 2, against: 0, abstain: 0 } },
      { id: "VTANR5L17V5", number: 5, date: "2026-11-05", title: "la première partie du projet de loi relatif à la résilience", result: "rejected", bill: BILL, scope: "solemn", tally: { for: 1, against: 2, abstain: 0 } },
      { id: "VTANR5L17V6", number: 6, date: "2026-11-06", title: "la motion de rejet préalable du projet de loi relatif à la résilience", result: "rejected", bill: BILL, scope: "motion", tally: { for: 1, against: 1, abstain: 1 } },
      { id: "VTANR5L17V17", number: 17, date: "2026-11-17", title: "la demande de suspension", result: "adopted", bill: null, scope: "other" },
    ],
    deputies: [
      {
        kind: "replacement",
        arrived: { id: "PA5", name: "Isabelle Delyon", group: "RN", constituency: { department: "Var", number: "7" } },
        left: { id: "PA1", name: "Frédéric Boccaletti", group: "RN", constituency: { department: "Var", number: "7" } },
      },
      { kind: "arrival", deputy: { id: "PA6", name: "Anne Neuve", group: null, constituency: { department: "Var", number: "4" } } },
      { kind: "departure", deputy: { id: "PA3", name: "Paul Part", group: "NI", constituency: { department: "Var", number: "2" } } },
      { kind: "group", deputy: { id: "PA2", name: "Jean Reste", group: "NI", constituency: { department: "Var", number: "1" } }, from: "RN" },
    ],
  });
});

test("two versions alike bring nothing", async () => {
  assert.deepEqual(await readChanges(await snapshot(CURRENT), await snapshot(CURRENT)), { votes: [], deputies: [] });
});

test("a version whose files contradict the format is refused rather than told: unknown values, a vote without positions, a path out of the snapshot", async () => {
  const previous = await snapshot(PREVIOUS);
  const broken = async (file: keyof typeof CURRENT, edit: (content: string) => string) => readChanges(previous, await snapshot({ ...CURRENT, [file]: edit(CURRENT[file]) }));
  await assert.rejects(broken("votes/votes.csv", (c) => c.replace(",solemn,", ",secret,")), /Unknown VTANR5L17V2 kind: secret/);
  await assert.rejects(broken("votes/votes.csv", (c) => c.replace(",rejected,", ",withdrawn,")), /Unknown VTANR5L17V3 result: withdrawn/);
  for (const number of ["three", "-3", "3.5", ""]) await assert.rejects(broken("votes/votes.csv", (c) => c.replace("V3,3,", `V3,${number},`)), new RegExp(`VTANR5L17V3 number is not a count: ${number}$`));
  await assert.rejects(broken("votes/votes.csv", (c) => c.replace("deputies/votes/other.csv", "../other.csv")), /Not a path inside a snapshot/);
  await assert.rejects(broken(BILL_FILE, (c) => c.replace(",VTANR5L17V2,", ",VTANR5L17V9,")), /Missing column VTANR5L17V2/);
  await assert.rejects(broken("deputies/init.csv", (c) => c.replace("PA6,,Neuve,Anne,M.,1970-01-01,56,yes", "PA6,,Neuve,Anne,M.,1970-01-01,56,maybe")), /Unknown PA6 in_office: maybe/);
});

test("a vote is placed by its kind, then by the first words of its title", () => {
  const cases = [
    ["censure_motion", "la motion de censure", "censure"],
    ["solemn", "l'ensemble du projet de loi", "whole_text"],
    ["ordinary", "L'ensemble de la proposition de loi", "whole_text"],
    ["solemn", "la proposition de loi apportant une réponse", "whole_text"],
    ["ordinary", "la proposition de résolution tendant à", "whole_text"],
    ["ordinary", "le projet de loi constitutionnelle", "whole_text"],
    ["ordinary", "la demande sur l'ensemble de la proposition de loi", "other"],
    ["solemn", "la première partie du projet de loi de finances", "solemn"],
    ["ordinary", "la motion de rejet préalable", "motion"],
    ["ordinary", "l'article 5 bis", "article"],
    ["ordinary", "l'amendement n° 3", "amendment"],
    ["ordinary", "le sous-amendement n° 405", "amendment"],
    ["ordinary", "les amendements identiques n° 1 et 2", "amendment"],
    ["ordinary", "l'amendementier", "other"],
    ["ordinary", "la demande de vote sur les amendements", "other"],
    ["ordinary", "la demande de constitution d'une commission spéciale", "other"],
  ] as const;
  for (const [kind, title, scope] of cases) assert.equal(scopeOf(kind, title), scope, title);
});
