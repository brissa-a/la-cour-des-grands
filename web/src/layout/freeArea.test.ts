import assert from "node:assert/strict"
import { test } from "node:test"
import { freeArea } from "./freeArea.ts"

test("the area starts below the lowest overlay at the top and ends above the overlays at the bottom, with clearance", () => {
  const stage = { left: 0, top: 0, right: 1440, bottom: 900 }
  const searchBar = { left: 30, top: 14, right: 482, bottom: 46 }
  const controls = { left: 1150, top: 12, right: 1428, bottom: 116 }
  const headerAndLegend = { left: 16, top: 648, right: 1424, bottom: 844 }
  assert.deepEqual(freeArea(stage, [searchBar, controls, headerAndLegend], 12), { left: 12, top: 128, right: 1428, bottom: 636 })
})

test("the stage can be a DOMRect, whose sides are prototype getters that a spread copy would drop", () => {
  class Measured {
    get left() { return 0 }
    get top() { return 0 }
    get right() { return 1440 }
    get bottom() { return 900 }
  }
  const controls = { left: 1150, top: 12, right: 1428, bottom: 116 }
  const headerAndLegend = { left: 16, top: 648, right: 1424, bottom: 844 }
  assert.deepEqual(freeArea(new Measured(), [controls, headerAndLegend], 12), { left: 12, top: 128, right: 1428, bottom: 636 })
})

test("when the overlays leave no room between them, the chart takes the whole stage instead of disappearing", () => {
  const stage = { left: 0, top: 0, right: 812, bottom: 375 }
  const controls = { left: 520, top: 12, right: 800, bottom: 116 }
  const headerAndLegend = { left: 16, top: 109, right: 796, bottom: 319 }
  assert.deepEqual(freeArea(stage, [controls, headerAndLegend], 12), { left: 12, top: 12, right: 800, bottom: 363 })
})
