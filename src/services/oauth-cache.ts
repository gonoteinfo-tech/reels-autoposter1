import { getDb } from "./database";

export interface FbPageOption {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username: string;
    name: string;
  };
}

function store() {
  const db = getDb();
  db.exec(
    "CREATE TABLE IF NOT EXISTS pipeline_oauth_pages(user_id INTEGER PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL)",
  );
  return db;
}
export function setCachedPages(userId: number, pages: FbPageOption[]): void {
  store()
    .prepare(
      "INSERT INTO pipeline_oauth_pages VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at",
    )
    .run(userId, JSON.stringify(pages), Date.now() + 10 * 60_000);
}
export function getCachedPages(userId: number): FbPageOption[] {
  const db = store();
  db.prepare("DELETE FROM pipeline_oauth_pages WHERE expires_at<=?").run(
    Date.now(),
  );
  const row = db
    .prepare("SELECT payload FROM pipeline_oauth_pages WHERE user_id=?")
    .get(userId) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : [];
}
