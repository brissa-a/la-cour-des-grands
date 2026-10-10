import { globSync, readFileSync } from "node:fs"
import process from "node:process"
import { directiveProblems } from "./directives.ts"

// oxlint lets a disable comment silence the rules that police disable comments, so this check runs outside it.

const SOURCES = "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"
const NOT_LINTED = ["node_modules/**", "dist/**", ".stryker-tmp/**", "reports/**"]
const DIRECTIVE_COMMENT = /\/\/(?=[ \t]*(?:eslint|oxlint)-disable)|\/\*(?=\s*(?:eslint|oxlint)-disable)/g

for (const file of globSync(SOURCES, { exclude: NOT_LINTED })) {
  const text = readFileSync(file, "utf8")
  for (const { index } of text.matchAll(DIRECTIVE_COMMENT)) {
    const start = index + 2
    const value = text.slice(start, text.startsWith("//", index) ? lineEnd(text, start) : blockEnd(text, start))
    for (const { message } of directiveProblems(value)) {
      console.error(`${file}:${lineOf(text, index)}: ${message}`)
      process.exitCode = 1
    }
  }
}

function lineEnd(text: string, from: number): number {
  const offset = text.slice(from).search(/[\r\n]/)
  return offset === -1 ? text.length : from + offset
}

function blockEnd(text: string, from: number): number {
  const close = text.indexOf("*/", from)
  return close === -1 ? text.length : close
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length
}
