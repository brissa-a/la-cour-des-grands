import assert from "node:assert/strict"
import { test } from "node:test"
import { createVoteSearch, findVotes, searchVotes, voteFinder } from "./voteSearch.ts"
import { parseVotes } from "./votes.ts"

function votes(...rows: { number: number; date: string; title: string; major: boolean }[]) {
  return parseVotes(
    rows.map(({ number, date, title, major }) => ({
      vote_id: `VTANR5L17V${number}`,
      number: String(number),
      date,
      title,
      kind: "ordinary",
      result: "adopted",
      major: major ? "yes" : "no",
      bill: "",
      file: "deputies/votes/other.csv",
      url: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${number}`,
    })),
  )
}

const numbers = (results: { ref: { number: number } }[]) => results.map(r => r.ref.number)

test("among titles matching a query equally, major votes come first, then the newest", async () => {
  const search = await createVoteSearch(
    votes(
      { number: 400, date: "2024-11-10", title: "l'amendement n° 12 de M. Coquerel à l'article 3 du projet de loi de finances pour 2025 (première lecture).", major: false },
      { number: 438, date: "2024-11-12", title: "la première partie du projet de loi de finances pour 2025 (première lecture).", major: true },
      { number: 3935, date: "2025-11-18", title: "l'amendement n° 1 du Gouvernement à l'article 4 du projet de loi de finances de fin de gestion pour 2025 (première lecture).", major: false },
    ),
  )
  assert.deepEqual(numbers(searchVotes(search, "loi de finances 2025")), [438, 3935, 400])
})

test("a vote matching every word of the query outranks a major vote matching fewer", async () => {
  const search = await createVoteSearch(
    votes(
      { number: 8430, date: "2026-07-21", title: "l'ensemble du projet de loi relatif à la protection des enfants (première lecture).", major: true },
      { number: 8100, date: "2026-07-01", title: "l'amendement n° 5 à l'article 2 du projet de loi relatif à la protection des enfants face aux écrans.", major: false },
    ),
  )
  assert.deepEqual(numbers(searchVotes(search, "protection enfants écrans")), [8100, 8430])
})

test("function words neither match a title nor weigh in the ranking", async () => {
  const search = await createVoteSearch(
    votes({ number: 438, date: "2024-11-12", title: "la première partie du projet de loi de finances pour 2025 (première lecture).", major: true }),
  )
  assert.deepEqual(searchVotes(search, "le de la du"), [])
  assert.equal(searchVotes(search, "loi le finances")[0]?.score, searchVotes(search, "loi finances")[0]?.score)
})

test("with nothing typed, the vote list offers the major votes, newest first, the latest number first on the same day", async () => {
  const all = votes(
    { number: 10, date: "2025-01-10", title: "le projet de loi A.", major: true },
    { number: 11, date: "2025-03-01", title: "le projet de loi B.", major: false },
    { number: 12, date: "2025-02-01", title: "le projet de loi C.", major: true },
    { number: 13, date: "2025-02-01", title: "le projet de loi D.", major: true },
  )
  const finder = { search: await createVoteSearch(all), votes: all, labels: { kind: { ordinary: "", solemn: "", censure_motion: "" }, result: { adopted: "", rejected: "" } } }
  assert.deepEqual(numbers(findVotes(finder, " ")), [13, 12, 10])
})

test("typing a vote's number, with or without n°, puts that vote first and keeps the title matches after it", async () => {
  const all = votes(
    { number: 2025, date: "2025-01-10", title: "le budget pour 2025.", major: false },
    { number: 30, date: "2025-03-01", title: "la loi de finances pour 2025.", major: true },
  )
  const finder = { search: await createVoteSearch(all), votes: all, labels: { kind: { ordinary: "", solemn: "", censure_motion: "" }, result: { adopted: "", rejected: "" } } }
  assert.deepEqual(numbers(findVotes(finder, "n° 30")), [30])
  assert.deepEqual(numbers(findVotes(finder, "N°2025")), [2025])
  assert.deepEqual(numbers(findVotes(finder, "2025")), [2025, 30])
  assert.deepEqual(numbers(findVotes(finder, "finances")), [30])
  assert.deepEqual(findVotes(finder, "30")[0]?.matches, [])
  assert.deepEqual(numbers(findVotes(finder, " n ° 30 ")), [30])
  assert.deepEqual(numbers(findVotes(finder, "budget 30")), [2025])
  assert.deepEqual(numbers(findVotes(finder, "30 budget")), [2025])
  assert.deepEqual(numbers(findVotes(finder, "30x")), [])
})

test("the vote finder reads the vote index once, however often it is asked, and searches the titles of its votes", async () => {
  const all = votes({ number: 30, date: "2025-03-01", title: "la loi de finances pour 2025.", major: true })
  const labels = { kind: { ordinary: "o", solemn: "s", censure_motion: "c" }, result: { adopted: "a", rejected: "r" } }
  let reads = 0
  const find = voteFinder(() => {
    reads++
    return Promise.resolve({ votes: all, byId: new Map(all.map(vote => [vote.id, vote])), labels })
  })
  const [first, second] = await Promise.all([find(), find()])
  assert.equal(first, second)
  assert.equal(reads, 1)
  assert.deepEqual([first.votes, first.labels], [all, labels])
  assert.deepEqual(numbers(searchVotes(first.search, "finances")), [30])
})
