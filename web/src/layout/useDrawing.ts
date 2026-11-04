import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { drawingOf, type Drawing, type DrawingFacts } from "./drawing.ts"
import { changeAfter, paintedAfter, photosLoaded, type Change } from "./painted.ts"
import { settleMs } from "./staging.ts"

type Photos = { readonly urls: readonly string[]; readonly loaded: Promise<void> }

export function markDrawing(drawing: Drawing): void {
  document.documentElement.dataset.drawing = drawing
}

export function useDrawing<Color, Layout>(
  facts: Omit<DrawingFacts<Color, Layout>, "sinceChangeMs" | "painted">,
  animatedBy: readonly unknown[],
  photos: readonly string[],
): void {
  const last = useRef<Change | null>(null)
  const change = changeAfter(last.current, [...animatedBy, photos], performance.now())
  last.current = change
  const [painted, setPainted] = useState<Change | null>(null)
  const loading = useRef<Photos | null>(null)
  const drawing = drawingOf({ ...facts, sinceChangeMs: performance.now() - change.at, painted: painted === change })

  useLayoutEffect(() => markDrawing(drawing), [drawing])

  useEffect(() => {
    if (loading.current?.urls !== photos) loading.current = { urls: photos, loaded: photosLoaded(photos, decoded) }
    let live = true
    const loaded = Promise.all([document.fonts.ready, loading.current.loaded])
    void paintedAfter(settleMs(facts.motion), { loaded, nextFrame }, () => live).then(done => {
      if (done) setPainted(change)
    })
    return () => {
      live = false
    }
  }, [change, facts.motion, photos])
}

function decoded(url: string): Promise<void> {
  const image = new Image()
  image.src = url
  return image.decode()
}

function nextFrame(): Promise<number> {
  return new Promise(resolve => requestAnimationFrame(resolve))
}
