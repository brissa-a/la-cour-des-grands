import assert from "node:assert/strict";
import { test } from "node:test";
import type { Job } from "../core/job.ts";
import { isoDate } from "../core/types.ts";
import { constituencyCode } from "./address/codes.ts";
import { type Deputy, deputyId, seatNumber } from "./deputies.ts";
import { type Sitting, roomJobs, roomSeats, vacantConstituencySeats } from "./hemicycle.ts";
import { voteId } from "./votes.ts";

const sat = (seat: string, constituency: string): Sitting => ({ seat: seatNumber(seat), constituency: constituencyCode(constituency) });
const seats = (...numbers: string[]) => new Set(numbers.map(seatNumber));
const held = (...codes: string[]) => new Set(codes.map(constituencyCode));
const seated = (seat: string, constituency: string) => new Map([[seatNumber(seat), constituencyCode(constituency)]]);

test("an empty seat goes to the vacant constituency whose deputy sat there last", () => {
  assert.deepEqual(vacantConstituencySeats(seats("33"), held(), [sat("33", "45-4"), sat("33", "33-11")]), seated("33", "33-11"));
});

test("a deputy of a constituency held today sitting on an empty seat afterwards does not take it from the vacant constituency", () => {
  assert.deepEqual(vacantConstituencySeats(seats("199"), held("51-2"), [sat("199", "10-2"), sat("199", "51-2")]), seated("199", "10-2"));
});

test("an empty seat sat on only by deputies of constituencies held today goes to no constituency", () => {
  assert.deepEqual(vacantConstituencySeats(seats("124"), held("34-4"), [sat("124", "34-4")]), new Map());
});

test("a vacant constituency whose deputy changed seats keeps the last of them still empty today", () => {
  const sittings = [sat("33", "33-11"), sat("10", "33-11"), sat("33", "33-11")];
  assert.deepEqual(vacantConstituencySeats(seats("10", "33"), held(), sittings), seated("33", "33-11"));
  assert.deepEqual(vacantConstituencySeats(seats("10"), held(), sittings), seated("10", "33-11"));
});

test("a vacant constituency whose last seat went to another vacant constituency falls back to its earlier empty seat", () => {
  const sittings = [sat("10", "33-11"), sat("33", "33-11"), sat("33", "45-4")];
  assert.deepEqual(
    vacantConstituencySeats(seats("10", "33"), held(), sittings),
    new Map([
      [seatNumber("33"), constituencyCode("45-4")],
      [seatNumber("10"), constituencyCode("33-11")],
    ]),
  );
});

function deputy(id: string, constituency: string, end: string | null, seat: string | null): Deputy {
  const [department = "", number = ""] = constituency.split("-");
  return {
    id: deputyId(id),
    civility: "Mme",
    lastName: id,
    firstName: id,
    birthDate: null,
    group: null,
    mandates: [
      {
        start: isoDate("2024-07-08"),
        end: end === null ? null : isoDate(end),
        endReason: null,
        constituency: constituencyCode(constituency),
        region: "Occitanie",
        department,
        departmentNumber: department,
        constituencyNumber: number,
        seat: seat === null ? null : seatNumber(seat),
      },
    ],
  };
}

const votedFrom = (seatsByDeputy: Record<string, string>) => ({
  id: voteId("VTANR5L17V1"),
  seats: new Map(Object.entries(seatsByDeputy).map(([id, seat]) => [deputyId(id), seatNumber(seat)])),
});

test("each seat carries its holder's constituency, or the vacant one whose deputy sat there last while it is empty", () => {
  const room = roomSeats(
    [deputy("PA1", "34-4", null, "149"), deputy("PA2", "34-4", "2026-09-30", null), deputy("PA3", "10-2", "2026-09-30", null)],
    [votedFrom({ PA2: "124", PA3: "199" }), votedFrom({ PA3: "149" })],
  ).seats;
  const at = (seat: string) => room.find((s) => s.number === seatNumber(seat));
  assert.deepEqual([at("149")?.deputy, at("149")?.constituency], [deputyId("PA1"), constituencyCode("34-4")]);
  assert.deepEqual([at("124")?.deputy, at("124")?.constituency], [null, null]);
  assert.deepEqual([at("199")?.deputy, at("199")?.constituency], [null, constituencyCode("10-2")]);
});

