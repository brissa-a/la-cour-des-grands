export type Copy = "copied" | "failed"

// navigator.clipboard is undefined outside secure contexts, although the DOM types say otherwise.
export function copyText(text: string, clipboard: Pick<Clipboard, "writeText"> | undefined): Promise<Copy> {
  if (clipboard === undefined) return Promise.resolve("failed")
  return clipboard.writeText(text).then(
    (): Copy => "copied",
    (): Copy => "failed",
  )
}
