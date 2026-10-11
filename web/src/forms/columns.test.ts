import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import { step } from "../preview/neighbours.ts"
import { MISSING, type Parts } from "../sources/shapes.ts"
import { placeColumns } from "./columns.ts"
import type { Frame, Scene } from "./form.ts"

const PX = 0.002
const WIDE: Frame = { area: { left: -1, top: -0.8, right: 1.8, bottom: 0.2 }, px: PX }
const NARROW: Frame = { area: { left: 0, top: 0, right: 0.7, bottom: 0.8 }, px: PX }
const SHORT: Frame = { area: { left: 0, top: 0, right: 0.7, bottom: 0.28 }, px: PX }
const NARROWEST_CHAR_EM = 0.5

const VOTE = { Pour: 296, Contre: 224, Abstention: 41, "Non-votant": 1, Absent: 15 }
const LONG = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`Collectivité d'outre-mer n° ${i + 1}`, i === 0 ? 97 : 20]))
const MANY = { "Non renseigné": 3, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`${25 + 5 * i}–${29 + 5 * i} ans`, 45])) }
const GROUPS = { RN: 123, EPR: 91, LFI: 71, SOC: 66, DR: 47, EcoS: 38, Dem: 36, HOR: 34, LIOT: 23, GDR: 17, UDR: 16, NI: 5 }

function partsOf(sizes: Record<string, number>): Parts {
  let next = 0
  const parts = Object.entries(sizes).map(([label, size]) => ({
    key: label,
    label,
    title: label,
    caption: null,
    members: Array.from({ length: size }, () => deputyId(`PA${next++}`)),
  }))
  return { title: "c", parts, keyOf: id => parts.find(p => p.members.includes(id))?.key ?? MISSING }
}

const place = (sizes: Record<string, number>, frame: Frame) => placeColumns({ main: partsOf(sizes) }, { frame, order: () => 0 })

function pitchOf(scene: Scene): number {
  const xs = (scene.lines[0] ?? []).map(id => scene.dots.get(id)?.x ?? NaN)
  return Math.min(...xs.slice(1).map((x, i) => x - (xs[i] ?? NaN)))
}

function axis(scene: Scene) {
  const base = scene.marks.flatMap(m => (m.kind === "rule" && m.tone === "base" ? [m] : []))[0]
  assert.ok(base)
  return { left: base.from.x, right: base.to.x, baseline: base.from.y }
}

const labelsOf = (scene: Scene) => scene.marks.flatMap(m => (m.kind === "label" ? [m] : []))

for (const [name, frame] of [["wide", WIDE], ["narrow", NARROW]] as const) {
  test(`in a ${name} area, the columns fill the limiting side and keep every dot, the axis and the labels inside`, () => {
    const scene = place(VOTE, frame)
    const { area } = frame
    const { left, right, baseline } = axis(scene)
    const points = [...scene.dots.values()]
    for (const { x, y } of points) {
      assert.ok(x - scene.radius >= area.left && x + scene.radius <= area.right, `x ${x}`)
      assert.ok(y - scene.radius >= area.top && y + scene.radius <= baseline, `y ${y}`)
    }
    const [label] = labelsOf(scene)
    assert.ok(label)
    assert.ok(left - label.size * 2 >= area.left && right <= area.right)
    const lowest = label.lay.kind === "flat" ? label.at.y + label.lay.lineHeight : label.at.y
    assert.ok(lowest < area.bottom)
    const top = Math.min(...points.map(p => p.y)) - pitchOf(scene) / 2
    const heightUsed = (baseline - top) / (area.bottom - area.top)
    const widthUsed = (right - left) / (area.right - area.left)
    assert.ok(Math.max(heightUsed, widthUsed) > 0.85, `height ${heightUsed}, width ${widthUsed}`)
  })
}

test("column labels lie flat under wide columns and slant when the columns are too narrow for them", () => {
  assert.equal(labelsOf(place(VOTE, WIDE))[0]?.lay.kind, "flat")
  assert.equal(labelsOf(place(MANY, NARROW))[0]?.lay.kind, "slanted")
})

test("slanted labels keep their whole length inside the area, to the left and below", () => {
  for (const label of labelsOf(place(MANY, NARROW))) {
    assert.ok(label.lay.kind === "slanted")
    const slant = Math.sin((label.lay.degrees * Math.PI) / 180)
    const length = `${label.count} ${label.text}`.length * NARROWEST_CHAR_EM * label.size
    const start = { x: label.at.x - slant * length, y: label.at.y + slant * length }
    assert.ok(start.x >= NARROW.area.left && start.y <= NARROW.area.bottom, `${label.text}: ${start.x}, ${start.y}`)
  }
})

