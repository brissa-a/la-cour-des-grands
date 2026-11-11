import { definePlugin, defineRule, type Comment, type Context } from "@oxlint/plugins"

const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(-next-line|-line)?(?=\s|$)([\s\S]*)$/
const REASON_SEPARATOR = /\s-{2,}(?:\s|$)/
const MINIMUM_REASON_LENGTH = 10
const DISABLEABLE_AT_BRAND_BOUNDARY = "typescript/consistent-type-assertions"

interface Directive {
  readonly comment: Comment
  readonly nextLine: boolean
  readonly rules: readonly string[]
  readonly reason: string
}

function* directives(context: Context): Generator<Directive> {
  for (const comment of context.sourceCode.getAllComments()) {
    const match = DIRECTIVE.exec(comment.value)
    if (match === null) continue
    const [, scope, body = ""] = match
    const [list = "", ...reason] = body.split(REASON_SEPARATOR)
    yield {
      comment,
      nextLine: scope === "-next-line",
      rules: list.split(",").map(rule => rule.trim()).filter(rule => rule !== ""),
      reason: reason.join(" ").trim(),
    }
  }
}

// Oxlint lets a directive silence reports after the start of its own line, never at column 0 of it. Reporting there
// means a directive that names these rules still fails the run: the first such directive in a file is never covered.
function reportDirective(context: Context, { comment }: Directive, message: string): void {
  const lineStart = { line: comment.loc.start.line, column: 0 }
  context.report({ loc: { start: lineStart, end: lineStart }, message })
}

export default definePlugin({
  meta: { name: "typing" },
  rules: {
    "disable-reason": defineRule({
      meta: { type: "problem" },
      create: context => ({
        Program() {
          for (const directive of directives(context))
            if (directive.reason.length < MINIMUM_REASON_LENGTH)
              reportDirective(context, directive, `A disable comment needs a reason after \`--\` (${MINIMUM_REASON_LENGTH} characters or more).`)
        },
      }),
    }),
    "disable-at-brand-boundary": defineRule({
      meta: { type: "problem" },
      create: context => {
        const returnedCastLines = new Set<number>()
        return {
          ReturnStatement(node) {
            if (node.argument?.type === "TSAsExpression") returnedCastLines.add(node.argument.loc.start.line)
          },
          "Program:exit"() {
            for (const directive of directives(context)) {
              const { comment, nextLine, rules } = directive
              if (!nextLine) reportDirective(context, directive, "Only `disable-next-line` is allowed, above the `return … as …` of a brand constructor.")
              else if (!returnedCastLines.has(comment.loc.end.line + 1))
                reportDirective(context, directive, "A disable comment must sit right above the `return … as …` of a brand constructor.")
              if (rules.length === 0) reportDirective(context, directive, `A disable comment must name ${DISABLEABLE_AT_BRAND_BOUNDARY}.`)
              for (const rule of rules)
                if (rule !== DISABLEABLE_AT_BRAND_BOUNDARY)
                  reportDirective(context, directive, `Disabling ${rule} is not allowed; only ${DISABLEABLE_AT_BRAND_BOUNDARY} may be disabled, in a brand constructor.`)
            }
          },
        }
      },
    }),
    "no-definite-assignment": defineRule({
      meta: { type: "problem" },
      create: context => {
        const message = "A definite assignment assertion (`!:`) hides a value that may be missing; assign it where it is declared."
        return {
          VariableDeclarator(node) {
            if (node.definite) context.report({ node, message })
          },
          PropertyDefinition(node) {
            if (node.definite) context.report({ node, message })
          },
          AccessorProperty(node) {
            if (node.definite) context.report({ node, message })
          },
        }
      },
    }),
    "no-ambient-declaration": defineRule({
      meta: { type: "problem" },
      create: context => {
        const message = "`declare` states types that no code checks; import or write typed code instead."
        return {
          VariableDeclaration(node) {
            if (node.declare) context.report({ node, message })
          },
          TSDeclareFunction(node) {
            if (node.declare) context.report({ node, message })
          },
          ClassDeclaration(node) {
            if (node.declare) context.report({ node, message })
          },
          TSEnumDeclaration(node) {
            if (node.declare) context.report({ node, message })
          },
          TSModuleDeclaration(node) {
            if (node.declare || node.kind === "global") context.report({ node, message })
          },
        }
      },
    }),
  },
})
