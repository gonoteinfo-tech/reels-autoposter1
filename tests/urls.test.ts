import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractVideoId,
  normalizeVideoUrl,
} from "../src/services/instagram-downloader";
test("social URLs require the real platform host and preserve canonical video identity", () => {
  assert.equal(
    extractVideoId("https://instagram.com.evil.example/reel/abc/", "instagram"),
    null,
  );
  assert.equal(
    normalizeVideoUrl("https://www.youtube.com/shorts/ABC_def-123", "youtube"),
    "https://www.youtube.com/watch?v=ABC_def-123",
  );
  assert.equal(
    extractVideoId(
      "https://www.facebook.com/name/videos/a-slug/123456/",
      "facebook",
    ),
    "123456",
  );
});
