import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const stop = new AbortController();
  process.on("SIGTERM", () => stop.abort());
  process.on("SIGINT", () => stop.abort());
  const { runWorker } = await import("../src/services/worker");
  await runWorker(stop.signal);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker failed");
  process.exitCode = 1;
});
