import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
test("OAuth page selection survives process memory and expires per user", async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reels-oauth-"));
  const { setCachedPages, getCachedPages } =
    await import("../src/services/oauth-cache");
  const { getDb } = await import("../src/services/database");
  setCachedPages(1, [{ id: "page", name: "Page", access_token: "test-token" }]);
  assert.equal(getCachedPages(2).length, 0);
  assert.equal(
    (
      getDb().prepare("SELECT COUNT(*) n FROM pipeline_oauth_pages").get() as {
        n: number;
      }
    ).n,
    1,
  );
  assert.equal(getCachedPages(1)[0].id, "page");
  getDb().prepare("UPDATE pipeline_oauth_pages SET expires_at=0").run();
  assert.deepEqual(getCachedPages(1), []);
});
