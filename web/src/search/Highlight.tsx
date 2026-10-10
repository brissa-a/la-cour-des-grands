import type { ReactNode } from "react"
import type { Match } from "./fuzzy.ts"

export function Highlight<Ref, Field>({ value, matches }: { value: string; matches: readonly Match<Ref, Field>[] }) {
  const ofValue = matches
    .filter(m => m.token.value === value)
    .sort((a, b) => a.token.slice[0] - b.token.slice[0])
  const parts: ReactNode[] = []
  let cursor = 0
  for (const { token, edits } of ofValue) {
    const [start, end] = token.slice
    if (start < cursor) continue
    parts.push(value.slice(cursor, start))
    let position = start
    for (const edit of edits) {
      if (edit === "add" || position >= end) continue
      const char = value[position]
      parts.push(edit === "equal" ? <mark key={position}>{char}</mark> : char)
      position++
    }
    parts.push(value.slice(position, end))
    cursor = end
  }
  parts.push(value.slice(cursor))
  return <>{parts}</>
}
