// YouTube video intelligence — keyless. Parses the watch page's embedded
// `ytInitialPlayerResponse` / `ytInitialData` JSON for metadata + SEO, and
// fetches the transcript from the caption tracks. Comments / title-history
// land in later phases (YT-3 / YT-4). All free, our own code.

export type TranscriptSegment = { start: number; text: string };

export type YouTubeData = {
  videoId: string;
  title: string | null;
  description: string | null;
  channel: { name: string | null; id: string | null; url: string | null };
  views: number | null;
  likes: number | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  isLive: boolean;
  thumbnails: string[];
  seo: {
    tags: string[];
    category: string | null;
    hashtags: string[];
    titleLength: number;
    descriptionLength: number;
    tagCount: number;
  };
  transcript: TranscriptSegment[];
  transcriptAvailable: boolean;
};

const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];

export function isYouTubeWatchUrl(url: string): boolean {
  return parseVideoId(url) !== null;
}

// Pull the 11-char video id from any common YouTube URL form.
export function parseVideoId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!YT_HOSTS.includes(host)) return null;
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      return v && /^[\w-]{11}$/.test(v) ? v : null;
    }
    const m = u.pathname.match(/^\/(shorts|embed|v)\/([\w-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

// Brace-match a JSON object that follows a marker in the page HTML.
function extractJsonVar(html: string, marker: string): unknown | null {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf("{", at);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Build the full YouTube data object from a rendered watch-page HTML string
// (the browser path gives us the real page with the JSON blobs).
export async function extractYouTubeFromHtml(
  videoId: string,
  html: string,
  // Optional in-browser fetcher — YouTube blocks caption fetches from
  // datacenter IPs, so fetching the transcript through the page's trusted
  // session is far more reliable than a Node fetch.
  fetchText?: (url: string) => Promise<string>,
): Promise<YouTubeData> {
  const player = extractJsonVar(html, "ytInitialPlayerResponse") as
    | Record<string, never>
    | null;
  const vd = (player?.videoDetails ?? {}) as Record<string, unknown>;
  const mf = ((player?.microformat as Record<string, unknown> | undefined)
    ?.playerMicroformatRenderer ?? {}) as Record<string, unknown>;

  const title = (vd.title as string) ?? null;
  const description = (vd.shortDescription as string) ?? null;
  const tags = Array.isArray(vd.keywords) ? (vd.keywords as string[]) : [];
  const hashtags = description ? (description.match(/#[\p{L}\d_]+/gu) ?? []) : [];

  const thumbs = ((vd.thumbnail as Record<string, unknown> | undefined)
    ?.thumbnails ?? []) as Array<{ url: string }>;
  const thumbnails = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    ...thumbs.map((t) => t.url),
  ].filter((v, i, a) => a.indexOf(v) === i);

  // Likes — best-effort from ytInitialData's like-button label.
  const likeMatch = html.match(/"([\d,]+) likes"/);
  const likes = likeMatch ? Number(likeMatch[1].replace(/,/g, "")) : null;

  // Transcript from the caption tracks (prefer manual English, else first).
  const tracks = ((
    (player?.captions as Record<string, unknown> | undefined)
      ?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined
  )?.captionTracks ?? []) as Array<{
    baseUrl: string;
    languageCode?: string;
    kind?: string;
  }>;
  const track =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en") ??
    tracks[0];
  const transcript = track
    ? await fetchTranscript(track.baseUrl, fetchText)
    : [];

  return {
    videoId,
    title,
    description,
    channel: {
      name: (vd.author as string) ?? (mf.ownerChannelName as string) ?? null,
      id: (vd.channelId as string) ?? null,
      url: vd.channelId
        ? `https://www.youtube.com/channel/${vd.channelId as string}`
        : null,
    },
    views: vd.viewCount ? Number(vd.viewCount) : null,
    likes,
    publishedAt: (mf.publishDate as string) ?? (mf.uploadDate as string) ?? null,
    durationSeconds: vd.lengthSeconds ? Number(vd.lengthSeconds) : null,
    isLive: Boolean(vd.isLiveContent),
    thumbnails,
    seo: {
      tags,
      category: (mf.category as string) ?? null,
      hashtags,
      titleLength: title?.length ?? 0,
      descriptionLength: description?.length ?? 0,
      tagCount: tags.length,
    },
    transcript,
    transcriptAvailable: transcript.length > 0,
  };
}

// Render the video as clean markdown (title, stats, SEO, description,
// transcript) — replaces YouTube's noisy scraped HTML in the Markdown tab.
export function renderYouTubeMarkdown(yt: YouTubeData): string {
  const out: string[] = [];
  if (yt.title) out.push(`# ${yt.title}`);

  const stats: string[] = [];
  if (yt.channel.name) stats.push(`**Channel:** ${yt.channel.name}`);
  if (yt.views != null) stats.push(`**Views:** ${yt.views.toLocaleString()}`);
  if (yt.likes != null) stats.push(`**Likes:** ${yt.likes.toLocaleString()}`);
  if (yt.publishedAt) stats.push(`**Published:** ${yt.publishedAt}`);
  if (yt.durationSeconds != null)
    stats.push(`**Duration:** ${fmtDuration(yt.durationSeconds)}`);
  if (stats.length) out.push(stats.join(" · "));

  if (yt.seo.tags.length)
    out.push(`**Tags:** ${yt.seo.tags.slice(0, 30).join(", ")}`);

  if (yt.description) {
    out.push("## Description");
    out.push(yt.description);
  }
  if (yt.transcript.length) {
    out.push("## Transcript");
    out.push(yt.transcript.map((s) => s.text).join(" "));
  } else {
    out.push("_No transcript / captions available for this video._");
  }
  return out.join("\n\n");
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

// Fetch + parse a caption track (json3 format → {start, text}).
async function fetchTranscript(
  baseUrl: string,
  fetchText?: (url: string) => Promise<string>,
): Promise<TranscriptSegment[]> {
  const url = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=json3`;
  try {
    let body: string;
    if (fetchText) {
      body = await fetchText(url); // in-browser (trusted session)
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "accept-language": "en-US,en;q=0.9" },
        });
        body = res.ok ? await res.text() : "";
      } finally {
        clearTimeout(timer);
      }
    }
    if (!body) return [];
    const data = JSON.parse(body) as {
      events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
    };
    return (data.events ?? [])
      .filter((e) => e.segs)
      .map((e) => ({
        start: (e.tStartMs ?? 0) / 1000,
        text: (e.segs ?? [])
          .map((s) => s.utf8 ?? "")
          .join("")
          .trim(),
      }))
      .filter((s) => s.text);
  } catch {
    return [];
  }
}
