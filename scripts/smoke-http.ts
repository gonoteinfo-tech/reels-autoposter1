import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

async function main() {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reels-http-"));
  const d = await import("../src/services/database");
  const { getQueue } = await import("../src/services/pipeline");
  d.initDatabase();
  const other = d.createUser({ email: "smoke@example.invalid", name: "Smoke" });
  d.createSession("smoke-admin", 1, new Date(Date.now() + 60_000));
  d.createSession("smoke-other", other.id, new Date(Date.now() + 60_000));
  d.updateSettings(1, {
    facebook_page_access_token: "server-only-test-secret",
    facebook_page_id: "page",
    cron_schedule: "*/30 * * * *",
  });
  const source = d.createSource({ username: "smoke", user_id: 1 });
  const q = getQueue();
  q.setState("paused", "true");
  const port = process.env.SMOKE_PORT || "3108";
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  server.stdout.on("data", (data) => {
    log = (log + data).slice(-3000);
  });
  server.stderr.on("data", (data) => {
    log = (log + data).slice(-3000);
  });
  const call = async (
    url: string,
    method = "GET",
    body?: object,
    cookie = "smoke-admin",
  ) => {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: {
        Cookie: `session=${cookie}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(log);
      try {
        if (
          (await call("/api/scheduler", "GET", undefined, "")).status === 401
        ) {
          ready = true;
          break;
        }
      } catch {
        /* booting */
      }
      await delay(100);
    }
    assert.ok(ready, "production server did not start");
    for (let i = 0; i < 3; i++)
      assert.equal((await call("/api/scheduler")).data.data.paused, true);
    assert.equal(q.state("paused"), "true");
    const settings = await call("/api/settings");
    assert.equal(settings.data.data.facebook_page_access_token, "");
    assert.ok(!JSON.stringify(settings).includes("server-only-test-secret"));
    assert.equal(
      (
        await call("/api/settings", "PUT", {
          ...settings.data.data,
          publish_interval_minutes: 10,
        })
      ).status,
      200,
    );
    assert.equal(
      d.getAppSettings(1).facebook_page_access_token,
      "server-only-test-secret",
    );
    assert.equal(
      (await call("/api/settings", "PUT", { cron_schedule: "99 * * * *" }))
        .status,
      400,
    );
    const a = await call("/api/sources/import", "POST", {
      sourceId: source.id,
    });
    const b = await call("/api/sources/import", "POST", {
      sourceId: source.id,
    });
    assert.equal(a.status, 202);
    assert.equal(a.data.data.job.id, b.data.data.job.id);
    assert.equal(
      (
        await call(
          "/api/sources/import",
          "POST",
          { sourceId: source.id },
          "smoke-other",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `/api/pipeline/jobs?id=${a.data.data.job.id}`,
          "GET",
          undefined,
          "smoke-other",
        )
      ).status,
      404,
    );
    assert.equal(
      (await call("/api/reels/reprocess", "POST", { reelId: "bad" })).status,
      400,
    );
    assert.equal(
      (await call("/api/scheduler", "POST", { action: "run-now" })).status,
      202,
    );
    assert.equal(
      q.db
        .prepare("SELECT COUNT(*) n FROM pipeline_jobs WHERE status='running'")
        .get().n,
      0,
    );
    assert.equal((await call("/api/stats")).status, 200);
    const dashboard = await fetch(`http://127.0.0.1:${port}/dashboard`, {
      headers: { Cookie: "session=smoke-admin" },
    });
    assert.equal(dashboard.status, 200);
    console.log(
      "HTTP smoke passed: auth, ownership, token masking/preservation, cron validation, durable 202, dedupe, paused reads and dashboard. No external calls.",
    );
  } finally {
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", () => resolve());
    });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
