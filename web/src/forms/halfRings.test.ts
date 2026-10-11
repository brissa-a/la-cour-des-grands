import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { Part, Point, Turnout } from "../sources/shapes.ts"
import type { Frame, Order, Scene } from "./form.ts"
import { halfRingGrid, placeHalfRings, type Slot } from "./halfRings.ts"
import { textEm } from "./text.ts"

const DESKTOP: Frame = { area: { left: -1.18, top: -0.89, right: 1.18, bottom: 0.0283 }, px: 1 / 600 }
const PHONE: Frame = { area: { left: -1.0296, top: -0.8897, right: 1.0296, bottom: 0.7529 }, px: 1 / 170.45 }

const VOTE = { Pour: 296, Contre: 224, Abstention: 41, "Non-votant": 1 }
const VOTE_ABSENT = 15
const CENSURE = { Pour: 197 }
const CENSURE_ABSENT = 378
const AT_THE_TOP = { Pour: 285, Contre: 1, Abstention: 1, "Non-votant": 1 }
const AT_THE_TOP_ABSENT = 280
const ORDINARY = { Pour: 40, Contre: 30, Abstention: 2, "Non-votant": 1 }
const ORDINARY_ABSENT = 503

const ROSTERS: readonly (readonly [Readonly<Record<string, number>>, number])[] = [
  [VOTE, VOTE_ABSENT],
  [CENSURE, CENSURE_ABSENT],
  [{ Pour: 77, Contre: 105, Abstention: 4, "Non-votant": 4 }, 384],
  [{ Pour: 10, Contre: 64, Abstention: 69, "Non-votant": 2 }, 429],
  [{ Pour: 108, Contre: 50, Abstention: 1, "Non-votant": 22 }, 395],
  [{ Pour: 8, Contre: 7, Abstention: 1, "Non-votant": 2 }, 556],
  [{ Pour: 109, Contre: 19, Abstention: 53, "Non-votant": 3 }, 390],
  [{ Pour: 110, Contre: 132, Abstention: 1, "Non-votant": 4 }, 327],
  [{ Pour: 247, Contre: 233, Abstention: 93 }, 1],
]

let next = 0
function partOf(label: string, size: number): Part {
  return { key: label, label, title: label, caption: null, members: Array.from({ length: size }, () => deputyId(`PA${next++}`)) }
}

function turnoutOf(present: Readonly<Record<string, number>>, absent: number | null): Turnout {
  return { present: Object.entries(present).map(([label, size]) => partOf(label, size)), absent: absent === null ? null : partOf("Absent", absent) }
}

const byId: Order = (a, b) => a.localeCompare(b)

const place = (turnout: Turnout, frame: Frame, order = byId) => placeHalfRings({ main: turnout }, { frame, order })

const sectorsOf = (present: Readonly<Record<string, number>>, absent: number) => [
  ...Object.values(present).map(count => ({ count, apart: false })),
  { count: absent, apart: true },
]

const pointOf = ({ radius, angle }: Slot): Point => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const dotOf = (scene: Scene) => (id: DeputyId) => scene.dots.get(id) ?? assert.fail(`${id} has no dot`)

const labelsOf = (scene: Scene) => scene.marks.flatMap(m => (m.kind === "label" ? [m] : []))

function centreOf(scene: Scene): Point {
  const outer = scene.lines.reduce((longest, line) => (line.length > longest.length ? line : longest))
  const [a, b, c] = [outer[0], outer[Math.floor(outer.length / 2)], outer.at(-1)].map(id => dotOf(scene)(id ?? assert.fail()))
  assert.ok(a && b && c)
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  const square = (p: Point) => p.x * p.x + p.y * p.y
  return {
    x: (square(a) * (b.y - c.y) + square(b) * (c.y - a.y) + square(c) * (a.y - b.y)) / d,
    y: (square(a) * (c.x - b.x) + square(b) * (a.x - c.x) + square(c) * (b.x - a.x)) / d,
  }
}

