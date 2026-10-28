import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('fresh database migrates once, supports direct media and distinct platform IDs', async () => {
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'reels-db-'));
  const d = await import('../src/services/database');
  d.initDatabase(); d.initDatabase();
  const ig=d.createSource({username:'ig',platform:'instagram',user_id:1});
  const fb=d.createSource({username:'fb',platform:'facebook',user_id:1});
  const first=d.createReel({source_id:ig.id,source_username:'ig',user_id:1,instagram_url:'https://www.instagram.com/reel/123/',instagram_id:'123',direct_video_url:'https://example.com/a.mp4'});
  const second=d.createReel({source_id:fb.id,source_username:'fb',user_id:1,instagram_url:'https://www.facebook.com/reel/123/',instagram_id:'123'});
  assert.ok(first);
  assert.ok(second, 'same external ID on Facebook is a different video');
  assert.equal(first.direct_video_url,'https://example.com/a.mp4');
  assert.ok(fs.existsSync(path.join(process.env.DATA_DIR,'reels.db')));
});
