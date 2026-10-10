import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { NumberFeature } from "../data/features.ts"
import { seatsOf } from "../sources/seats.ts"
import { MISSING, type Data, type Parts, type Shape } from "../sources/shapes.ts"
import type { Frame, Scene } from "./form.ts"
import { FORMS, layOut, type FormName } from "./registry.ts"

type Sample<S extends Shape> = { readonly name: string; readonly data: Pick<Data, S>; readonly deputies: readonly DeputyId[] }

const FRAMES: Readonly<Record<string, Frame>> = {
  wide: { area: { left: -1.18, top: -0.887, right: 1.18, bottom: -0.04 }, px: 1 / 600 },
  narrow: { area: { left: 0, top: 0, right: 0.7, bottom: 0.8 }, px: 0.002 },
  short: { area: { left: 0, top: 0, right: 0.7, bottom: 0.28 }, px: 0.002 },
  phone: { area: { left: -1.03, top: -1.441, right: 1.03, bottom: 0.495 }, px: 1 / 170.45 },
}

let next = 0
const fresh = () => deputyId(`PA${next++}`)

function partsOf(sizes: readonly number[]): Parts {
  const parts = sizes.map((size, i) => {
    const members = Array.from({ length: size }, fresh)
    return { key: String(i), label: `Valeur n° ${i}`, title: `Valeur n° ${i}`, caption: null, color: "", members }
  })
  return { title: "t", parts, keyOf: id => parts.find(p => p.members.includes(id))?.key ?? MISSING, colorOf: () => "" }
}

function nominal(name: string, sizes: readonly number[]): Sample<"nominal"> {
  const parts = partsOf(sizes)
  return { name, data: { nominal: parts }, deputies: parts.parts.flatMap(p => p.members) }
}

function ordinal(name: string, sizes: readonly number[]): Sample<"ordinal"> {
  const parts = partsOf(sizes)
  return { name, data: { ordinal: parts }, deputies: parts.parts.flatMap(p => p.members) }
}

function room(): Sample<"seats"> {
  const deputies: { id: DeputyId; seat: { number: string; x: number; y: number } }[] = []
  const emptySeats: { number: string; x: number; y: number }[] = []
  let number = 0
  for (let radius = 0.3125; radius <= 1; radius += 0.0625) {
    const count = Math.floor((Math.PI * radius) / 0.045) + 1
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * i) / (count - 1)
      const seat = { number: String(++number), x: radius * Math.cos(angle), y: -radius * Math.sin(angle) }
      if (number % 40 === 0) emptySeats.push(seat)
      else deputies.push({ id: fresh(), seat })
    }
  }
  const seats = seatsOf({ deputies, emptySeats }, { viewBox: "-1.1 -1.1 2.2 1.5", markup: "" })
  return { name: "room", data: { seats }, deputies: deputies.map(d => d.id) }
}

const AGE: NumberFeature = { kind: "number", key: "f:age", file: "f", column: "age", title: "Âge" }
const drawn = Array.from({ length: 50 }, fresh)

const SAMPLES: { readonly [S in Shape]: readonly Sample<S>[] } = {
  nominal: [
    nominal("vote", [296, 224, 41, 1, 15]),
    nominal("groups", [70, 38, 67, 17, 23, 37, 11, 90, 47, 17, 34, 118]),
    nominal("regions", Array.from({ length: 24 }, (_, i) => (i === 0 ? 97 : 20))),
    nominal("one", [1]),
  ],
  ordinal: [ordinal("ages", [3, 0, 0, 45, 120, 200, 150, 50, 0, 2, 9])],
  numbers: [{ name: "ages", data: { numbers: { feature: AGE, unit: "ans", drawn, valueOf: () => 40 } }, deputies: drawn }],
  seats: [room()],
}

const NAMES = Object.keys(FORMS).filter((name): name is FormName => name in FORMS)

function cases(): { label: string; scene: Scene | null; deputies: readonly DeputyId[] }[] {
  const order = (a: DeputyId, b: DeputyId) => a.localeCompare(b)
  return NAMES.flatMap(name => {
    const shapes: readonly Shape[] = FORMS[name].shapes
    return shapes.flatMap(shape =>
      SAMPLES[shape].flatMap(sample => {
        const data: Partial<Data> = sample.data
        return Object.entries(FRAMES).map(([frameName, frame]) => ({
          label: `${name} over ${shape} ${sample.name} in a ${frameName} frame`,
          scene: layOut(name, data, { frame, order }),
          deputies: sample.deputies,
        }))
      }),
    )
  })
}

test("every registered form places each deputy of its input exactly once, and only them", () => {
  for (const { label, scene, deputies } of cases()) {
    assert.ok(scene, label)
    assert.deepEqual([...scene.dots.keys()].sort(), [...deputies].sort(), label)
    for (const id of deputies) assert.ok(scene.where(id), `${label}: ${id} has no place`)
    assert.equal(scene.where(deputyId("nobody")), null, label)
  }
})

test("no two dots of a registered form are closer than its pitch", () => {
  for (const { label, scene } of cases()) {
    assert.ok(scene && scene.pitch > 0, label)
    const points = [...scene.dots.values()]
    points.forEach((a, i) => {
      for (const b of points.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= scene.pitch * (1 - 1e-9), label)
    })
  }
})

test("every dot of a registered form lies inside its box, radius included", () => {
  for (const { label, scene } of cases()) {
    assert.ok(scene, label)
    const { box, radius } = scene
    for (const { x, y } of scene.dots.values())
      assert.ok(x - radius >= box.left && x + radius <= box.right && y - radius >= box.top && y + radius <= box.bottom, `${label}: ${x}, ${y}`)
  }
})

test("the reading lines of a registered form cover each of its deputies once", () => {
  for (const { label, scene, deputies } of cases()) {
    assert.ok(scene, label)
    assert.deepEqual(scene.lines.flat().sort(), [...deputies].sort(), label)
  }
})
