export const ITEM = Symbol("item")

export type Segment = string | typeof ITEM

export type KeySpan = { path: readonly Segment[]; start: number; end: number }

export function keySpans(text: string): KeySpan[] {
  const spans: KeySpan[] = []
  const open: Segment[][] = []
  let lastKey: string | null = null
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      const start = i
      i++
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1
      const end = Math.min(i + 1, text.length)
      let next = end
      while (next < text.length && /\s/.test(text[next] ?? "")) next++
      if (text[next] === ":") {
        lastKey = unquote(text.slice(start, end))
        spans.push({ path: [...open.flat(), lastKey], start, end })
      }
      i = end
      continue
    }
    if (c === "{" || c === "[") {
      const named = lastKey === null ? [] : [lastKey]
      open.push(c === "[" ? [...named, ITEM] : named)
      lastKey = null
    } else if (c === "}" || c === "]") open.pop()
    else if (c === ",") lastKey = null
    i++
  }
  return spans
}

export function pathLabel(path: readonly Segment[]): string {
  return path.map(segment => (segment === ITEM ? "[]" : segment)).join(".")
}

function unquote(quoted: string): string {
  try {
    return String(JSON.parse(quoted))
  } catch {
    return quoted.slice(1, quoted.endsWith('"') && quoted.length > 1 ? -1 : undefined)
  }
}
