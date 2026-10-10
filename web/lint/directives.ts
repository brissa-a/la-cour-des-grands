import { definePlugin, defineRule, type Context } from "@oxlint/plugins"

const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(-next-line|-line)?(?=\s|$)([\s\S]*)$/
const REASON_SEPARATOR = /\s-{2,}(?:\s|$)/
const MINIMUM_REASON_LENGTH = 10
const DISABLEABLE_AT_BRAND_BOUNDARY: ReadonlySet<string> = new Set([
  "typescript/consistent-type-assertions",
  "typescript/no-non-null-assertion",
])

export type Problem = { readonly rule: "require-reason" | "only-at-brand-boundary"; readonly message: string }

export function directiveProblems(commentValue: string): Problem[] {
  const match = DIRECTIVE.exec(commentValue)
  if (match === null) return []
  const [, scope, body = ""] = match
  const [list = "", ...reason] = body.split(REASON_SEPARATOR)
  const rules = list.split(",").map(rule => rule.trim()).filter(rule => rule !== "")
  const problems: Problem[] = []
  if (reason.join(" ").trim().length < MINIMUM_REASON_LENGTH)
    problems.push({ rule: "require-reason", message: `A disable comment needs a reason after \`--\` (${MINIMUM_REASON_LENGTH} characters or more).` })
  if (scope === undefined)
    problems.push({ rule: "only-at-brand-boundary", message: "Only `disable-next-line` or `disable-line` is allowed, inside a brand constructor." })
  if (rules.length === 0)
    problems.push({ rule: "only-at-brand-boundary", message: "A disable comment must name the rule it disables." })
  for (const rule of rules)
    if (!DISABLEABLE_AT_BRAND_BOUNDARY.has(rule))
      problems.push({ rule: "only-at-brand-boundary", message: `Disabling ${rule} is not allowed; only type assertions and non-null assertions may be disabled, inside a brand constructor.` })
  return problems
}

function reportProblems(context: Context, rule: Problem["rule"]): void {
  for (const comment of context.sourceCode.getAllComments())
    for (const problem of directiveProblems(comment.value))
      if (problem.rule === rule) context.report({ node: comment, message: problem.message })
}

export default definePlugin({
  meta: { name: "directives" },
  rules: {
    "require-reason": defineRule({
      meta: { type: "problem" },
      create: context => ({ Program: () => reportProblems(context, "require-reason") }),
    }),
    "only-at-brand-boundary": defineRule({
      meta: { type: "problem" },
      create: context => ({ Program: () => reportProblems(context, "only-at-brand-boundary") }),
    }),
  },
})
