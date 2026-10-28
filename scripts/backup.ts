import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
loadEnvConfig(process.cwd());
async function main() {
  const dir = path.resolve(process.env.DATA_DIR || "data");
  const source = path.join(dir, "reels.db");
  const destination = path.resolve(
    process.argv[2] ||
      path.join(
        dir,
        "backups",
        `reels-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
      ),
  );
  if (destination === source || fs.existsSync(destination))
    throw new Error("O destino já existe ou é o próprio banco.");
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
    fs.chmodSync(destination, 0o600);
    console.log(`Backup SQLite consistente salvo em ${destination}`);
  } finally {
    db.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Backup falhou");
  process.exitCode = 1;
});
