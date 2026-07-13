// YouTube video intelligence — keyless. Parses the watch page's embedded
// `ytInitialPlayerResponse` / `ytInitialData` JSON for metadata + SEO, fetches
// the transcript from the caption tracks, and exhaustively harvests the comment
// section via the innertube `next` API — every top-level comment plus expanded
// reply threads, bounded by safety ceilings + a time budget. All free, our own code.

export type TranscriptSegment = { start: number; text: string };

export type YouTubeComment = {
  id?: string;
  author: string | null;
  authorChannelId: string | null;
  text: string;
  likes: number | null;
  replyCount: number | null;
  publishedAt: string | null;
  // Populated for top-level comments when reply expansion is enabled.
  replies?: YouTubeComment[];
};

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
  comments: YouTubeComment[];
  commentCount: number;
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
    comments: [], // filled by fetchYouTubeComments (needs the live page session)
    commentCount: 0,
  };
}

export type FetchCommentsOptions = {
  innertubeNext: (body: Record<string, unknown>) => Promise<unknown>;
  videoId: string;
  // Ceiling on top-level comments (safety backstop; effectively "all" by default).
  maxComments?: number;
  // Expand every reply thread via reply-continuation tokens.
  includeReplies?: boolean;
  // Per-thread reply ceiling (safety backstop).
  maxRepliesPerThread?: number;
  // Wall-clock budget so exhaustive scraping of a huge video stays bounded.
  timeBudgetMs?: number;
};

// Harvest comments via YouTube's innertube `next` API. `innertubeNext` performs
// the authenticated POST in the page (BYO-session cookies); all parsing of the
// fragile entity-payload format happens here in Node. Paginates every top-level
// comment page and (when includeReplies) expands each reply thread, bounded by
// maxComments / maxRepliesPerThread / timeBudgetMs so it can't run forever.
export async function fetchYouTubeComments(
  opts: FetchCommentsOptions,
): Promise<YouTubeComment[]> {
  const {
    innertubeNext,
    videoId,
    maxComments = 100_000,
    includeReplies = true,
    maxRepliesPerThread = 5_000,
    timeBudgetMs = 180_000,
  } = opts;
  const deadline = Date.now() + timeBudgetMs;
  const timedOut = () => Date.now() > deadline;

  const out: YouTubeComment[] = [];
  const threads: { comment: YouTubeComment; replyToken: string }[] = [];

  let resp = await innertubeNext({ videoId });
  let token = findCommentsToken(resp);
  let pages = 0;
  const PAGE_CAP = 6_000; // ~120k comments backstop

  while (token && out.length < maxComments && pages < PAGE_CAP && !timedOut()) {
    resp = await innertubeNext({ continuation: token });
    const ents = entitiesFrom(resp);
    if (ents.length === 0) break;
    const { next, replyTokenById } = continuationInfo(resp);
    for (const c of ents) {
      if (out.length >= maxComments) break;
      out.push(c);
      const rt = c.id ? replyTokenById.get(c.id) : undefined;
      if (includeReplies && rt && (c.replyCount ?? 0) !== 0) {
        threads.push({ comment: c, replyToken: rt });
      }
    }
    if (!next || next === token) break;
    token = next;
    pages += 1;
  }

  // Expand reply threads (best-effort — a missing/expired token just yields
  // no replies for that thread, never an error).
  if (includeReplies) {
    for (const { comment, replyToken } of threads) {
      if (timedOut()) break;
      const replies = await fetchReplies(
        innertubeNext,
        replyToken,
        maxRepliesPerThread,
        deadline,
        comment.id,
      );
      if (replies.length) comment.replies = replies;
    }
  }

  return out;
}

