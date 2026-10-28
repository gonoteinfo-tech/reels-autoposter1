import { test, mock, type TestContext } from "node:test";
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

function snapshot(t: TestContext, data: unknown) {
  process.env.BRIGHTDATA_API_TOKEN = "test";
  const fake = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    return Response.json(url.includes("/progress/") ? { status: "ready" } : data);
  });
  t.after(() => fake.mock.restore());
}

test("an Instagram snapshot containing only crawler errors is not a successful empty collection", async (t) => {
  snapshot(t, [{
    timestamp: "2026-10-28T17:59:52Z",
    input: { url: "https://www.instagram.com/metropoles/" },
    error: "Crawler error: Request failed for https://instagram.example/?token=private-value too many requests",
    error_code: "crawler_error",
  }]);
  await assert.rejects(collectProfileDiscovery("failed", "metropoles", "instagram", 10), (error: Error & { code?: string }) => {
    assert.equal(error.code, "scraper_rate_limited");
    assert.match(error.message, /too many requests/i);
    assert.doesNotMatch(error.message, /instagram\.example|private-value/);
    return true;
  });
});

test("Instagram collection rejects an unexpected snapshot envelope instead of inventing an empty result", async (t) => {
  snapshot(t, { error: "Invalid snapshot result" });
  await assert.rejects(collectProfileDiscovery("invalid", "source", "instagram", 10), /snapshot|formato/i);
});

test("a populated Instagram snapshot without usable video records reports a collection failure", async (t) => {
  snapshot(t, [{ url: "https://www.instagram.com/reel/Abc123/", shortcode: "Abc123" }]);
  await assert.rejects(collectProfileDiscovery("no-video", "source", "instagram", 10), /vídeo|video/i);
});

test("a genuinely empty Instagram snapshot remains a valid empty collection", async (t) => {
  snapshot(t, []);
  assert.deepEqual(await collectProfileDiscovery("empty", "source", "instagram", 10), []);
});

test("partial Instagram snapshots still import usable videos alongside per-record errors", async (t) => {
  snapshot(t, [
    { error: "Post unavailable" },
    { url: "https://www.instagram.com/reel/Abc123/", shortcode: "Abc123", video_url: "https://video.example.com/a.mp4", description: "Notícia confirmada." },
  ]);
  const reels = await collectProfileDiscovery("partial", "source", "instagram", 10);
  assert.equal(reels?.length, 1);
  assert.equal(reels?.[0].url, "https://www.instagram.com/reel/Abc123/");
  assert.equal(reels?.[0].caption, "Notícia confirmada.");
});
