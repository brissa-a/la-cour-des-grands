export type JsonRecord = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

export const fieldOf = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);

export function record(value: unknown, what: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${what} is not an object`);
  return value;
}

export function list(value: unknown, what: string): readonly unknown[] {
  if (!isList(value)) throw new Error(`${what} is not a list`);
  return value;
}

export function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`${what} is not a string`);
  return value;
}

export const optionalText = (value: unknown, what: string): string | null => (value === null || value === undefined ? null : text(value, what));

export const oneOrMany = (value: unknown): readonly unknown[] => (value === null || value === undefined ? [] : isList(value) ? value : [value]);

export const parseJson = (content: string): unknown => JSON.parse(content);
