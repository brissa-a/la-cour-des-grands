import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { CategoryFeature, ColorableFeature, NumberFeature } from "../data/features.ts"
import { definePaint } from "../paint/paint.ts"
import { paintParts } from "../paint/palette.ts"
import { readSeats } from "../sources/read.ts"
import { seatsOf } from "../sources/seats.ts"
import { MISSING, OFFERS, SEAT, VOTE, type Categories, type Numbers, type Parts, type Reading, type Seats, type Shape } from "../sources/shapes.ts"
import { defineForm, type Frame, type Scene } from "./form.ts"
import { arrange, FORMS, LAYOUTS, layOut, layoutsOf, type ExtraSources, type FormName } from "./registry.ts"

const FRAMES: Readonly<Record<string, Frame>> = {
  wide: { area: { left: -1.18, top: -0.887, right: 1.18, bottom: -0.04 }, px: 1 / 600 },
  narrow: { area: { left: 0, top: 0, right: 0.7, bottom: 0.8 }, px: 0.002 },
  short: { area: { left: 0, top: 0, right: 0.7, bottom: 0.28 }, px: 0.002 },
  phone: { area: { left: -1.03, top: -1.441, right: 1.03, bottom: 0.495 }, px: 1 / 170.45 },
}

const GROUP: CategoryFeature = { kind: "category", key: "f:group", file: "f", column: "group", title: "Groupe", values: "v" }
const AGE: NumberFeature = { kind: "number", key: "f:age", file: "f", column: "age", title: "Âge" }

let next = 0
const fresh = () => deputyId(`PA${next++}`)

function partsOf(sizes: readonly number[]): Categories {
  const parts = sizes.map((size, i) => {
    const members = Array.from({ length: size }, fresh)
    return { key: String(i), label: `Valeur n° ${i}`, title: `Valeur n° ${i}`, caption: null, color: "", members }
  })
  return { title: "t", parts, keyOf: id => parts.find(p => p.members.includes(id))?.key ?? MISSING, colorOf: () => "" }
}

const deputiesOf = (parts: Parts) => parts.parts.flatMap(p => p.members)

function nominal(name: string, sizes: readonly number[]): Sample {
  const parts = partsOf(sizes)
  return { name, reading: { source: GROUP, data: { nominal: parts }, lineOf: () => null }, deputies: deputiesOf(parts) }
}

function vote(sizes: readonly number[]): Sample {
  const parts = partsOf(sizes)
  const turnout = { present: parts.parts.slice(0, -1), absent: parts.parts.at(-1) ?? null }
  return { name: "vote", reading: { source: VOTE, data: { nominal: parts, turnout }, lineOf: () => null }, deputies: deputiesOf(parts) }
}

function ages(sizes: readonly number[]): Sample {
  const ordinal = partsOf(sizes)
  const drawn = deputiesOf(ordinal)
  const numbers: Numbers = { feature: AGE, unit: "ans", drawn, valueOf: () => 40 }
  return { name: "ages", reading: { source: AGE, data: { ordinal, numbers }, lineOf: () => null }, deputies: drawn }
}

function room(): Sample {
  const deputies: { id: DeputyId; seat: { number: string; x: number; y: number } }[] = []
  const emptySeats: { number: string; x: number; y: number }[] = []
  let number = 0
  for (let radius = 0.3125; radius <= 1; radius += 0.0625) {
    const count = Math.floor((Math.PI * radius) / 0.045) + 1
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * i) / (count - 1)
      const seat = { number: String(++number), x: -radius * Math.cos(angle), y: -radius * Math.sin(angle) }
      if (number % 40 === 0) emptySeats.push(seat)
      else deputies.push({ id: fresh(), seat })
    }
  }
  const seats = seatsOf({ deputies, emptySeats }, { viewBox: "-1.1 -1.1 2.2 1.5", markup: "" })
  return { name: "room", reading: readSeats(seats), deputies: deputies.map(d => d.id) }
}

type Sample = { readonly name: string; readonly reading: Reading; readonly deputies: readonly DeputyId[] }

