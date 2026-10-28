/** Canonical social-video identity shared by ingestion and discovery. Downloads live in media.ts. */
type Platform = "instagram" | "tiktok" | "facebook" | "youtube";
const hosts: Record<Platform, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
};
export function extractVideoId(raw: string, platform: Platform): string | null {
  try {
    const url = new URL(raw);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !hosts[platform].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (platform === "instagram")
      return /^(reel|reels|p|tv)$/.test(parts[0]) &&
        /^[\w-]+$/.test(parts[1] || "")
        ? parts[1]
        : null;
    if (platform === "tiktok")
      return parts[1] === "video" && /^\d+$/.test(parts[2] || "")
        ? parts[2]
        : null;
    if (platform === "youtube")
      return url.hostname === "youtu.be"
        ? parts[0] || null
        : parts[0] === "shorts"
          ? parts[1] || null
          : url.searchParams.get("v");
    if (parts.includes("videos"))
      return [...parts].reverse().find((p) => /^\d+$/.test(p)) || null;
    return parts[0] === "reel" ? parts[1] || null : url.searchParams.get("v");
  } catch {
    return null;
  }
}
export function normalizeVideoUrl(
  raw: string,
  platform: Platform,
): string | null {
  const id = extractVideoId(raw, platform);
  if (!id) return null;
  if (platform === "instagram") return `https://www.instagram.com/reel/${id}/`;
  if (platform === "youtube")
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  if (platform === "facebook")
    return new URL(raw).pathname.includes("/reel/")
      ? `https://www.facebook.com/reel/${id}/`
      : `https://www.facebook.com/watch/?v=${encodeURIComponent(id)}`;
  const user = new URL(raw).pathname.split("/").filter(Boolean)[0];
  return `https://www.tiktok.com/${user}/video/${id}`;
}
export function extractInstagramId(url: string) {
  return extractVideoId(url, "instagram");
}
