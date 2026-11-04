import assert from "node:assert/strict"
import { test } from "node:test"
import { bleedBelow, freeArea } from "./freeArea.ts"

test("the area starts below the lowest overlay at the top and ends above the overlays at the bottom, with each axis's clearance", () => {
  const stage = { left: 0, top: 0, right: 1440, bottom: 900 }
  const searchBar = { left: 30, top: 14, right: 482, bottom: 46 }
  const controls = { left: 1150, top: 12, right: 1428, bottom: 116 }
  const headerAndLegend = { left: 16, top: 648, right: 1424, bottom: 844 }
  assert.deepEqual(freeArea(stage, [searchBar, controls, headerAndLegend], { x: 12, y: 4 }), { left: 12, top: 120, right: 1428, bottom: 644 })
})

test("a stage no wider or taller than its clearances leaves the chart no area", () => {
  assert.equal(freeArea({ left: 0, top: 0, right: 24, bottom: 900 }, [], { x: 12, y: 4 }), null)
  assert.equal(freeArea({ left: 0, top: 0, right: 900, bottom: 8 }, [], { x: 12, y: 4 }), null)
  assert.deepEqual(freeArea({ left: 0, top: 0, right: 25, bottom: 900 }, [], { x: 12, y: 4 }), { left: 12, top: 4, right: 13, bottom: 896 })
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
  assert.deepEqual(freeArea(new Measured(), [controls, headerAndLegend], { x: 12, y: 12 }), { left: 12, top: 128, right: 1428, bottom: 636 })
})

test("when the overlays leave no room between them, the chart takes the whole stage instead of disappearing", () => {
  const stage = { left: 0, top: 0, right: 812, bottom: 375 }
  const controls = { left: 520, top: 12, right: 800, bottom: 116 }
  const headerAndLegend = { left: 16, top: 109, right: 796, bottom: 319 }
  assert.deepEqual(freeArea(stage, [controls, headerAndLegend], { x: 12, y: 4 }), { left: 12, top: 4, right: 800, bottom: 371 })
})

test("an overlay beside the stage, like the search in the side panel, leaves the free area whole", () => {
  const stage = { left: 300, top: 0, right: 1440, bottom: 900 }
  const panelSearch = { left: 14, top: 12, right: 300, bottom: 44 }
  const touching = { left: 1440, top: 12, right: 1500, bottom: 116 }
  const legend = { left: 316, top: 800, right: 1424, bottom: 844 }
  assert.deepEqual(freeArea(stage, [panelSearch, touching, legend], { x: 12, y: 12 }), { left: 312, top: 12, right: 1428, bottom: 788 })
  const overlapping = { left: 290, top: 12, right: 301, bottom: 60 }
  assert.deepEqual(freeArea(stage, [overlapping], { x: 12, y: 12 }), { left: 312, top: 72, right: 1428, bottom: 888 })
})

test("a chart may run below its area down to the bottom of the lowest cover under it, touching or not, and never under a cover beside or across the area", () => {
  const area = { left: 12, top: 12, right: 588, bottom: 255 }
  const legend = { left: 8, top: 259, right: 592, bottom: 301 }
  const lower = { left: 300, top: 262, right: 320, bottom: 305 }
  assert.equal(bleedBelow(area, []), 0)
  assert.equal(bleedBelow(area, [legend]), 46)
  assert.equal(bleedBelow(area, [legend, lower]), 50)
  assert.equal(bleedBelow(area, [{ left: 8, top: 255, right: 592, bottom: 290 }]), 35)
  assert.equal(bleedBelow(area, [{ left: 0, top: 259, right: 12, bottom: 301 }]), 0)
  assert.equal(bleedBelow(area, [{ left: 588, top: 259, right: 600, bottom: 301 }]), 0)
  assert.equal(bleedBelow(area, [{ left: 8, top: 250, right: 592, bottom: 301 }]), 0)
})
