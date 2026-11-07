import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const OXLINT = fileURLToPath(new URL("../node_modules/.bin/oxlint", import.meta.url));
const PLUGIN = fileURLToPath(new URL("./typing.ts", import.meta.url));
const RULE = /\[Error\/([\w-]+)\(([\w-]+)\)\]$/;

function reportedRules(source: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "typing-"));
  try {
    const config = {
      plugins: ["typescript"],
      jsPlugins: [PLUGIN],
      options: { reportUnusedDisableDirectives: "error" },
      rules: {
        "typescript/no-explicit-any": "error",
        "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
        "typing/disable-reason": "error",
        "typing/disable-at-brand-boundary": "error",
        "typing/no-definite-assignment": "error",
        "typing/no-ambient-declaration": "error",
      },
    };
    writeFileSync(join(dir, "oxlintrc.json"), JSON.stringify(config));
    writeFileSync(join(dir, "fixture.ts"), source);
    const { stdout } = spawnSync(OXLINT, ["-c", join(dir, "oxlintrc.json"), "-f", "unix", join(dir, "fixture.ts")], { encoding: "utf8" });
    return stdout.split("\n").flatMap((line) => {
      const [, plugin, rule] = RULE.exec(line) ?? [];
      return plugin === undefined || rule === undefined ? [] : [`${plugin}/${rule}`];
    });
  } finally {
    rmSync(dir, { recursive: true });
  }
}

const BRAND = `export type Code = string & { readonly __brand: "Code" };
export function code(value: string): Code {
  if (value === "") throw new Error("empty");
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the test above proves a code
  return value as Code;
}
`;

test("a reasoned cast returned by a brand constructor passes", () => {
  assert.deepEqual(reportedRules(BRAND), []);
});

test("a disable comment fails without a reason, away from a returned cast, for no or another rule, or beyond the next line", () => {
  assert.deepEqual(reportedRules(BRAND.replace(" -- brand constructor: the test above proves a code", "")), ["typing/disable-reason"]);
  assert.ok(reportedRules(BRAND.replace("return value as Code;", "const coded = value as Code;\n  return coded;")).includes("typing/disable-at-brand-boundary"));
  assert.ok(reportedRules(BRAND.replace("disable-next-line typescript/consistent-type-assertions", "disable-next-line typescript/no-explicit-any")).includes("typing/disable-at-brand-boundary"));
  assert.ok(reportedRules(BRAND.replace("disable-next-line typescript/consistent-type-assertions", "disable-next-line")).includes("typing/disable-at-brand-boundary"));
  assert.ok(reportedRules(BRAND.replace("disable-next-line", "disable")).includes("typing/disable-at-brand-boundary"));
});

test("a disable comment that names the plugin's own rules still fails the run", () => {
  const sameLine = "export const a: any = 1; // oxlint-disable-line typing/disable-at-brand-boundary, typescript/no-explicit-any -- silences itself";
  const wholeFile = "/* eslint-disable typing/disable-at-brand-boundary, typing/disable-reason, typescript/no-explicit-any */\nexport const a: any = 1;";
  assert.ok(reportedRules(sameLine).includes("typing/disable-at-brand-boundary"));
  assert.ok(reportedRules(wholeFile).includes("typing/disable-at-brand-boundary"));
});

test("definite assignment assertions and ambient declarations are reported", () => {
  assert.deepEqual(reportedRules("let n!: number;\nn = 1;\nexport const read = () => n;"), ["typing/no-definite-assignment"]);
  assert.deepEqual(reportedRules("declare const value: string;\nexport const read = () => value;"), ["typing/no-ambient-declaration"]);
  assert.deepEqual(reportedRules("export const x = 1;\ndeclare global {\n  interface Array<T> {\n    first(): T;\n  }\n}"), ["typing/no-ambient-declaration"]);
});
