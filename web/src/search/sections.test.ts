import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { createVoteSearch, searchVotes } from "../votes/voteSearch.ts"
import { parseVotes } from "../votes/votes.ts"
import { addCommunes, createDeputySearch } from "./deputySearch.ts"
import { votesFirst } from "./sections.ts"

const PANOT = {
  id: deputyId("PA720892"),
  last_name: "Panot",
  first_name: "Mathilde",
  department: "Val-de-Marne",
  department_number: "94",
  constituency_number: "10",
  group: "La France insoumise - Nouveau Front Populaire",
  politicalGroup: { short: "LFI-NFP" },
}

const LIORET = {
  id: deputyId("PA840967"),
  last_name: "Lioret",
  first_name: "René",
  department: "Côte-d'Or",
  department_number: "21",
  constituency_number: "5",
  group: "Rassemblement National",
  politicalGroup: { short: "RN" },
}

const deputies = createDeputySearch([PANOT, LIORET])
addCommunes(deputies, new Map([[LIORET.id, "Censerey (21430)|Molinot (21340)|Saint-Martin-de-la-Mer (21210)"]]), [LIORET])

const votes = await createVoteSearch(
  parseVotes([
    {
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
    },
  ]),
)

function votesOnTop(query: string): boolean {
  return votesFirst(query, deputies, deputies.search(query)[0], votes, searchVotes(votes, query))
}

test("votes matching every word of a query come above a deputy whose communes match more words only loosely", () => {
  assert.equal(votesOnTop("motion de censure"), true)
})

test("a deputy's name lists deputies first, even when a vote title quotes it", () => {
  assert.equal(votesOnTop("Panot"), false)
  assert.equal(votesOnTop("Mathilde Panot"), false)
})