test("sectors are wedges in the parts' order: every dot of a sector lies on a wider angle than every dot of the sectors after it", () => {
  for (const [present, absent] of ROSTERS) {
    const sectors = halfRingGrid(sectorsOf(present, absent)).sectors.filter(slots => slots.length > 0)
    sectors.forEach((left, i) =>
      sectors.slice(i + 1).forEach(right => assert.ok(Math.min(...left.map(s => s.angle)) > Math.max(...right.map(s => s.angle)), `${JSON.stringify(present)}, sector ${i}`)),
    )
  }
})

test("each sector is in one piece: its dots link up through neighbours at most 1.6 pitches apart", () => {
  for (const [present, absent] of ROSTERS)
    halfRingGrid(sectorsOf(present, absent)).sectors.forEach((slots, i) => {
      const points = slots.map(pointOf)
      const reached = new Set(points.slice(0, 1))
      for (const from of reached) for (const to of points) if (distance(from, to) <= 1.6) reached.add(to)
      assert.equal(reached.size, points.length, `${JSON.stringify(present)}, sector ${i}`)
    })
})

test("the last sector ends every ring it reaches on the right base line, the first starts every ring it reaches on the left one", () => {
  for (const [present, absent] of ROSTERS) {
    const sectors = halfRingGrid(sectorsOf(present, absent)).sectors.filter(slots => slots.length > 0)
    const rings = (slots: readonly Slot[] | undefined) => [...new Set(slots?.map(slot => slot.ring))]
    for (const ring of rings(sectors.at(-1))) assert.equal(Math.min(...(sectors.at(-1) ?? []).filter(s => s.ring === ring).map(s => s.angle)), 0, `${JSON.stringify(present)}, ring ${ring}`)
    for (const ring of rings(sectors[0])) assert.equal(Math.max(...(sectors[0] ?? []).filter(s => s.ring === ring).map(s => s.angle)), Math.PI, `${JSON.stringify(present)}, ring ${ring}`)
  }
})

test("every boundary between sectors is an empty lane at least one pitch wide, and two pitches wide next to the part set apart", () => {
  for (const sectors of ROSTERS.map(([present, absent]) => sectorsOf(present, absent))) {
    const grid = halfRingGrid(sectors)
    grid.sectors.forEach((left, i) =>
      grid.sectors.slice(i + 1).forEach((right, k) => {
        const lane = sectors[i]?.apart || sectors[i + 1 + k]?.apart ? 2 : 1
        const closest = Math.min(...left.flatMap(a => right.map(b => distance(pointOf(a), pointOf(b)))))
        assert.ok(closest - 2 * 0.42 >= lane - 1e-9, `sectors ${i} and ${i + 1 + k}: ${closest}`)
      }),
    )
  }
})

test("each sector spans its part's share of the whole roster less the lanes, so a failed censure covers only a third of the half-turn", () => {
  for (const sectors of [sectorsOf(VOTE, VOTE_ABSENT), sectorsOf(CENSURE, CENSURE_ABSENT)]) {
    const roster = sectors.reduce((sum, { count }) => sum + count, 0)
    halfRingGrid(sectors).sectors.forEach((slots, i) => {
      const share = (sectors[i]?.count ?? 0) / roster
      if (share < 0.05) return
      const turn = (Math.max(...slots.map(s => s.angle)) - Math.min(...slots.map(s => s.angle))) / Math.PI
      assert.ok(turn >= 0.85 * share && turn <= share + 0.01, `sector ${i}: ${turn} of the half-turn for ${share} of the roster`)
    })
  }
})