// Walk one reply-continuation thread to completion (paginated).
async function fetchReplies(
  innertubeNext: (body: Record<string, unknown>) => Promise<unknown>,
  startToken: string,
  maxReplies: number,
  deadline: number,
  parentId: string | undefined,
): Promise<YouTubeComment[]> {
  const replies: YouTubeComment[] = [];
  let token: string | null = startToken;
  let pages = 0;
  const REPLY_PAGE_CAP = 500;
  while (
    token &&
    replies.length < maxReplies &&
    pages < REPLY_PAGE_CAP &&
    Date.now() <= deadline
  ) {
    const resp = await innertubeNext({ continuation: token });
    const ents = entitiesFrom(resp);
    if (ents.length === 0) break;
    const { next } = continuationInfo(resp);
    for (const c of ents) {
      if (parentId && c.id === parentId) continue; // skip echoed parent
      if (replies.length >= maxReplies) break;
      replies.push(c);
    }
    if (!next || next === token) break;
    token = next;
    pages += 1;
  }
  return replies;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function findCommentsToken(resp: any): string | null {
  try {
    const sections =
      resp?.contents?.twoColumnWatchNextResults?.results?.results?.contents ??
      [];
    for (const s of sections) {
      const isr = s?.itemSectionRenderer;
      if (isr?.sectionIdentifier === "comment-item-section") {
        return (
          isr.contents?.[0]?.continuationItemRenderer?.continuationEndpoint
            ?.continuationCommand?.token ?? null
        );
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// One comment entity payload → a YouTubeComment (with its id, for reply mapping).
function commentFromEntity(p: any): YouTubeComment | null {
  const text = p?.properties?.content?.content;
  if (!text) return null;
  return {
    id: p?.properties?.commentId ?? undefined,
    author: p.author?.displayName ?? null,
    authorChannelId: p.author?.channelId ?? null,
    text,
    likes: parseCount(p.toolbar?.likeCountNotliked ?? p.toolbar?.likeCountLiked),
    replyCount: parseCount(p.toolbar?.replyCount),
    publishedAt: p.properties?.publishedTime ?? null,
  };
}

// All comment entities in a `next` response, in order (content lives in the
// flat framework-update mutations regardless of top-level vs reply page).
function entitiesFrom(resp: any): YouTubeComment[] {
  const out: YouTubeComment[] = [];
  const muts = resp?.frameworkUpdates?.entityBatchUpdate?.mutations ?? [];
  for (const m of muts) {
    const c = commentFromEntity(m?.payload?.commentEntityPayload);
    if (c) out.push(c);
  }
  return out;
}

// The reply-continuation token for a comment thread ("View N replies" button).
function findReplyToken(ctr: any): string | null {
  const contents = ctr?.replies?.commentRepliesRenderer?.contents ?? [];
  for (const c of contents) {
    const cir = c?.continuationItemRenderer;
    const t =
      cir?.continuationEndpoint?.continuationCommand?.token ??
      cir?.button?.buttonRenderer?.command?.continuationCommand?.token;
    if (t) return t;
  }
  return null;
}

// The next-page token (top-level continuation) + a map of comment-id → its
// reply-thread token. Page continuation is a trailing continuationItemRenderer;
// reply tokens are nested inside each commentThreadRenderer.
function continuationInfo(resp: any): {
  next: string | null;
  replyTokenById: Map<string, string>;
} {
  let next: string | null = null;
  const replyTokenById = new Map<string, string>();
  for (const e of resp?.onResponseReceivedEndpoints ?? []) {
    const ci =
      e?.reloadContinuationItemsCommand?.continuationItems ??
      e?.appendContinuationItemsAction?.continuationItems ??
      [];
    for (const item of ci) {
      const pt =
        item?.continuationItemRenderer?.continuationEndpoint
          ?.continuationCommand?.token;
      if (pt) next = pt;
      const ctr = item?.commentThreadRenderer;
      if (ctr) {
        const cid =
          ctr?.commentViewModel?.commentViewModel?.commentId ??
          ctr?.comment?.commentRenderer?.commentId ??
          null;
        const rt = findReplyToken(ctr);
        if (cid && rt) replyTokenById.set(cid, rt);
      }
    }
  }
  return { next, replyTokenById };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function parseCount(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase().replace(/,/g, "");
  const m = s.match(/^([\d.]+)([KMB]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : m[2] === "B" ? 1e9 : 1;
  return Math.round(n * mult);
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
  if (yt.comments.length) {
    out.push(`## Top Comments (${yt.commentCount})`);
    for (const c of yt.comments.slice(0, 10)) {
      const reps = c.replies?.length
        ? ` · ${c.replies.length} ${c.replies.length === 1 ? "reply" : "replies"}`
        : "";
      out.push(`**${c.author ?? "—"}** (${c.likes ?? 0} likes${reps}): ${c.text}`);
    }
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
