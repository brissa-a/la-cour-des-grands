export type Edit = "equal" | "substitute" | "delete" | "add" | "remain"

export type Token<Ref, Field> = { ref: Ref; field: Field; value: string; slice: readonly [number, number]; weight: number }

export type Match<Ref, Field> = { token: Token<Ref, Field>; edits: readonly Edit[] }

export type SearchResult<Ref, Field> = { ref: Ref; matches: Match<Ref, Field>[]; score: number }

type TrieNode = { children: Map<string, TrieNode>; word: string | null }

type WordHit = { edits: Edit[]; distance: number }

const DELIMITER = /[()[\]<>\s\-,'’./]/
const DIGITS = /^\d+$/
const PREFIX_REMAIN_COST = 0.01

export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
}

export class FuzzyIndex<Ref, Field> {
  private readonly trie: TrieNode = { children: new Map(), word: null }
  private readonly tokensByWord = new Map<string, Token<Ref, Field>[]>()
  private readonly codes = new Set<string>()

  add(ref: Ref, field: Field, value: string, weight = 1): void {
    let start = 0
    for (const word of normalize(value).split(DELIMITER)) {
      if (word) {
        const token: Token<Ref, Field> = { ref, field, value, slice: [start, start + word.length], weight }
        const tokens = this.tokensByWord.get(word)
        if (tokens) tokens.push(token)
        else {
          this.tokensByWord.set(word, [token])
          if (DIGITS.test(word)) this.codes.add(word)
          else insert(this.trie, word)
        }
      }
      start += word.length + 1
    }
  }

  search(query: string): SearchResult<Ref, Field>[] {
    const results = new Map<Ref, SearchResult<Ref, Field>>()
    for (const term of normalize(query).split(DELIMITER).filter(Boolean)) {
      const termScores = new Map<SearchResult<Ref, Field>, number>()
      for (const [word, hit] of this.lookup(term)) {
        for (const token of this.tokensByWord.get(word) ?? []) {
          let result = results.get(token.ref)
          if (!result) {
            result = { ref: token.ref, matches: [], score: 0 }
            results.set(token.ref, result)
          }
          result.matches.push({ token, edits: hit.edits })
          const score = ((term.length - hit.distance) / term.length) * token.weight
          termScores.set(result, Math.max(score, termScores.get(result) ?? 0))
        }
      }
      for (const [result, score] of termScores) result.score += score
    }
    return [...results.values()].sort((a, b) => b.score - a.score)
  }

  private lookup(term: string): Map<string, WordHit> {
    if (DIGITS.test(term)) return this.prefixCodes(term)
    const hits = new Map<string, WordHit>()
    searchNode(this.trie, [...term], 0, Math.min(3, Math.round(term.length / 2)), [], hits)
    return hits
  }

  private prefixCodes(term: string): Map<string, WordHit> {
    const hits = new Map<string, WordHit>()
    for (const code of this.codes) {
      if (!code.startsWith(term)) continue
      const remain = code.length - term.length
      hits.set(code, {
        edits: [...Array<Edit>(term.length).fill("equal"), ...Array<Edit>(remain).fill("remain")],
        distance: remain * PREFIX_REMAIN_COST,
      })
    }
    return hits
  }
}

function insert(root: TrieNode, word: string): void {
  let node = root
  for (const char of word) {
    let child = node.children.get(char)
    if (!child) {
      child = { children: new Map(), word: null }
      node.children.set(char, child)
    }
    node = child
  }
  node.word = word
}

function searchNode(
  node: TrieNode, rest: string[], distance: number, maxDistance: number, edits: Edit[], hits: Map<string, WordHit>,
): void {
  if (node.word) {
    const total = distance + rest.length
    if (total < maxDistance && total < (hits.get(node.word)?.distance ?? Infinity)) {
      hits.set(node.word, { edits: [...edits], distance: total })
    }
  }
  if (distance > maxDistance) return
  const [head, ...tail] = rest
  if (head === undefined) {
    edits.push("remain")
    for (const child of node.children.values()) searchNode(child, rest, distance + PREFIX_REMAIN_COST, maxDistance, edits, hits)
    edits.pop()
    return
  }
  for (const [char, child] of node.children) {
    edits.push(char === head ? "equal" : "substitute")
    searchNode(child, tail, distance + (char === head ? 0 : 1), maxDistance, edits, hits)
    edits.pop()
    edits.push("delete")
    searchNode(child, rest, distance + 1, maxDistance, edits, hits)
    edits.pop()
  }
  edits.push("add")
  searchNode(node, tail, distance + 1, maxDistance, edits, hits)
  edits.pop()
}