test("a full roster leaves a hole near 0.45 of the outer radius, on rings whose slots sit about one pitch apart", () => {
  const grid = halfRingGrid(sectorsOf(VOTE, VOTE_ABSENT))
  assert.ok(Math.abs(grid.inner / (grid.inner + grid.rings - 1) - 0.45) < 0.02, `${grid.rings} rings from ${grid.inner}`)
  const slots = grid.sectors.flat()
  for (let ring = 0; ring < grid.rings; ring++) {
    const onRing = slots.filter(slot => slot.ring === ring).sort((a, b) => b.angle - a.angle)
    const steps = onRing.slice(1).map((slot, i) => distance(pointOf(slot), pointOf(onRing[i] ?? slot)))
    assert.ok(Math.min(...steps) >= 1 - 1e-9 && Math.min(...steps) < 1.15, `ring ${ring}: ${Math.min(...steps)}`)
  }
})

test("a single deputy and a full roster of 577 are each placed once, apart from one another and inside the area, with their label", () => {
  for (const [size, frame] of [[1, DESKTOP], [1, PHONE], [577, DESKTOP], [577, PHONE]] as const) {
    const turnout = turnoutOf({ Pour: size }, null)
    const scene = place(turnout, frame)
    const { area } = frame
    assert.equal(scene.dots.size, size)
    const points = [...scene.dots.values()]
    for (const { x, y } of points) assert.ok(x - scene.radius >= area.left && x + scene.radius <= area.right && y - scene.radius >= area.top && y + scene.radius <= area.bottom)
    const sorted = points.toSorted((a, b) => a.x - b.x)
    sorted.forEach((a, i) => {
      for (const b of sorted.slice(i + 1, i + 40)) assert.ok(distance(a, b) >= 2 * scene.radius * (1 - 1e-9))
    })
    assert.deepEqual(labelsOf(scene).map(label => [label.count, label.text]), [[size, "Pour"]])
  }
})

test("each sector is headed by its count then its label, in the parts' order, clear of every dot and of each other, inside the area", () => {
  const votes = [[VOTE, VOTE_ABSENT], [CENSURE, CENSURE_ABSENT], [AT_THE_TOP, AT_THE_TOP_ABSENT], [ORDINARY, ORDINARY_ABSENT]] as const
  for (const [present, absent] of votes)
    for (const frame of [DESKTOP, PHONE]) {
      const scene = place(turnoutOf(present, absent), frame)
      const labels = labelsOf(scene)
      assert.deepEqual(labels.map(label => [label.count, label.text]), [...Object.entries(present).map(([text, count]) => [count, text]), [absent, "Absent"]])
      const boxes = labels.map(({ at, count, text, size, lay }) => {
        assert.ok(lay.kind === "inline")
        const width = textEm(`${count} ${text}`) * size
        const left = lay.anchor === "start" ? at.x : at.x - width
        return { left, right: left + width, top: at.y - (1.25 * size) / 2, bottom: at.y + (1.25 * size) / 2 }
      })
      const { area } = frame
      boxes.forEach((box, i) => {
        assert.ok(box.left >= area.left && box.right <= area.right && box.top >= area.top && box.bottom <= area.bottom, `label ${i} outside`)
        for (const other of boxes.slice(i + 1)) assert.ok(box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top, `labels ${i} overlap`)
        for (const { x, y } of scene.dots.values()) {
          const nearest = { x: Math.min(Math.max(x, box.left), box.right), y: Math.min(Math.max(y, box.top), box.bottom) }
          assert.ok(distance(nearest, { x, y }) >= scene.radius, `label ${i} covers a dot`)
        }
      })
    }
})

