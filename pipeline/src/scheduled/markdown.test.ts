import assert from "node:assert/strict";
import { test } from "node:test";
import { capitalized, joined, md, rendered, shortened } from "./markdown.ts";

test("text put into Markdown is escaped and kept on one line, so that it never opens a construct; Markdown and numbers go in as they are", () => {
  const title = "l'*urgence* _du_ `code` [lien](x) <b> ~barré~ a|b R&D #1 C:\\ \n- item";
  assert.equal(
    rendered(md`**${title}** · ${3} ${md`**x**`}`),
    "**l'\\*urgence\\* \\_du\\_ \\`code\\` \\[lien\\](x) \\<b\\> \\~barré\\~ a\\|b R\\&D \\#1 C:\\\\ - item** · 3 **x**",
  );
  assert.equal(rendered(md`${""}`), "");
  assert.equal(rendered(joined([md`a`, md`${"*"}`, md`c`], md`\n`)), "a\n\\*\nc");
});

test("a text that opens like a list item, a rule or a heading underline is escaped there, so that after « - » it stays plain text", () => {
  const item = (text: string) => rendered(md`- ${text}`);
  assert.equal(item("1. Untel"), "- 1\\. Untel");
  assert.equal(item("12) Untel"), "- 12\\) Untel");
  assert.equal(item(" 3. Untel"), "-  3\\. Untel");
  assert.equal(item("- Untel"), "- \\- Untel");
  assert.equal(item("+ Untel"), "- \\+ Untel");
  assert.equal(item("---"), "- \\---");
  assert.equal(item("==="), "- \\===");
  assert.equal(item("2026 : 1. Untel - 3"), "- 2026 : 1. Untel - 3");
});

test("a text too long is cut between characters, never inside one, and marked; a short one is only trimmed", () => {
  assert.equal(shortened("  abc  ", 3), "abc");
  assert.equal(shortened("abcd", 3), "ab…");
  assert.equal(shortened("ab cd", 4), "ab…");
  assert.equal(shortened("😀😀😀😀", 3), "😀😀…");
  assert.ok(shortened("é😀".repeat(50), 7).isWellFormed());
  assert.equal(capitalized("élan"), "Élan");
  assert.equal(capitalized(""), "");
});

test("only md makes Markdown: neither a string nor a look-alike object passes for it", () => {
  const typeChecksOnly = () => [
    // @ts-expect-error -- a string goes through md, which escapes it
    rendered("**bold**"),
    // @ts-expect-error -- the key of Markdown is a symbol no other module can name
    rendered({ markdown: "**bold**" }),
    // @ts-expect-error -- a separator is Markdown too
    joined([md`a`], "\n"),
  ];
  assert.equal(typeof typeChecksOnly, "function");
});
