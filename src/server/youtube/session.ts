import { getRedisConnection } from "@/lib/queue";
import { encrypt, decrypt } from "@/lib/crypto";

// Bring-your-own YouTube session. The user pastes their YouTube cookies; we
// store them encrypted (Redis) and inject them into an isolated browser
// context for YouTube scrapes, so the in-page innertube calls (transcript,
// comments) run as a logged-in session — past YouTube's PO-token wall.

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
};

const key = (userId: string) => `yt:session:${userId}`;

export async function saveYouTubeSession(
  userId: string,
  raw: string,
): Promise<number> {
  const cookies = parseCookies(raw);
  if (cookies.length === 0) throw new Error("No valid cookies found in input");
  await getRedisConnection().set(
    key(userId),
    encrypt(JSON.stringify(cookies)),
  );
  return cookies.length;
}

export async function getYouTubeSession(
  userId: string,
): Promise<BrowserCookie[] | null> {
  const enc = await getRedisConnection()
    .get(key(userId))
    .catch(() => null);
  if (!enc) return null;
  try {
    return JSON.parse(decrypt(enc)) as BrowserCookie[];
  } catch {
    return null;
  }
}

export async function clearYouTubeSession(userId: string): Promise<void> {
  await getRedisConnection()
    .del(key(userId))
    .catch(() => {});
}

// Accepts a Cookie header string ("a=b; c=d") OR a Netscape cookies.txt export
// → Playwright cookie objects scoped to .youtube.com.
export function parseCookies(raw: string): BrowserCookie[] {
  const out: BrowserCookie[] = [];
  const txt = raw.trim();
  const looksNetscape = txt.includes("\t") || txt.startsWith("#");

  if (looksNetscape) {
    for (const line of txt.split("\n")) {
      const l = line.trim();
      if (!l || l.startsWith("#")) continue;
      const p = l.split("\t");
      if (p.length >= 7 && p[5]) {
        out.push({
          name: p[5],
          value: p[6] ?? "",
          domain: p[0] || ".youtube.com",
          path: p[2] || "/",
        });
      }
    }
  } else {
    for (const pair of txt.split(";")) {
      const i = pair.indexOf("=");
      if (i < 1) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (name) out.push({ name, value, domain: ".youtube.com", path: "/" });
    }
  }
  return out;
}
