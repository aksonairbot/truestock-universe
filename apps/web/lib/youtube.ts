// apps/web/lib/youtube.ts
//
// Turning "a link someone pasted" into a track we can queue.
//
// THE IMPORTANT DESIGN POINT: THIS NEEDS NO API KEY TO WORK.
// YouTube's oEmbed endpoint is public, unauthenticated and unmetered, and it
// returns the title, the channel and a thumbnail — which is everything the
// queue actually needs to show a row. So the jukebox works the minute it
// deploys, with nothing to configure.
//
// YOUTUBE_API_KEY is a pure upgrade, not a requirement. Setting it adds:
//   • track duration (so the queue can total up and refuse 40-minute mixes)
//   • search, so you can type "sunflower" instead of pasting a URL
//
// That split is not laziness, it's the quota. A videos.list call costs 1 unit
// against a 10,000/day allowance — free, effectively. A search.list call costs
// 100, so the whole day's budget is a hundred searches for the entire company.
// Search therefore has to be the deliberate, rationed path and pasting a link
// has to be the fast one. Building it the other way round produces a jukebox
// that stops working every afternoon.

import { log } from "./log";

const OEMBED = "https://www.youtube.com/oembed";
const API = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 8_000;

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export interface TrackMeta {
  videoId: string;
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

/**
 * Pull a video id out of anything a person might paste.
 *
 * The forms that actually turn up: a desktop watch URL, a youtu.be share link,
 * a music.youtube.com link (which is what "YouTube Music" gives you), a Shorts
 * link, an embed URL, a bare id, and any of the above with a playlist,
 * timestamp or si= tracking parameter glued on. Handling only the first one is
 * how you get "it says invalid link" from half the office.
 *
 * Returns null rather than throwing — the caller turns it into a sentence.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // A bare id. Exactly 11 chars of the YouTube alphabet.
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTubeHost =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be";
  if (!isYouTubeHost) return null;

  // youtu.be/<id>
  if (host === "youtu.be") return clean(url.pathname.slice(1));

  // /watch?v=<id>
  const v = url.searchParams.get("v");
  if (v) return clean(v);

  // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
  if (m) return m[1] ?? null;

  return null;
}

function clean(s: string): string | null {
  const id = s.split(/[?&/#]/)[0] ?? "";
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ISO 8601 duration → seconds. YouTube returns "PT4M13S", and for a live
 * stream it returns "P0D", which is the tell we use to refuse them: an
 * endless stream in a queue is not a track, it's an ending.
 */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return null;
  const [, d, h, min, sec] = m;
  const total =
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(sec ?? 0);
  return total > 0 ? total : null;
}

/**
 * Everything we can learn about a video, degrading gracefully.
 *
 * oEmbed first because it always works. The Data API is then asked only for
 * what oEmbed can't give us, and if it fails — bad key, quota gone, Google
 * having a morning — we still return a perfectly usable track. A missing
 * duration must never stop someone queueing a song.
 */
export async function fetchTrackMeta(videoId: string): Promise<TrackMeta | null> {
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const oembed = (await getJson(`${OEMBED}?url=${encodeURIComponent(watch)}&format=json`)) as
    | { title?: string; author_name?: string; thumbnail_url?: string }
    | null;

  // No oEmbed means the video is private, deleted, age-restricted or simply
  // not real. Refusing here is right: the alternative is a row in the queue
  // that silently plays nothing when it reaches the front.
  if (!oembed?.title) {
    log.info("youtube.oembed_miss", { videoId });
    return null;
  }

  const meta: TrackMeta = {
    videoId,
    title: String(oembed.title).slice(0, 300),
    channelTitle: oembed.author_name ? String(oembed.author_name).slice(0, 200) : null,
    durationSeconds: null,
    thumbnailUrl: oembed.thumbnail_url ? String(oembed.thumbnail_url) : thumbFor(videoId),
  };

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return meta;

  // 1 quota unit. Cheap enough to do on every add.
  const detail = (await getJson(
    `${API}/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`,
  )) as { items?: Array<{ contentDetails?: { duration?: string } }> } | null;

  const iso = detail?.items?.[0]?.contentDetails?.duration;
  if (iso) meta.durationSeconds = parseIsoDuration(iso);

  return meta;
}

/** The thumbnail URL is derivable, so a failed oEmbed image is never fatal. */
export function thumbFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export interface SearchHit {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string;
}

/**
 * Search. Costs 100 quota units of a 10,000/day allowance, so the ENTIRE
 * company gets about a hundred of these per day. The UI rations it — you type,
 * you press a button, you get five results — rather than firing on every
 * keystroke, which would exhaust the day's budget during one person's lunch.
 *
 * Returns an empty array when unconfigured or out of quota. The paste-a-link
 * path is always there, so a dead search degrades to a slightly less
 * convenient jukebox rather than a broken one.
 */
export async function searchYouTube(query: string, limit = 5): Promise<SearchHit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  const q = (query ?? "").trim();
  if (!key || q.length < 2) return [];

  const url =
    `${API}/search?part=snippet&type=video&videoEmbeddable=true&maxResults=${Math.min(limit, 10)}` +
    `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;

  const data = (await getJson(url)) as
    | {
        items?: Array<{
          id?: { videoId?: string };
          snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } };
        }>;
      }
    | null;

  if (!data?.items) {
    log.warn("youtube.search_failed", { q: q.slice(0, 60) });
    return [];
  }

  return data.items
    .map((it) => {
      const videoId = it.id?.videoId;
      const title = it.snippet?.title;
      if (!videoId || !title) return null;
      return {
        videoId,
        title: String(title).slice(0, 300),
        channelTitle: it.snippet?.channelTitle ?? null,
        thumbnailUrl: it.snippet?.thumbnails?.medium?.url ?? thumbFor(videoId),
      } satisfies SearchHit;
    })
    .filter((x): x is SearchHit => x !== null);
}

/** "4:13". Null duration renders as an em dash rather than "0:00". */
export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
