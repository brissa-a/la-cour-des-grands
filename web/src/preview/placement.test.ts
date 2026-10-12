import assert from "node:assert/strict"
import { test } from "node:test"
import { GAP, placeAbove, placeBeside, type PlacementInput, type Point } from "./placement.ts"

const bounds = { left: 0, top: 0, right: 1000, bottom: 800 }

function input(overrides: Partial<PlacementInput>): PlacementInput {
  return {
    anchor: { x: 500, y: 400, radius: 15 },
    width: 200,
    height: 80,
    bounds,
    obstacles: [],
    dots: [],
    dotRadius: 10,
    keep: null,
    ...overrides,
  }
}

function grid(left: number, top: number, right: number, bottom: number): Point[] {
  const dots: Point[] = []
  for (let x = left; x <= right; x += 20) for (let y = top; y <= bottom; y += 20) dots.push({ x, y })
  return dots
}

test("picks the side covering the fewest dots", () => {
  const dots = [...grid(200, 300, 480, 500), ...grid(520, 300, 800, 500), ...grid(300, 420, 700, 600)]
  const placement = placeBeside(input({ dots }))
  assert.equal(placement.side, "above")
  assert.equal(placement.top + 80, 400 - 15 - GAP)
})

test("skips sides that overlap an obstacle or leave the bounds", () => {
  const anchor = { x: 900, y: 400, radius: 15 }
  const obstacles = [{ left: 0, top: 0, right: 1000, bottom: 380 }]
  const placement = placeBeside(input({ anchor, obstacles, dots: grid(600, 400, 880, 480) }))
  assert.equal(placement.side, "below")
})

test("keeps the previous side while it stays clear", () => {
  const dots = grid(520, 300, 800, 500)
  assert.equal(placeBeside(input({ dots })).side !== "right", true)
  assert.equal(placeBeside(input({ dots, keep: "right" })).side, "right")
  assert.notEqual(placeBeside(input({ anchor: { x: 900, y: 400, radius: 15 }, keep: "right" })).side, "right")
})

test("slides along the free axis and keeps the arrow facing the anchor", () => {
  const anchor = { x: 40, y: 400, radius: 15 }
  const placement = placeBeside(input({ anchor, keep: "below" }))
  assert.equal(placement.side, "below")
  assert.equal(placement.left, 0)
  assert.equal(placement.arrow, 40)
})

test("above the columns, the card clears the highest dot it overhangs", () => {
  const column = (x: number, top: number) => grid(x, top, x, 700)
  const dots = [...column(460, 300), ...column(500, 420), ...column(540, 200)]
  const anchor = { x: 500, y: 420, radius: 12 }
  const placement = placeAbove(input({ anchor, dots, width: 120 }))
  assert.equal(placement.side, "above")
  const right = placement.left + 120
  const overhung = dots.filter(d => d.x + 10 > placement.left && d.x - 10 < right && d.y < anchor.y)
  const bottom = placement.top + 80
  assert.ok(overhung.every(d => d.y - 10 >= bottom + GAP))
  assert.equal(placement.leader, anchor.y - anchor.radius - bottom)
  assert.deepEqual(placement, { side: "above", left: 410, top: 200, arrow: 90, leader: 128 })
})

test("above a dot, the card sits as low as the dots it overhangs allow, then as centred as it can, its arrow within reach of the dot", () => {
  const anchor = { x: 500, y: 420, radius: 12 }
  const above = (overrides: Partial<PlacementInput>) => placeAbove(input({ anchor, width: 120, ...overrides }))
  assert.deepEqual(above({}), { side: "above", left: 438, top: 318, arrow: 62, leader: 10 })
  const tall = (x: number) => grid(x, 100, x, 700)
  assert.deepEqual(above({ dots: tall(420) }), { side: "above", left: 438, top: 318, arrow: 62, leader: 10 })
  assert.deepEqual(above({ dots: tall(520) }), { side: "above", left: 438, top: 0, arrow: 62, leader: 328 })
  assert.deepEqual(above({ dots: tall(480) }), { side: "above", left: 438, top: 0, arrow: 62, leader: 328 })
})

