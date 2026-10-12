import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { drawingOf, type Drawing, type DrawingFacts } from "./drawing.ts"
import { settleMs, type MotionPreference } from "./staging.ts"

type Change = { readonly by: readonly unknown[]; readonly at: number }

export function markDrawing(drawing: Drawing): void {
  document.documentElement.dataset.drawing = drawing
}

export function useDrawing<Color, Layout>(facts: Omit<DrawingFacts<Color, Layout>, "sinceChangeMs" | "fontsPainted">, animatedBy: readonly unknown[]): void {
  const last = useRef<Change | null>(null)
  const change = last.current && sameItems(last.current.by, animatedBy) ? last.current : { by: animatedBy, at: performance.now() }
  last.current = change
  const [painted, setPainted] = useState<Change | null>(null)
  const drawing = drawingOf({ ...facts, sinceChangeMs: performance.now() - change.at, fontsPainted: painted === change })

  useLayoutEffect(() => markDrawing(drawing), [drawing])

  useEffect(() => {
    let live = true
    void paintedAfter(facts.motion, () => live).then(done => {
      if (done) setPainted(change)
    })
    return () => {
      live = false
    }
  }, [change, facts.motion])
}

// Fonts first: a late swap resizes the overlays, which refits the scene and restarts the wait. Transitions start on the
// frame after the committed styles apply, and keep time in frame timestamps.
async function paintedAfter(motion: MotionPreference, live: () => boolean): Promise<boolean> {
  await document.fonts.ready
  await nextFrame()
  let now = await nextFrame()
  const end = now + settleMs(motion)
  while (now < end && live()) now = await nextFrame()
  return live()
}

function nextFrame(): Promise<number> {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}