test("slanted labels shrink just enough for neighbouring labels to sit a line apart, and keep their full size when the columns leave room", () => {
  const [first, second] = labelsOf(place(LONG, NARROW))
  assert.ok(first && second && first.lay.kind === "slanted")
  const apart = (second.at.x - first.at.x) * Math.sin((first.lay.degrees * Math.PI) / 180)
  assert.ok(apart >= first.size && apart <= 1.25 * first.size, `${apart} apart for ${first.size}`)
  assert.equal(labelsOf(place(LONG, WIDE))[0]?.size, 12 * PX)
})

test("in a short area, long labels give up size so the dots keep most of the height and stay inside", () => {
  const scene = place(LONG, SHORT)
  const { area } = SHORT
  assert.ok(axis(scene).baseline - area.top >= 0.5 * (area.bottom - area.top), `baseline ${axis(scene).baseline}`)
  for (const { y } of scene.dots.values()) assert.ok(y - scene.radius >= area.top, `y ${y}`)
})

test("each column fills from its bottom left in the target order, and each line is a row read left to right across the columns", () => {
  const parts = partsOf({ a: 3, b: 2 })
  const scene = placeColumns({ main: parts }, { frame: WIDE, order: (x, y) => y.localeCompare(x) })
  const [a, b] = parts.parts
  assert.ok(a && b)
  const at = (id: DeputyId) => scene.dots.get(id) ?? assert.fail(id)
  const bottomLeft = (ids: readonly DeputyId[]) => ids.toSorted((p, q) => at(q).y - at(p).y || at(p).x - at(q).x)[0]
  assert.equal(bottomLeft(a.members), deputyId("PA2"))
  assert.equal(bottomLeft(b.members), deputyId("PA4"))
  for (const line of scene.lines) {
    assert.equal(new Set(line.map(id => at(id).y)).size, 1)
    assert.deepEqual(line.map(id => at(id).x), line.map(id => at(id).x).toSorted((p, q) => p - q))
  }
  const lastOfA = scene.lines[0]?.filter(id => a.members.includes(id)).at(-1)
  assert.ok(lastOfA)
  assert.equal(step(scene.lines, lastOfA, "right"), deputyId("PA4"))
})

test("the axis runs a pitch past the outer dots, each label is centred under its column's dots, and ticks count the deputies below whole rows up to the top one", () => {
  const sizes = { a: 120, b: 80, c: 40 }
  const scene = place(sizes, WIDE)
  const { left, right, baseline } = axis(scene)
  const xs = [...scene.dots.values()].map(p => p.x)
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9
  const pitch = pitchOf(scene)
  assert.ok(close(Math.min(...xs) - pitch * 1.5, left) && close(Math.max(...xs) + pitch * 1.5, right))
  for (const label of labelsOf(scene)) {
    const column = partsOf(sizes).parts.find(p => p.key === label.text)
    assert.ok(column)
    const own = column.members.map(id => scene.dots.get(id)?.x ?? NaN)
    assert.ok(close((Math.min(...own) + Math.max(...own)) / 2, label.at.x), label.text)
    assert.ok(label.at.y > baseline)
  }
  const perColumnRow = (scene.lines[0]?.length ?? 0) / 3
  const ticks = scene.marks.flatMap(m => (m.kind === "tick" ? [m] : []))
  assert.deepEqual(ticks.map(tick => tick.text), ["30", "60", "90", "120"])
  for (const tick of ticks) {
    const rowsBelow = (baseline - tick.at.y) / pitch
    assert.ok(close(rowsBelow, Math.round(rowsBelow)) && Number(tick.text) === Math.round(rowsBelow) * perColumnRow, tick.text)
    assert.ok(tick.at.x < left)
  }
})

test("one label too long to lie flat under its column slants every label", () => {
  const { Absent, ...others } = VOTE
  assert.equal(labelsOf(place({ ...others, "Absent de l'hémicycle lors du scrutin public": Absent }, WIDE))[0]?.lay.kind, "slanted")
})

