import assert from "node:assert/strict"
import { test } from "node:test"
import { parseVoteLabels, parseVotes, type VoteRow } from "./votes.ts"

const CENSURE: VoteRow = {
  vote_id: "VTANR5L17V1",
  number: "1",
  date: "2024-10-08",
  title:
    "la motion de censure déposée en application de l'article 49, alinéa 2, de la Constitution par M. Boris Vallaud, Mme Mathilde Panot, Mme Cyrielle Chatelain, M. André Chassaigne et 188 de leurs collègues.",
  kind: "censure_motion",
  result: "rejected",
  major: "yes",
  bill: "",
  file: "deputies/votes/other.csv",
  url: "https://www.assemblee-nationale.fr/dyn/17/scrutins/1",
}

const BUDGET: VoteRow = {
  vote_id: "VTANR5L17V3936",
  number: "3936",
  date: "2025-11-18",
  title: "l'ensemble du projet de loi de finances de fin de gestion pour 2025 (première lecture).",
  kind: "ordinary",
  result: "rejected",
  major: "no",
  bill: "projet de loi de finances de fin de gestion pour 2025",
  file: "deputies/votes/projet-de-loi-de-finances-de-fin-de-gestion-pour-2025.csv",
  url: "https://www.assemblee-nationale.fr/dyn/17/scrutins/3936",
}

const KINDS = [
  { value: "ordinary", label_fr: "Scrutin public ordinaire" },
  { value: "solemn", label_fr: "Scrutin public solennel" },
  { value: "censure_motion", label_fr: "Motion de censure" },
]

const RESULTS = [
  { value: "adopted", label_fr: "Adopté" },
  { value: "rejected", label_fr: "Rejeté" },
]

test("a votes.csv row reads its number, its yes/no major flag and an empty bill as none", () => {
  const [censure, budget] = parseVotes([CENSURE, BUDGET])
  assert.deepEqual([censure?.number, censure?.major, censure?.bill], [1, true, null])
  assert.deepEqual([budget?.number, budget?.major, budget?.bill], [3936, false, "projet de loi de finances de fin de gestion pour 2025"])
})

test("a row with an unknown kind, result or flag, a malformed id, number or date, or a repeated id is rejected", () => {
  const broken: Partial<VoteRow>[] = [
    { kind: "motion" },
    { result: "adopté" },
    { major: "oui" },
    { vote_id: "1" },
    { number: "0" },
    { date: "08/10/2024" },
    { file: "" },
  ]
  for (const change of broken) assert.throws(() => parseVotes([{ ...CENSURE, ...change }]), JSON.stringify(change))
  assert.throws(() => parseVotes([CENSURE, CENSURE]), /listed twice/)
})

test("kind and result labels come from their values tables, which must name every value and no other", () => {
  const labels = parseVoteLabels(KINDS, "votes/values/kind.csv", RESULTS, "votes/values/result.csv")
  assert.equal(labels.kind.censure_motion, "Motion de censure")
  assert.equal(labels.result.adopted, "Adopté")
  assert.throws(() => parseVoteLabels(KINDS.slice(1), "kind.csv", RESULTS, "result.csv"), /no row for "ordinary"/)
  assert.throws(() => parseVoteLabels(KINDS, "kind.csv", [...RESULTS, { value: "withdrawn", label_fr: "Retiré" }], "result.csv"), /unknown value/)
})