test("each label sits on its own sector's ray, give or take half a line when a neighbour nudges it, half a line outside the arc, and runs away from it", () => {
  for (const [present, absent] of [[VOTE, VOTE_ABSENT], [CENSURE, CENSURE_ABSENT]] as const)
    for (const frame of [DESKTOP, PHONE]) {
      const turnout = turnoutOf(present, absent)
      const scene = place(turnout, frame)
      const centre = centreOf(scene)
      const angleOf = ({ x, y }: Point) => Math.atan2(centre.y - y, x - centre.x)
      const edge = Math.max(...[...scene.dots.values()].map(p => distance(p, centre))) + scene.radius
      const angles = labelsOf(scene).map(({ at }) => angleOf(at))
      assert.deepEqual(angles, angles.toSorted((a, b) => b - a))
      assert.deepEqual(scene.marks.filter(({ kind }) => kind === "rule"), [])
      for (const label of labelsOf(scene)) {
        const part = [...turnout.present, turnout.absent ?? assert.fail()].find(({ label: text }) => text === label.text) ?? assert.fail()
        const angles = part.members.map(id => angleOf(dotOf(scene)(id)))
        const nudged = (0.5 * label.size) / distance(label.at, centre) + 1e-6
        assert.ok(angleOf(label.at) >= Math.min(...angles) - nudged && angleOf(label.at) <= Math.max(...angles) + nudged, label.text)
        assert.deepEqual(label.lay, { kind: "inline", anchor: label.at.x < centre.x ? "end" : "start" })
        const beyond = (distance(label.at, centre) - edge) / label.size
        assert.ok(beyond >= 0.5 - 1e-6 && beyond <= 0.5 + 1.25, `${label.text}: ${beyond} em beyond the arc`)
      }
    }
})

test("labels crowded at either end of the arc stack a line apart in the parts' order, each tied by a leader from its own sector to the label's near end", () => {
  const crowds = [
    [{ Pour: 560, Contre: 3, Abstention: 2, "Non-votant": 1 }, 2, PHONE],
    [{ Pour: 110, Contre: 132, Abstention: 1, "Non-votant": 4 }, 327, DESKTOP],
    [{ Pour: 77, Contre: 105, Abstention: 4, "Non-votant": 4 }, 384, PHONE],
    [{ Pour: 8, Contre: 7, Abstention: 1, "Non-votant": 2 }, 556, PHONE],
    [AT_THE_TOP, AT_THE_TOP_ABSENT, DESKTOP],
  ] as const
  for (const [present, absent, frame] of crowds) {
    const turnout = turnoutOf(present, absent)
    const scene = place(turnout, frame)
    const centre = centreOf(scene)
    const angleOf = ({ x, y }: Point) => Math.atan2(centre.y - y, x - centre.x)
    const labels = labelsOf(scene)
    const angles = labels.map(({ at }) => angleOf(at))
    assert.deepEqual(angles, angles.toSorted((a, b) => b - a))
    for (const anchor of ["start", "end"]) {
      const lines = labels.flatMap(({ at, lay }) => (lay.kind === "inline" && lay.anchor === anchor ? [at.y] : [])).sort((a, b) => a - b)
      lines.slice(1).forEach((y, i) => assert.ok(y - (lines[i] ?? NaN) >= 1.25 * (labels[0]?.size ?? NaN) - 1e-12))
    }
    const leaders = scene.marks.flatMap(m => (m.kind === "rule" ? [m] : []))
    assert.ok(leaders.length > 0)
    for (const { from, to, tone } of leaders) {
      const label = labels.find(({ at, size }) => distance(at, to) <= 0.3 * size) ?? assert.fail("a leader ends away from every label")
      assert.ok(Math.abs(to.x - centre.x) < Math.abs(label.at.x - centre.x), `${label.text}: the leader ends on the far side of its label`)
      const sector = [...turnout.present, turnout.absent ?? assert.fail()].find(part => part.label === label.text) ?? assert.fail()
      const angles = sector.members.map(id => angleOf(dotOf(scene)(id)))
      assert.ok(angleOf(from) >= Math.min(...angles) - 1e-9 && angleOf(from) <= Math.max(...angles) + 1e-9, label.text)
      const own = Math.max(...sector.members.map(id => distance(dotOf(scene)(id), centre))) + scene.radius
      assert.ok(distance(from, centre) > own && distance(from, centre) < distance(to, centre), label.text)
      assert.equal(tone, "grid")
    }
  }
  const top = place(turnoutOf(AT_THE_TOP, AT_THE_TOP_ABSENT), DESKTOP)
  const alone = labelsOf(top).find(({ text }) => text === "Non-votant") ?? assert.fail()
  assert.ok(top.marks.every(mark => mark.kind !== "rule" || distance(mark.to, alone.at) > alone.size), "a label alone on its side of the top was pushed by the other side")
})

