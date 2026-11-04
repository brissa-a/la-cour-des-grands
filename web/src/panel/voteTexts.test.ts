import assert from "node:assert/strict"
import { test } from "node:test"
import { isoDate } from "../data/isoDate.ts"
import { voteId } from "../votes/voteId.ts"
import type { Vote } from "../votes/votes.ts"
import { majorsTitle, votePlaceholder } from "./voteTexts.ts"

test("the vote search counts the scrutins it searches when the catalog says how many, value first", () => {
  assert.equal(votePlaceholder(8672), "8 672 scrutins · n° ou mots du titre")
  assert.equal(votePlaceholder(null), "n° ou mots du titre")
})

test("the list shown before typing counts the major votes it opens on", () => {
  const vote = (number: number, major: boolean): Vote => ({
    id: voteId(`VTANR5L17V${number}`) ?? assert.fail(),
    number,
    date: isoDate("2026-07-20") ?? assert.fail(),
    title: "t",
    kind: "ordinary",
    result: "adopted",
    major,
    bill: null,
    file: "f",
    url: "u",
  })
  assert.equal(majorsTitle([vote(1, true), vote(2, false), vote(3, true)]), "2 votes majeurs · les plus récents d'abord")
  assert.equal(majorsTitle([]), "0 votes majeurs · les plus récents d'abord")
})
