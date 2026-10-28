import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  startProfileDiscovery,
  collectProfileDiscovery,
} from "../src/services/brightdata-discoverer";

test("Facebook discovery uses the documented scraper with a profile URL and maps its result", async () => {
  process.env.BRIGHTDATA_API_TOKEN = "test";
  const requests: { url: string; body: unknown }[] = [];
  const fake = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json(
        url.includes("/trigger")
          ? { snapshot_id: "snapshot-1" }
          : url.includes("/progress/")
            ? { status: "ready" }
            : [
                {
                  url: "https://www.facebook.com/reel/123",
                  shortcode: "123",
                  video_url: "https://video.example.com/a.mp4",
                  content: "Um fato confirmado",
                  hashtags: ["#noticias"],
                },
              ],
      );
    },
  );
  try {
    assert.equal(
      await startProfileDiscovery("nettoo.1", "facebook", 10),
      "snapshot-1",
    );
    const query = new URL(requests[0].url);
    assert.equal(query.searchParams.get("dataset_id"), "gd_lyclm3ey2q6rww027t");
    assert.deepEqual(requests[0].body, [
      { url: "https://www.facebook.com/nettoo.1", num_of_posts: 10 },
    ]);
    const videos = await collectProfileDiscovery(
      "snapshot-1",
      "nettoo.1",
      "facebook",
      10,
    );
    assert.equal(videos?.[0].url, "https://www.facebook.com/reel/123/");
    assert.equal(videos?.[0].caption, "Um fato confirmado");
  } finally {
    fake.mock.restore();
  }
});