test("a dot overhangs the card from the moment its edge passes the card's edge, and a dot level with or below the anchor never lifts it", () => {
  const above = (dots: readonly Point[], radius = 12) => placeAbove(input({ anchor: { x: 500, y: 420, radius }, width: 120, dots }))
  assert.deepEqual(above([{ x: 428, y: 100 }]), { side: "above", left: 438, top: 318, arrow: 62, leader: 10 })
  assert.deepEqual(above([{ x: 432, y: 100 }]), { side: "above", left: 442, top: 318, arrow: 58, leader: 10 })
  assert.deepEqual(above([{ x: 480, y: 420 }, { x: 520, y: 600 }], 4), { side: "above", left: 438, top: 326, arrow: 62, leader: 10 })
})

test("above a dot near the stage's edges, the card stays inside the stage, and goes beside the dot when there is no room above", () => {
  const above = (x: number, y: number) => placeAbove(input({ anchor: { x, y, radius: 12 }, width: 120 }))
  assert.deepEqual(above(30, 420), { side: "above", left: 0, top: 318, arrow: 30, leader: 10 })
  assert.deepEqual(above(962, 420), { side: "above", left: 880, top: 318, arrow: 82, leader: 10 })
  assert.deepEqual(above(500, 102), { side: "above", left: 438, top: 0, arrow: 62, leader: 10 })
  assert.equal(above(500, 101).side, "left")
  const clear = placeAbove(input({ anchor: { x: 500, y: 420, radius: 12 }, width: 120, obstacles: [{ left: 0, top: 0, right: 480, bottom: 800 }] }))
  assert.deepEqual(clear, { side: "above", left: 482, top: 318, arrow: 18, leader: 10 })
})

const inside = ({ left, top }: { left: number; top: number }, width: number, height: number, area: typeof bounds) =>
  left >= area.left && top >= area.top && left + width <= area.right && top + height <= area.bottom

test("a card blocked on every side goes over the legend rather than past the edge of a small embed", () => {
  const embed = { left: 8, top: 8, right: 272, bottom: 392 }
  const legend = { left: 8, top: 250, right: 272, bottom: 392 }
  const placement = placeBeside(input({ anchor: { x: 245, y: 137, radius: 12 }, width: 264, height: 122, bounds: embed, obstacles: [legend], dots: grid(20, 20, 260, 240) }))
  assert.deepEqual(placement, { side: "below", left: 8, top: 159, arrow: 237, leader: 0 })
})

test("a card too big for any side of an embed is moved inside it, and its arrow stays on its edge, as near the dot as the edge goes", () => {
  const embed = { left: 8, top: 8, right: 292, bottom: 192 }
  const tall = placeBeside(input({ anchor: { x: 150, y: 100, radius: 12 }, width: 284, height: 122, bounds: embed }))
  assert.deepEqual(tall, { side: "below", left: 8, top: 70, arrow: 142, leader: 0 })
  const cornered = placeBeside(input({ anchor: { x: 285, y: 185, radius: 12 }, width: 200, height: 150, bounds: embed, keep: "right" }))
  assert.ok(inside(cornered, 200, 150, embed))
  assert.deepEqual(cornered, { side: "left", left: 63, top: 42, arrow: 136, leader: 0 })
})

test("a card beside its dot slides along its side to clear the legend, instead of leaving the embed", () => {
  const embed = { left: 8, top: 8, right: 1192, bottom: 292 }
  const legend = { left: 122, top: 243, right: 1078, bottom: 276 }
  const placement = placeBeside(input({ anchor: { x: 500, y: 180, radius: 12 }, width: 300, height: 164, bounds: embed, obstacles: [legend] }))
  assert.deepEqual(placement, { side: "left", left: 178, top: 79, arrow: 101, leader: 0 })
  const under = placeBeside(input({ anchor: { x: 500, y: 150, radius: 12 }, width: 300, height: 120, obstacles: [{ left: 0, top: 0, right: 1000, bottom: 120 }], keep: "right" }))
  assert.deepEqual(under, { side: "right", left: 522, top: 120, arrow: 30, leader: 0 })
})