test("a label lies flat while it fits its column widened into the gaps, and one more character slants every label", () => {
  const { Absent, ...others } = VOTE
  const layOf = (length: number) => labelsOf(place({ ...others, ["x".repeat(length)]: Absent }, WIDE))[0]?.lay.kind
  assert.equal(layOf(33), "flat")
  assert.equal(layOf(34), "slanted")
})

test("each deputy's place is their column's part", () => {
  const parts = partsOf({ a: 2, b: 1 })
  const scene = placeColumns({ main: parts }, { frame: WIDE, order: () => 0 })
  for (const part of parts.parts) for (const id of part.members) assert.deepEqual(scene.where(id), { kind: "part", part, within: "la colonne" })
})

test("columns keep the geometry tuned on the chart they replace, for a vote, groups, regions and ages", () => {
  const digest = (sizes: Record<string, number>, frame: Frame) => {
    const parts = partsOf(sizes)
    const scene = placeColumns({ main: parts }, { frame, order: () => 0 })
    const round = (n: number) => Math.round(n * 1e6) / 1e6
    const at = (part: Parts["parts"][number] | undefined) => {
      const point = part && scene.dots.get(part.members[0] ?? deputyId("none"))
      return point ? [round(point.x), round(point.y)] : null
    }
    const [label] = labelsOf(scene)
    return {
      radius: round(scene.radius),
      snap: round(scene.snap),
      first: [at(parts.parts[0]), at(parts.parts[1])],
      label: label && { lay: label.lay, size: round(label.size), at: [round(label.at.x), round(label.at.y)], title: label.title },
      ticks: scene.marks.flatMap(m => (m.kind === "tick" ? [[m.text, round(m.at.x), round(m.at.y)]] : [])),
      base: [round(axis(scene).left), round(axis(scene).right), round(axis(scene).baseline)],
    }
  }
  assert.deepEqual(digest(VOTE, WIDE), {
    radius: 0.015348,
    snap: 0.021926,
    first: [[-0.868032, 0.109728], [-0.319872, 0.109728]],
    label: { lay: { kind: "flat", lineHeight: 0.03 }, size: 0.024, at: [-0.66704, 0.1592], title: "296 · Pour" },
    ticks: [["72", -0.932448, -0.091264], ["144", -0.932448, -0.310528], ["216", -0.932448, -0.529792], ["288", -0.932448, -0.749056]],
    base: [-0.922848, 1.781408, 0.128],
  })
  assert.deepEqual(digest(GROUPS, NARROW), {
    radius: 0.005498,
    snap: 0.007854,
    first: [[0.078196, 0.691584], [0.130558, 0.691584]],
    label: { lay: { kind: "slanted", degrees: 45 }, size: 0.024, at: [0.091287, 0.719729], title: "123 · RN" },
    ticks: [["60", 0.04896, 0.436317], ["120", 0.04896, 0.174505]],
    base: [0.05856, 0.7, 0.698129],
  })
  assert.deepEqual(digest(LONG, NARROW), {
    radius: 0.003055,
    snap: 0.004364,
    first: [[0.179991, 0.598629], [0.201809, 0.598629]],
    label: { lay: { kind: "slanted", degrees: 45 }, size: 0.014022, at: [0.183627, 0.614885], title: "97 · Collectivité d'outre-mer n° 1" },
    ticks: [["30", 0.163473, 0.493173], ["60", 0.163473, 0.38408], ["90", 0.163473, 0.274987]],
    base: [0.169082, 0.7, 0.602266],
  })
  assert.deepEqual(digest(LONG, SHORT), {
    radius: 0.002121,
    snap: 0.00303,
    first: [[0.096433, 0.165475], [0.121687, 0.165475]],
    label: { lay: { kind: "slanted", degrees: 45 }, size: 0.007942, at: [0.10401, 0.175148], title: "97 · Collectivité d'outre-mer n° 1" },
    ticks: [["40", 0.08568, 0.117492], ["80", 0.08568, 0.066985]],
    base: [0.088857, 0.7, 0.168],
  })
  assert.deepEqual(digest(MANY, SHORT), {
    radius: 0.004441,
    snap: 0.006344,
    first: [[0.12432, 0.162713], [0.166617, 0.162713]],
    label: { lay: { kind: "slanted", degrees: 45 }, size: 0.015647, at: [0.134894, 0.182082], title: "3 · Non renseigné" },
    ticks: [["30", 0.1022, 0.062259]],
    base: [0.108459, 0.668887, 0.168],
  })
})
