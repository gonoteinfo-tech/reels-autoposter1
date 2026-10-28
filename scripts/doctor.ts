import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { runTool, FFMPEG, FFPROBE } = await import("../src/services/media");
  const { getQueue } = await import("../src/services/pipeline");
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  checks.push({
    name: "Node.js 24+",
    ok: Number(process.versions.node.split(".")[0]) >= 24,
    detail: process.versions.node,
  });
  for (const [name, command, args] of [
    ["FFmpeg", FFMPEG, ["-version"]],
    ["ffprobe", FFPROBE, ["-version"]],
    [
      "yt-dlp (TikTok/YouTube/links avulsos)",
      process.env.YTDLP_PATH || "yt-dlp",
      ["--version"],
    ],
  ] as const) {
    try {
      const output = await runTool(command, [...args], { timeout: 5000 });
      checks.push({ name, ok: true, detail: output.split("\n")[0] });
    } catch {
      checks.push({
        name,
        ok: false,
        detail: "Executável indisponível. Confira PATH e .env.local.",
      });
    }
  }
  for (const [name, keys] of [
    ["Bright Data", ["BRIGHTDATA_API_TOKEN"]],
    ["Gemini", ["GEMINI_API_KEY"]],
    [
      "R2",
      [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_PUBLIC_URL",
      ],
    ],
  ] as const) {
    const ok =
      keys.every((key) => !!process.env[key]) ||
      (name === "Gemini" && !!process.env.GOOGLE_API_KEY);
    checks.push({
      name,
      ok,
      detail: ok
        ? "Configurado (valores ocultos)."
        : "Configuração incompleta.",
    });
  }
  const q = getQueue();
  checks.push({
    name: "SQLite",
    ok: q.db.pragma("integrity_check", { simple: true }) === "ok",
  });
  checks.push({
    name: "Worker",
    ok: Date.now() - Number(q.state("heartbeat") || 0) < 30_000,
  });
  const jobs = q.db
    .prepare(
      "SELECT status,COUNT(*) AS count FROM pipeline_jobs GROUP BY status",
    )
    .all();
  console.log(JSON.stringify({ checks, jobs, externalCalls: false }, null, 2));
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Diagnóstico falhou. Confira permissões e configuração do banco.",
  );
  process.exitCode = 1;
});
