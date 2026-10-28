import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const exec = promisify(execFile);
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
export async function runTool(
  command: string,
  args: string[],
  options: { timeout?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const result = await exec(command, args, {
    timeout: options.timeout ?? 600_000,
    signal: options.signal,
    killSignal: "SIGKILL",
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
  });
  return result.stdout;
}

const forbidden = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  forbidden.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
forbidden.addSubnet("2001:db8::", 32, "ipv6");

export async function validateMediaUrl(
  raw: string,
): Promise<{ url: URL; address: string; family: number }> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "URL de mídia inválida: use HTTPS público sem credenciais.",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address, family }) =>
      family === 4
        ? forbidden.check(address, "ipv4")
        : !globalV6.check(address, "ipv6") || forbidden.check(address, "ipv6"),
    )
  ) {
    throw new Error("URL de mídia aponta para rede privada ou reservada.");
  }
  return { url, ...addresses[0] };
}

/** Validate every redirect and pin the validated IP to prevent DNS rebinding. */
export async function downloadMedia(
  raw: string,
  output: string,
  signal?: AbortSignal,
): Promise<string> {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = output + "." + randomUUID() + ".part";
  const maxBytes = Number(process.env.MAX_VIDEO_BYTES) || 512 * 1024 * 1024;
  const timeout = AbortSignal.timeout(
    Number(process.env.DOWNLOAD_TIMEOUT_MS) || 180_000,
  );
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    let current = raw;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const { url, address, family } = await validateMediaUrl(current);
      const response = await new Promise<import("node:http").IncomingMessage>(
        (resolve, reject) => {
          const req = request(
            url,
            {
              signal: abort,
              headers: { "User-Agent": "ReelsAutoposter/2.0" },
              lookup: (_host, _options, callback) =>
                callback(null, [{ address, family }]),
            },
            resolve,
          );
          req.on("error", reject);
          req.end();
        },
      );
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        current = new URL(response.headers.location, url).href;
        response.destroy();
        continue;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        throw new Error(`Download de mídia: HTTP ${response.statusCode}`);
      }
      if (Number(response.headers["content-length"]) > maxBytes) {
        response.destroy();
        throw new Error("Vídeo excede limite de bytes.");
      }
      let total = 0;
      const limit = new Transform({
        transform(chunk, _encoding, done) {
          total += chunk.length;
          done(
            total > maxBytes
              ? new Error("Vídeo excede limite de bytes.")
              : null,
            chunk,
          );
        },
      });
      await pipeline(
        response,
        limit,
        fs.createWriteStream(temp, { flags: "wx" }),
        { signal: abort },
      );
      if (!total) throw new Error("Download de vídeo vazio.");
      fs.renameSync(temp, output);
      return output;
    }
    throw new Error("Redirecionamentos de mídia excedidos.");
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export function checkDiskSpace(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
  const stat = fs.statfsSync(directory);
  if (
    stat.bavail * stat.bsize <
    (Number(process.env.MIN_FREE_DISK_BYTES) || 1024 * 1024 * 1024)
  )
    throw new Error("Espaço em disco insuficiente; libere ao menos 1 GB.");
}