test("between clear sides hiding as many dots, the card turns towards the rostrum: right on the left wing, left on the right wing, below elsewhere", () => {
  const corners = [{ x: 0, y: 800 }, { x: 1000, y: 800 }]
  const side = (x: number, y: number, dots: readonly Point[] = corners) => placeBeside(input({ anchor: { x, y, radius: 15 }, dots })).side
  assert.deepEqual([side(300, 700), side(900, 700), side(500, 300)], ["right", "left", "below"])
  assert.equal(side(100, 300, [{ x: -1000, y: 310 }, { x: 0, y: 310 }]), "below")
  const at150Degrees = placeBeside(input({ anchor: { x: 0, y: 400, radius: 15 }, bounds: { ...bounds, left: -1000 }, dots: [{ x: 0, y: 401 }, { x: 3.4641016151377544, y: 401 }] }))
  assert.equal(at150Degrees.side, "below")
})

test("a previous side is kept only while its card stays clear of obstacles and keeps its arrow on its edge", () => {
  const overObstacle = placeBeside(input({ keep: "above", obstacles: [{ left: 400, top: 280, right: 600, bottom: 380 }] }))
  assert.deepEqual(overObstacle, { side: "left", left: 275, top: 380, arrow: 20, leader: 0 })
  const kept = (y: number) => placeBeside(input({ anchor: { x: 500, y, radius: 15 }, keep: "left" })).side
  assert.deepEqual([kept(5), kept(14), kept(786), kept(795)], ["below", "left", "left", "above"])
})

test("with every side over an obstacle, the card covers the least of them", () => {
  const band = { left: 0, top: 380, right: 1000, bottom: 420 }
  const overAbove = { left: 400, top: 300, right: 600, bottom: 375 }
  const overBelow = { left: 400, top: 425, right: 600, bottom: 435 }
  assert.deepEqual(placeBeside(input({ obstacles: [band, overAbove, overBelow] })), { side: "below", left: 400, top: 425, arrow: 100, leader: 0 })
})

test("a card slides only for obstacles across its own path, not for those that merely touch it or lie beside it", () => {
  const beside = [{ left: 822, top: 0, right: 1000, bottom: 120 }, { left: 0, top: 0, right: 522, bottom: 120 }]
  const placement = placeBeside(input({ anchor: { x: 500, y: 150, radius: 12 }, width: 300, height: 120, keep: "right", obstacles: beside }))
  assert.deepEqual(placement, { side: "right", left: 522, top: 90, arrow: 60, leader: 0 })
})

test("an obstacle that stops right at the dot's height pushes the card wholly past it, its arrow then on its corner", () => {
  const strip = { left: 0, top: 340, right: 330, bottom: 460 }
  const beside = (obstacle: typeof bounds) => placeBeside(input({ anchor: { x: 100, y: 400, radius: 5 }, height: 50, bounds: strip, obstacles: [obstacle] }))
  assert.deepEqual(beside({ left: 0, top: 400, right: 330, bottom: 460 }), { side: "right", left: 115, top: 350, arrow: 36, leader: 0 })
  assert.deepEqual(beside({ left: 0, top: 340, right: 330, bottom: 400 }), { side: "right", left: 115, top: 400, arrow: 14, leader: 0 })
})

test("a dot right on a card's edge is not hidden by it", () => {
  const onLeftCardEdges = [{ x: 275, y: 400 }, { x: 475, y: 400 }, { x: 375, y: 360 }, { x: 375, y: 440 }]
  assert.deepEqual(placeBeside(input({ dots: onLeftCardEdges })), { side: "left", left: 275, top: 360, arrow: 40, leader: 0 })
})

test("a card past the stage's right edge is moved back inside, its arrow on its side facing the dot", () => {
  const stage = { left: 0, top: 0, right: 300, bottom: 200 }
  assert.deepEqual(placeBeside(input({ anchor: { x: 60, y: 100, radius: 5 }, width: 260, height: 150, bounds: stage })), { side: "right", left: 40, top: 25, arrow: 75, leader: 0 })
})