test("each label reads as its own sector's: the dot nearest its near end, or the start of its leader, is one of that sector's", () => {
  for (const [present, absent] of ROSTERS)
    for (const frame of [DESKTOP, PHONE]) {
      const turnout = turnoutOf(present, absent)
      const scene = place(turnout, frame)
      const partOf = new Map([...turnout.present, turnout.absent ?? assert.fail()].flatMap(part => part.members.map(id => [id, part.label])))
      for (const label of labelsOf(scene)) {
        const leader = scene.marks.find(mark => mark.kind === "rule" && distance(mark.to, label.at) <= 0.3 * label.size)
        const from = leader?.kind === "rule" ? leader.from : label.at
        const nearest = [...scene.dots].reduce((a, b) => (distance(b[1], from) < distance(a[1], from) ? b : a))
        assert.equal(partOf.get(nearest[0]), label.text, `${JSON.stringify(present)} ${frame.px}`)
      }
    }
})

test("a part nobody holds gets neither a sector nor a label", () => {
  const scene = place(turnoutOf({ Pour: 5, Contre: 0 }, 5), DESKTOP)
  assert.equal(scene.dots.size, 10)
  assert.deepEqual(labelsOf(scene).map(label => label.text), ["Pour", "Absent"])
})

test("a roster keeps the ring count and inner radius tuned for it, from one deputy to a full house", () => {
  const tuned: readonly (readonly [readonly number[], boolean, number, number])[] = [
    [[288, 222, 40, 1, 18], true, 13, 9.42],
    [[296, 224, 41, 1, 15], true, 13, 9.66],
    [[197, 378], true, 12, 10.3],
    [[577], false, 12, 9.66],
    [[10, 64, 69, 2, 429], true, 13, 9.48],
    [[8, 7, 1, 2, 556], true, 13, 9.56],
    [[49, 51], true, 5, 4.98],
    [[21, 43], true, 4, 4.12],
    [[12], false, 1, 3.52],
    [[5, 5], true, 1, 3.52],
    [[3, 3], true, 1, 2.5],
    [[1], false, 1, 2.5],
  ]
  for (const [sizes, lastApart, rings, inner] of tuned) {
    const grid = halfRingGrid(sizes.map((count, i) => ({ count, apart: lastApart && i === sizes.length - 1 })))
    assert.deepEqual([grid.rings, Math.round(grid.inner * 100) / 100], [rings, inner], sizes.join(","))
  }
})

test("a frame too narrow for the labels still keeps every dot inside it", () => {
  const frame: Frame = { area: { left: 0, top: 0, right: 0.05, bottom: 0.8 }, px: 0.002 }
  const scene = place(turnoutOf(VOTE, VOTE_ABSENT), frame)
  for (const { x, y } of scene.dots.values())
    assert.ok(x - scene.radius >= -1e-12 && x + scene.radius <= 0.05 + 1e-12 && y - scene.radius >= -1e-12 && y + scene.radius <= 0.8 + 1e-12)
})

test("each reading line is one ring: its dots sit at one distance from the centre, a distance of its own", () => {
  const scene = place(turnoutOf(VOTE, VOTE_ABSENT), DESKTOP)
  const centre = centreOf(scene)
  const radii = scene.lines.map(line => {
    const distances = line.map(id => distance(dotOf(scene)(id), centre))
    assert.ok(Math.max(...distances) - Math.min(...distances) < 1e-9, `${Math.min(...distances)} to ${Math.max(...distances)}`)
    return distances[0] ?? NaN
  })
  assert.equal(new Set(radii.map(r => r.toFixed(6))).size, scene.lines.length)
})