const SAMPLES: readonly Sample[] = [
  vote([296, 224, 41, 1, 15]),
  nominal("groups", [70, 38, 67, 17, 23, 37, 11, 90, 47, 17, 34, 118]),
  nominal("regions", Array.from({ length: 24 }, (_, i) => (i === 0 ? 97 : 20))),
  nominal("one", [1]),
  ages([3, 0, 0, 45, 120, 200, 150, 50, 0, 2, 9]),
  room(),
]

const computed = (form: FormName) => {
  const shapes: readonly Shape[] = FORMS[form].slots.main
  return !shapes.includes("seats")
}

const NAMES = Object.keys(FORMS).filter((name): name is FormName => name in FORMS)

function over(feature: ColorableFeature, deputies: readonly DeputyId[]): Reading {
  const halves = [deputies.filter((_, i) => i % 2 === 0), deputies.filter((_, i) => i % 2 === 1)]
  const parts = halves.map((members, i) => ({ key: String(i), label: String(i), title: String(i), caption: null, color: "", members }))
  const keyOf = (id: DeputyId) => parts.find(p => p.members.includes(id))?.key ?? MISSING
  switch (feature.kind) {
    case "category":
      return { source: feature, data: { nominal: { title: feature.title, parts, keyOf, colorOf: () => "" } }, lineOf: () => null }
    case "number":
      return { source: feature, data: { ordinal: { title: feature.title, parts, keyOf }, numbers: { feature, unit: "", drawn: deputies, valueOf: () => 1 } }, lineOf: () => null }
  }
}

function extrasFor(form: FormName, deputies: readonly DeputyId[]): { readonly extra: ExtraSources; readonly readings: readonly Reading[] } {
  const slots: Readonly<Record<string, readonly Shape[]>> = FORMS[form].slots
  const picked = Object.entries(slots).flatMap(([slot, shapes]): [string, ColorableFeature][] => {
    const feature = [GROUP, AGE].find(f => {
      const offered: readonly Shape[] = OFFERS[f.kind]
      return offered.some(shape => shapes.includes(shape))
    })
    return slot !== "main" && feature ? [[slot, feature]] : []
  })
  return { extra: Object.fromEntries(picked), readings: picked.map(([, feature]) => over(feature, deputies)) }
}

type Case = { readonly label: string; readonly form: FormName; readonly frame: Frame; readonly scene: Scene; readonly deputies: readonly DeputyId[] }

function cases(): Case[] {
  const order = (a: DeputyId, b: DeputyId) => a.localeCompare(b)
  return SAMPLES.flatMap(({ name, reading, deputies }) =>
    NAMES.flatMap(form => {
      const { extra, readings } = extrasFor(form, deputies)
      const choice = LAYOUTS[form](reading.source, extra)
      if (!choice) return []
      const arrangement = arrange(choice, source => [reading, ...readings].find(r => r.source === source) ?? null, order)
      assert.ok(arrangement, `${form} over ${name}`)
      return Object.entries(FRAMES).map(([frameName, frame]) => ({
        label: `${form} over ${name} in a ${frameName} frame`,
        form,
        frame,
        scene: layOut(arrangement, frame),
        deputies,
      }))
    }),
  )
}

test("each source is offered, in registry order, every form whose main slot takes a shape the source offers", () => {
  for (const source of [GROUP, AGE, VOTE, SEAT]) {
    const offered: readonly Shape[] = OFFERS[source.kind]
    const accepting = NAMES.filter(form => {
      const shapes: readonly Shape[] = FORMS[form].slots.main
      return shapes.some(shape => offered.includes(shape))
    })
    assert.deepEqual(NAMES.filter(form => LAYOUTS[form](source, extrasFor(form, []).extra)), accepting, source.kind)
  }
})

test("every registered form places each deputy of its input exactly once, and only them", () => {
  for (const { label, scene, deputies } of cases()) {
    assert.deepEqual([...scene.dots.keys()].sort(), [...deputies].sort(), label)
    for (const id of deputies) assert.ok(scene.where(id), `${label}: ${id} has no place`)
    assert.equal(scene.where(deputyId("nobody")), null, label)
  }
})

