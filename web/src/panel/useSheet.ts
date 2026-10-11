import { useEffect, useReducer } from "react"
import { CLOSED, scheduleCollapse, sheetAfter, type Sheet, type SheetEvent } from "./sheet.ts"

export function useSheet(): readonly [Sheet, (event: SheetEvent) => void] {
  const [sheet, dispatch] = useReducer(sheetAfter, CLOSED)
  useEffect(
    () =>
      scheduleCollapse(sheet, dispatch, (ms, run) => {
        const timer = setTimeout(run, ms)
        return () => clearTimeout(timer)
      }),
    [sheet],
  )
  return [sheet, dispatch]
}