test("the room has its 582 seats in order, without the empty spots and government benches that shape its rows", () => {
  const numbers = roomSeats([], []).seats.map((s) => s.number);
  assert.equal(numbers.length, 582);
  assert.deepEqual([numbers[0], numbers[1], numbers.at(-1)], [seatNumber("1"), seatNumber("2"), seatNumber("650")]);
});

test("sources that disagree with the deputies are rejected: a constituency held twice, seated or not, a vote from someone else", () => {
  assert.throws(
    () => roomSeats([deputy("PA1", "34-4", null, "149"), deputy("PA2", "34-4", null, "124")], []),
    /Constituency 34-4 held by both PA1 and PA2/,
  );
  assert.throws(() => roomSeats([deputy("PA1", "34-4", null, "149"), deputy("PA2", "34-4", null, null)], []), /Constituency 34-4 held by both PA1 and PA2/);
  assert.throws(() => roomSeats([deputy("PA1", "34-4", null, "149")], [votedFrom({ PA9: "1" })]), /PA9 is not a deputy/);
});

test("a deputy in office the Assemblée has not seated yet is named apart and sits nowhere, her predecessor's seat left empty and not vacant", () => {
  const room = roomSeats(
    [deputy("PA1", "34-4", null, "149"), deputy("PA2", "10-2", "2026-11-09", null), deputy("PA3", "10-2", null, null)],
    [votedFrom({ PA2: "199" })],
  );
  assert.deepEqual(room.unseated, [deputyId("PA3")]);
  assert.deepEqual(
    room.seats.filter((s) => s.deputy !== null || s.constituency !== null).map((s) => [s.number, s.deputy, s.constituency]),
    [[seatNumber("149"), deputyId("PA1"), constituencyCode("34-4")]],
  );
});

test("deputies in office that the room cannot seat are rejected: a seat taken twice, a seat outside the room", () => {
  assert.throws(
    () => roomSeats([deputy("PA1", "34-4", null, "149"), deputy("PA2", "10-2", null, "149")], []),
    /Seat 149 held by both PA1 and PA2/,
  );
  for (const outside of ["4001", "651"]) {
    assert.throws(() => roomSeats([deputy("PA1", "34-4", null, outside)], []), new RegExp(`Seats not in the room plan: ${outside}`));
  }
});

const ready = <T>(name: string, value: T): Job<T> => ({ name, result: () => Promise.resolve(value) });

test("the hemicycle's seats are the room built from the given deputies and ballots, which warns only when it leaves deputies in office without a seat, and names them", async (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const { room, seats } = roomJobs({
    deputies: ready("deputies", [deputy("PA1", "34-4", null, "149"), deputy("PA2", "33-11", "2026-09-30", null), deputy("PA3", "10-2", null, null), deputy("PA4", "45-4", null, null)]),
    ballots: ready("ballots", [votedFrom({ PA2: "33" })]),
  });
  const built = await room.result();
  assert.deepEqual(built.unseated, [deputyId("PA3"), deputyId("PA4")]);
  assert.equal(await seats.result(), built.seats);
  assert.deepEqual(
    built.seats.filter((s) => s.deputy !== null || s.constituency !== null).map((s) => [s.number, s.deputy, s.constituency]),
    [
      [seatNumber("33"), null, constituencyCode("33-11")],
      [seatNumber("149"), deputyId("PA1"), constituencyCode("34-4")],
    ],
  );
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments),
    [["In office without a seat, so out of the hemicycle: PA3, PA4"]],
  );

  warn.mock.resetCalls();
  await roomJobs({ deputies: ready("deputies", [deputy("PA1", "34-4", null, "149")]), ballots: ready("ballots", []) }).room.result();
  assert.equal(warn.mock.callCount(), 0);
});
