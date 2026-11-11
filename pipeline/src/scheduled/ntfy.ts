import { fieldOf } from "../core/json.ts";

export const NTFY_SERVER = "https://ntfy.kxv.fr";
export const NTFY_USER = "lcdg_pipeline";

export type NtfyToken = string & { readonly __brand: "NtfyToken" };

const TOKEN = /^tk_[-_A-Za-z0-9]{29}$/;

export function ntfyToken(text: string | undefined): NtfyToken | null {
  const token = text?.trim() ?? "";
  if (!TOKEN.test(token)) return null;
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the shape of a token ntfy hands out, so that a password or an empty value never stands for one
  return token as NtfyToken;
}

export type Topic = "failed" | "rejected" | "locked" | "done";

export type Priority = 1 | 2 | 3 | 4 | 5;

export type Notification = {
  readonly topic: Topic;
  readonly priority: Priority;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
};

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type NtfyDeps = {
  readonly fetcher: Fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (line: string) => void;
};

// ntfy turns a longer message into an attachment.
export const MAX_BODY_BYTES = 3500;
export const RETRY_DELAYS_MS = [10_000, 60_000] as const;

const TRUNCATED = "\n[…]";

export function clipped(body: string, maxBytes = MAX_BODY_BYTES): string {
  const bytes = Buffer.from(body);
  if (bytes.length <= maxBytes) return body;
  const kept = bytes.subarray(0, maxBytes - Buffer.byteLength(TRUNCATED)).toString("utf8").replace(/�$/u, "");
  return kept + TRUNCATED;
}

export function topicUrl({ topic, priority, title, tags }: Notification): string {
  const query = new URLSearchParams({ title, priority: String(priority), tags: tags.join(",") });
  return `${NTFY_SERVER}/${NTFY_USER}-${topic}?${query.toString()}`;
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// A refused token or topic stays refused: only a server or network failure is tried again.
const retried = (status: number): boolean => status === 429 || status >= 500;

export async function publish(notification: Notification, token: NtfyToken, { fetcher, sleep, log }: NtfyDeps): Promise<boolean> {
  const url = topicUrl(notification);
  const target = `${NTFY_USER}-${notification.topic}`;
  log(`ntfy ${target}, priority ${notification.priority}: ${notification.title}`);
  for (let attempt = 0; ; attempt++) {
    let failure: string;
    try {
      const response = await fetcher(url, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: clipped(notification.body) });
      await response.body?.cancel();
      if (response.ok) return true;
      failure = `HTTP ${response.status}`;
      if (!retried(response.status)) {
        log(`ntfy refused the notification to ${target}: ${failure}`);
        return false;
      }
    } catch (error) {
      failure = reasonOf(error);
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      log(`ntfy did not take the notification to ${target}: ${failure}, given up after ${attempt + 1} attempts`);
      return false;
    }
    log(`ntfy did not take the notification to ${target}: ${failure}, trying again in ${delay / 1000} s`);
    await sleep(delay);
  }
}

export type TokenCheck = { readonly kind: "accepted" } | { readonly kind: "refused"; readonly reason: string };

export async function checkToken(token: NtfyToken, fetcher: Fetch): Promise<TokenCheck> {
  let response: Response;
  try {
    response = await fetcher(`${NTFY_SERVER}/v1/account`, { headers: { authorization: `Bearer ${token}` } });
  } catch (error) {
    return { kind: "refused", reason: `${NTFY_SERVER} is unreachable: ${reasonOf(error)}` };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { kind: "refused", reason: `${NTFY_SERVER}/v1/account answered HTTP ${response.status}` };
  }
  const user = fieldOf(await response.json().catch(() => null), "username");
  return user === NTFY_USER ? { kind: "accepted" } : { kind: "refused", reason: `the token belongs to ${JSON.stringify(user ?? null)}, not to ${NTFY_USER}` };
}
