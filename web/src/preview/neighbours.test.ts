import assert from "node:assert/strict"
import { test } from "node:test"
import { neighbour } from "./neighbours.ts"

const arc = (radius: number, degrees: number) => {
  const angle = (degrees * Math.PI) / 180
  return { x: radius * Math.cos(angle), y: -radius * Math.sin(angle) }
}

test("hemicycle neighbours follow the row, left towards the left wing", () => {
  const positions = new Map([
    ["a", arc(0.5, 30)],
    ["b", arc(0.5, 40)],
    ["c", arc(0.5, 50)],
    ["outer", arc(0.56, 41)],
  ])
  assert.equal(neighbour(positions, "b", "left", "hemicycle", 0), "c")
  assert.equal(neighbour(positions, "b", "right", "hemicycle", 0), "a")
  assert.equal(neighbour(positions, "c", "left", "hemicycle", 0), null)
})

test("chart neighbours stay on the same row across columns", () => {
  const positions = new Map([
    ["a", { x: 0.1, y: 0.05 }],
    ["b", { x: 0.2, y: 0.05 }],
    ["above", { x: 0.15, y: 0.01 }],
    ["far", { x: 0.6, y: 0.05 }],
  ])
  assert.equal(neighbour(positions, "b", "right", "chart", 0.01), "far")
  assert.equal(neighbour(positions, "b", "left", "chart", 0.01), "a")
})

test("seats on the bottom row step along their own wing", () => {
  const positions = new Map([
    ["leftEnd", { x: -0.375, y: 0 }],
    ["leftNext", arc(0.375, 172)],
    ["rightEnd", { x: 0.375, y: 0 }],
    ["rightNext", arc(0.375, 8)],
  ])
  assert.equal(neighbour(positions, "leftEnd", "left", "hemicycle", 0), null)
  assert.equal(neighbour(positions, "leftEnd", "right", "hemicycle", 0), "leftNext")
  assert.equal(neighbour(positions, "rightEnd", "right", "hemicycle", 0), null)
  assert.equal(neighbour(positions, "rightEnd", "left", "hemicycle", 0), "rightNext")
})
