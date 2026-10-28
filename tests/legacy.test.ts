import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
test("legacy database preserves users, media, errors, credentials and published IDs", async () => {
  process.env.DATA_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "reels-legacy-"),
  );
  const before = new Database(path.join(process.env.DATA_DIR, "reels.db"));
  before.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,name TEXT,picture TEXT,google_id TEXT,plan TEXT DEFAULT 'pro',created_at TEXT DEFAULT (datetime('now')));
    INSERT INTO users(id,email,name) VALUES(1,'legacy@example.invalid','Legacy');
    CREATE TABLE source_profiles(id INTEGER PRIMARY KEY,user_id INTEGER,username TEXT,platform TEXT,display_name TEXT DEFAULT '',profile_pic_url TEXT DEFAULT '',is_active INTEGER DEFAULT 1,created_at TEXT DEFAULT (datetime('now')),last_checked_at TEXT,UNIQUE(user_id,platform,username));
    INSERT INTO source_profiles(id,user_id,username,platform) VALUES(1,1,'source','facebook');
    CREATE TABLE reels(id INTEGER PRIMARY KEY,user_id INTEGER,source_id INTEGER,source_username TEXT,instagram_url TEXT,instagram_id TEXT,caption TEXT DEFAULT '',original_caption TEXT DEFAULT '',hashtags TEXT DEFAULT '',duration_seconds REAL DEFAULT 0,local_path TEXT,processed_path TEXT,r2_url TEXT,stage TEXT,error_message TEXT,ig_post_id TEXT,fb_post_id TEXT,published_at TEXT,created_at TEXT DEFAULT (datetime('now')),updated_at TEXT DEFAULT (datetime('now')),UNIQUE(user_id,instagram_url),UNIQUE(user_id,instagram_id));
    INSERT INTO reels(id,user_id,source_id,source_username,instagram_url,instagram_id,stage,fb_post_id) VALUES(1,1,1,'source','https://www.facebook.com/reel/123/','123','published','external-id');
    INSERT INTO reels(id,user_id,source_id,source_username,instagram_url,instagram_id,stage,error_message,local_path) VALUES(2,1,1,'source','https://www.facebook.com/reel/456/','456','error','old failure','/old/input.mp4');
    CREATE TABLE app_settings(user_id INTEGER,key TEXT,value TEXT,PRIMARY KEY(user_id,key));
    INSERT INTO app_settings VALUES(1,'facebook_page_access_token','legacy-token');`);
  before.close();
  const d = await import("../src/services/database");
  const { importLegacyJobs } = await import("../src/services/pipeline");
  const { JobQueue } = await import("../src/services/jobs");
  d.initDatabase();
  d.initDatabase();
  assert.equal(d.getUserById(1)?.email, "legacy@example.invalid");
  assert.equal(d.getReelById(1)?.fb_post_id, "external-id");
  assert.equal(d.getReelById(2)?.local_path, "/old/input.mp4");
  assert.equal(d.getAppSettings(1).facebook_page_access_token, "legacy-token");
  const q = new JobQueue(d.getDb());
  importLegacyJobs(q);
  importLegacyJobs(q);
  assert.equal(q.db.prepare("SELECT COUNT(*) n FROM pipeline_jobs").get().n, 1);
  assert.equal(
    q.db.prepare("SELECT status FROM pipeline_jobs").get().status,
    "blocked",
  );
  q.unblock(1);
  assert.equal(
    q.db.prepare("SELECT status FROM pipeline_jobs").get().status,
    "blocked",
    "configuration changes must not blindly retry historical errors",
  );
});
