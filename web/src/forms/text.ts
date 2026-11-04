const NARROW_CHARS = "fijlrtI'’.,;:·-"
const WIDE_CHARS = "mwMW&"

// Each glyph class is as wide as its widest member in SF Pro, semibold digits included, so labels placed without measuring the DOM still clear each other.
export function textEm(text: string): number {
  let em = 0
  for (const char of text) em += charEm(char)
  return em
}

function charEm(char: string): number {
  if (char === " ") return 0.3
  if (NARROW_CHARS.includes(char)) return 0.48
  if (WIDE_CHARS.includes(char)) return 1
  if (char >= "0" && char <= "9") return 0.68
  return char === char.toLowerCase() ? 0.62 : 0.78
}
