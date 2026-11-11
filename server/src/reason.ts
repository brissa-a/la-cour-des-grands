export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}
