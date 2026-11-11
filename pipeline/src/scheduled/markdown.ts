const TEXT: unique symbol = Symbol("markdown");

// Only md and joined build one, and md escapes every string it is given: data never opens a Markdown construct.
export type Markdown = { readonly [TEXT]: string };

type Part = string | number | Markdown;

const SPECIAL = /[\\`*_[\]<>~|&#]/g;

const escaped = (text: string): string => text.replace(/\s+/g, " ").replace(SPECIAL, "\\$&");

const piece = (part: Part): string => (typeof part === "string" ? escaped(part) : typeof part === "number" ? String(part) : part[TEXT]);

export function md(literals: TemplateStringsArray, ...parts: readonly Part[]): Markdown {
  let text = literals[0] ?? "";
  parts.forEach((part, i) => {
    text += piece(part) + (literals[i + 1] ?? "");
  });
  return { [TEXT]: text };
}

export const rendered = (markdown: Markdown): string => markdown[TEXT];

export const joined = (parts: readonly Markdown[], separator: Markdown): Markdown => ({ [TEXT]: parts.map(rendered).join(rendered(separator)) });

const ELLIPSIS = "…";

// Cut between code points, so that a cut text stays valid UTF-8.
export function shortened(text: string, maxCharacters: number): string {
  const characters = Array.from(text.trim());
  if (characters.length <= maxCharacters) return characters.join("");
  return characters.slice(0, maxCharacters - 1).join("").trimEnd() + ELLIPSIS;
}

export const capitalized = (text: string): string => text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