test("the part set apart ends every reading line it is on, after the parts that voted", () => {
  const turnout = turnoutOf(VOTE, VOTE_ABSENT)
  const absent = new Set(turnout.absent?.members)
  const scene = place(turnout, DESKTOP)
  for (const line of scene.lines) {
    const first = line.findIndex(id => absent.has(id))
    if (first !== -1) assert.ok(line.slice(first).every(id => absent.has(id)))
  }
  assert.ok(scene.lines.some(line => absent.has(line.at(-1) ?? deputyId("none"))))
})

test("inside a sector, dots follow the given order along every ring", () => {
  const turnout = turnoutOf(VOTE, VOTE_ABSENT)
  const reversed: Order = (a, b) => b.localeCompare(a)
  const scene = place(turnout, DESKTOP, reversed)
  for (const part of [...turnout.present, turnout.absent ?? assert.fail()]) {
    const members = new Set(part.members)
    for (const line of scene.lines) {
      const inPart = line.filter(id => members.has(id))
      assert.deepEqual(inPart, inPart.toSorted(reversed), part.label)
    }
  }
})

test("the part set apart is drawn hollow and the parts that voted filled, so even coloured by group it stands apart", () => {
  const turnout = turnoutOf(VOTE, VOTE_ABSENT)
  assert.deepEqual(place(turnout, DESKTOP).hollow, new Set(turnout.absent?.members))
  assert.deepEqual(place(turnoutOf(VOTE, null), DESKTOP).hollow, new Set())
})

test("each deputy's place is their sector's part", () => {
  const turnout = turnoutOf({ Pour: 2, Contre: 1 }, 1)
  const scene = place(turnout, DESKTOP)
  for (const part of [...turnout.present, turnout.absent ?? assert.fail()])
    for (const id of part.members) assert.deepEqual(scene.where(id), { kind: "part", part, within: "le secteur" })
  assert.equal(scene.where(deputyId("nobody")), null)
})

test("half-rings keep their tuned geometry, for a vote and for a single deputy", () => {
  const round = (n: number) => Math.round(n * 1e6) / 1e6 + 0
  const digest = (turnout: Turnout) => {
    const scene = place(turnout, DESKTOP)
    return {
      card: scene.card,
      radius: round(scene.radius),
      snap: round(scene.snap),
      rings: scene.lines.length,
      first: [...turnout.present, ...(turnout.absent ? [turnout.absent] : [])].map(part => {
        const { x, y } = dotOf(scene)(part.members.toSorted(byId)[0] ?? assert.fail())
        return [round(x), round(y)]
      }),
      labels: labelsOf(scene).map(label => [label.title, label.lay.kind === "inline" ? label.lay.anchor : null, round(label.at.x), round(label.at.y), round(label.size)]),
    }
  }
  assert.deepEqual(digest(turnoutOf(VOTE, VOTE_ABSENT)), {
    card: "beside",
    radius: 0.017142,
    snap: 0.024488,
    rings: 13,
    first: [[-0.464902, 0.011158], [-0.112019, -0.831029], [0.738048, -0.345915], [0.804895, -0.110974], [0.648943, -0.029989]],
    labels: [
      ["296 · Pour", "end", -0.764151, -0.592323, 0.02],
      ["224 · Contre", "start", 0.378033, -0.794372, 0.02],
      ["41 · Abstention", "start", 0.796973, -0.279638, 0.02],
      ["1 · Non-votant", "start", 0.833403, -0.114951, 0.02],
      ["15 · Absent", "start", 0.840514, 0.011158, 0.02],
    ],
  })
  assert.deepEqual(digest(turnoutOf({ Pour: 1 }, null)), {
    card: "beside",
    radius: 0.019,
    snap: 0.027143,
    rings: 1,
    first: [[-0.0253, -0.469898]],
    labels: [["1 · Pour", "start", -0.0253, -0.511398, 0.02]],
  })
})
