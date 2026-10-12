export type Change = { readonly by: readonly unknown[]; readonly at: number }

export type Painter = { readonly loaded: Promise<unknown>; readonly nextFrame: () => Promise<number> }

export function changeAfter(last: Change | null, by: readonly unknown[], now: number): Change {
  return last && last.by.length === by.length && last.by.every((item, index) => item === by[index]) ? last : { by, at: now }
}

// Fonts and photos first: a late font swap resizes the overlays, which refits the scene and restarts the wait. Transitions
// start on the frame after the committed styles apply, and keep time in frame timestamps.
export async function paintedAfter(waitMs: number, { loaded, nextFrame }: Painter, live: () => boolean): Promise<boolean> {
  await loaded
  await nextFrame()
  let now = await nextFrame()
  const end = now + waitMs
  while (now < end && live()) now = await nextFrame()
  return live()
}

export async function photosLoaded(urls: readonly string[], load: (url: string) => Promise<unknown>): Promise<void> {
  await Promise.allSettled(urls.map(load))
}
