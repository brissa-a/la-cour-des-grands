import Anthropic from "@anthropic-ai/sdk";
import { reasonOf } from "../publication/publish.ts";

export const MODEL = "claude-sonnet-5-5";
// Thinking included: a body of 4,095 bytes is some 1,500 tokens.
const MAX_TOKENS = 8000;

export type AnthropicKey = string & { readonly __brand: "AnthropicKey" };

const KEY = /^sk-ant-[-_A-Za-z0-9]{20,}$/;

export function anthropicKey(text: string | undefined): AnthropicKey | null {
  const key = text?.trim() ?? "";
  if (!KEY.test(key)) return null;
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the shape of an Anthropic API key, so that an empty or stray value never stands for one
  return key as AnthropicKey;
}

export type Prompt = { readonly system: string; readonly user: string };

export type Failure = { readonly kind: "status"; readonly status: number } | { readonly kind: "unreachable" } | { readonly kind: "unfinished" };

// A failure's reason never holds the key.
export type Written = { readonly kind: "text"; readonly text: string } | { readonly kind: "failed"; readonly failure: Failure; readonly reason: string };

export type Writer = (prompt: Prompt, signal: AbortSignal) => Promise<Written>;

export type SdkFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const failureOf = (error: unknown): Failure =>
  error instanceof Anthropic.APIError && typeof error.status === "number" ? { kind: "status", status: error.status } : { kind: "unreachable" };

export function claudeWriter(key: AnthropicKey, fetch?: SdkFetch): Writer {
  const client = new Anthropic({ apiKey: key, maxRetries: 0, fetch });
  const withoutKey = (text: string): string => text.replaceAll(key, "[ANTHROPIC_API_KEY]");
  return async ({ system, user }, signal) => {
    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        { model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: "medium" }, system, messages: [{ role: "user", content: user }] },
        { signal },
      );
    } catch (error) {
      return { kind: "failed", failure: failureOf(error), reason: withoutKey(reasonOf(error)) };
    }
    if (message.stop_reason !== "end_turn") return { kind: "failed", failure: { kind: "unfinished" }, reason: `stopped on ${String(message.stop_reason)}` };
    return { kind: "text", text: message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("") };
  };
}
