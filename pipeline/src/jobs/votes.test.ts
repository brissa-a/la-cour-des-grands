import assert from "node:assert/strict";
import { test } from "node:test";
import { deputyId, seatNumber } from "./deputies.ts";
import { parseBallot } from "./votes.ts";

test("each voter's seat is read from numPlace, and a member of the government recorded without one has no seat", () => {
  const ballot = parseBallot({
    uid: "VTANR5L17V1000",
    numero: "1000",
    dateScrutin: "2025-03-13",
    titre: "l'amendement n° 1",
    typeVote: { libelleTypeVote: "scrutin public ordinaire" },
    sort: { code: "adopté" },
    ventilationVotes: {
      organe: {
        groupes: {
          groupe: {
            vote: {
              decompteNominatif: {
                pours: { votant: [{ acteurRef: "PA793238", numPlace: "073" }] },
                contres: null,
                abstentions: null,
                nonVotants: { votant: { acteurRef: "PA605991", numPlace: null, causePositionVote: "MG" } },
              },
            },
          },
        },
      },
    },
  });
  assert.deepEqual(ballot.seats, new Map([[deputyId("PA793238"), seatNumber("73")]]));
  assert.equal(ballot.positions.get(deputyId("PA605991")), "not_voting");
});
