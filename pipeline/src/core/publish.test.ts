import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { job } from "./job.ts";
import { type Publisher, publishPhotosThenData } from "./publish.ts";

const built = job({ name: "built", dependencies: {}, run: () => undefined });

function recordingPublisher(failing: string | null): { publisher: Publisher; events: string[] } {
  const events: string[] = [];
  const publisher: Publisher = ({ repository, after }) =>
    job({
      name: repository,
      dependencies: after,
      async run() {
        events.push(`start ${repository}`);
        await setImmediate();
        if (repository === failing) throw new Error(`${repository} push failed`);
        events.push(`end ${repository}`);
      },
    });
  return { publisher, events };
}

const publications = (publisher: Publisher) =>
  publishPhotosThenData(
    { repository: "photos", from: "photos-dir", after: { built } },
    { repository: "data", from: "data-dir", after: { built } },
    publisher,
  );

test("the data push starts only once the photos push has finished", async () => {
  const { publisher, events } = recordingPublisher(null);
  await Promise.all(publications(publisher).map((p) => p.result()));
  assert.deepEqual(events, ["start photos", "end photos", "start data", "end data"]);
});

test("the data is not pushed when the photos push fails", async () => {
  const { publisher, events } = recordingPublisher("photos");
  const [photos, data] = await Promise.allSettled(publications(publisher).map((p) => p.result()));
  assert.equal(photos?.status, "rejected");
  assert.equal(data?.status, "rejected");
  assert.deepEqual(events, ["start photos"]);
});