test("no two dots of a registered form overlap", () => {
  for (const { label, scene } of cases()) {
    const points = [...scene.dots.values()]
    points.forEach((a, i) => {
      for (const b of points.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * scene.radius * (1 - 1e-9), label)
    })
  }
})

test("a form computed from values keeps every dot inside the free area of its frame, radius included", () => {
  for (const { label, form, frame, scene } of cases().filter(c => computed(c.form))) {
    const { area } = frame
    for (const { x, y } of scene.dots.values())
      assert.ok(x - scene.radius >= area.left && x + scene.radius <= area.right && y - scene.radius >= area.top && y + scene.radius <= area.bottom, `${label} (${form}): ${x}, ${y}`)
  }
})

test("the reading lines of a registered form cover each of its deputies once, each read from left to right", () => {
  for (const { label, scene, deputies } of cases()) {
    assert.deepEqual(scene.lines.flat().sort(), [...deputies].sort(), label)
    for (const line of scene.lines) {
      const xs = line.map(id => scene.dots.get(id)?.x ?? NaN)
      assert.deepEqual(xs, xs.toSorted((a, b) => a - b), label)
    }
  }
})

test("a layout is arranged from its choice's own sources, each read once and only once all are read, in the first shape its slot takes", () => {
  const ordinal = partsOf([1, 2])
  const numbers: Numbers = { feature: AGE, unit: "ans", drawn: deputiesOf(ordinal), valueOf: () => 40 }
  const age: Reading = { source: AGE, data: { ordinal, numbers }, lineOf: () => null }
  const order = () => 0
  const columnsOfAge = layoutsOf(AGE).find(choice => choice.form === "columns")
  assert.ok(columnsOfAge)
  const asked: unknown[] = []
  const arranged = arrange(columnsOfAge, source => (asked.push(source), age), order)
  assert.deepEqual(asked, [AGE])
  assert.ok(arranged?.form === "columns")
  assert.equal(arranged.inputs.main, ordinal)
  assert.equal(arranged.reading, age)
  assert.equal(arranged.order, order)
  assert.equal(arrange(columnsOfAge, () => null, order), null)
  assert.equal(arrange(columnsOfAge, () => room().reading, order), null)
})

export const probes = [
  // @ts-expect-error a form computed from values whose place reads seats
  defineForm({ label: "x", slots: { main: ["nominal"] }, place: ({ main }: { main: Seats }) => placed(main) }),
  // @ts-expect-error a form computed from values drawing the room from a plain string
  defineForm({ label: "x", slots: { main: ["nominal"] }, place: () => ({ ...placed(null), marks: [{ kind: "room", room: "<g/>", empty: [], radius: 1 }] }) }),
  // @ts-expect-error a form computed from values that also takes the seats, to draw the room
  defineForm({ label: "x", slots: { main: ["nominal", "seats"] }, place: () => placed(null) }),
  // @ts-expect-error a scene without reading lines
  defineForm({ label: "x", slots: { main: ["nominal"] }, place: () => ({ card: "above", radius: 1, snap: 1, dots: new Map(), hollow: new Set(), marks: [], where: () => null }) }),
  // @ts-expect-error a second slot read in a shape it does not take
  defineForm({ label: "x", slots: { main: ["numbers"], y: ["numbers"] }, place: ({ main, y }: { main: Numbers; y: Parts }) => placed([main, y]) }),
  // @ts-expect-error a palette over bins, which carry no colour
  definePaint({ label: "x", shapes: ["nominal", "ordinal"], paint: paintParts }),
]

export const choosers: readonly unknown[] = [
  // @ts-expect-error the columns chooser returning the hemicycle
  ((main => (main.kind === "seat" ? { form: "hemicycle", picks: { main } } : null)) satisfies typeof LAYOUTS.columns),
  // @ts-expect-error an arrangement written by hand rather than read by arrange
  layOut({ form: "columns", inputs: { main: partsOf([1]) }, reading: nominal("x", [1]).reading, order: () => 0 }, FRAMES.wide ?? assert.fail()),
]

function placed(input: unknown): Scene {
  void input
  return { card: "above", radius: 1, snap: 1, dots: new Map(), hollow: new Set(), marks: [], lines: [], where: () => null }
}
