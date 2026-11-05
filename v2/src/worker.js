// alphahylian.com — static page plus a tiny API.
// /api/videos  latest uploads from the YouTube RSS feed
// /api/stats   subscriber count + Discord member/online counts
// /yt /tiktok /ig /discord  short links you can say out loud in videos

const CHANNEL_ID = "UCo8Y9Q5oFAT5PwW8fWL9zWA";
const CHANNEL_HANDLE = "alphahylian";
const DISCORD_INVITE = "QFWWQhbz7P";
const CACHE_SECONDS = 600;
const CACHE_VERSION = 2;

const SHORT_LINKS = {
  "/yt": "https://youtube.com/@alphahylian",
  "/youtube": "https://youtube.com/@alphahylian",
  "/tiktok": "https://tiktok.com/@alphahylian",
  "/tt": "https://tiktok.com/@alphahylian",
  "/ig": "https://instagram.com/alphahylian",
  "/instagram": "https://instagram.com/alphahylian",
  "/discord": `https://discord.gg/${DISCORD_INVITE}`,
  "/dc": `https://discord.gg/${DISCORD_INVITE}`,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();

    if (SHORT_LINKS[path]) return Response.redirect(SHORT_LINKS[path], 302);
    if (path === "/api/videos") return cached(request, ctx, () => getVideos());
    if (path === "/api/stats") return cached(request, ctx, () => getStats(env));

    return env.ASSETS.fetch(request);
  },
};

// Serve from the edge cache when we can, so YouTube and Discord get hit at most every few minutes.
async function cached(request, ctx, produce) {
  const cache = caches.default;
  // Bump CACHE_VERSION when the API output changes so old cached answers are skipped.
  const key = new Request(new URL(request.url).toString() + "?v=" + CACHE_VERSION, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  let body;
  try {
    body = await produce();
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 502, 0);
  }
  const res = json(body, 200, CACHE_SECONDS);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

function json(data, status, maxAge) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

function decode(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function getVideos() {
  // "UULF" + channel id = the channel's uploads playlist with Shorts and lives left out.
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${CHANNEL_ID.slice(2)}`);
  if (!res.ok) throw new Error(`YouTube feed ${res.status}`);
  const xml = await res.text();
  const entries = xml.split("<entry>").slice(1);
  const videos = entries.slice(0, 12).map((e) => {
    const pick = (re) => (e.match(re) || [])[1] || "";
    const id = pick(/<yt:videoId>([^<]+)/);
    const link = pick(/<link rel="alternate" href="([^"]+)"/);
    return {
      id,
      title: decode(pick(/<title>([^<]*)<\/title>/)),
      published: pick(/<published>([^<]+)/),
      views: Number(pick(/<media:statistics views="(\d+)"/)) || 0,
      short: link.includes("/shorts/"),
      url: link || `https://www.youtube.com/watch?v=${id}`,
    };
  });
  return { videos };
}

async function getStats(env) {
  const [subs, discord] = await Promise.all([
    getSubscribers(env).catch(() => null),
    getDiscord().catch(() => null),
  ]);
  return { subscribers: subs, discord };
}

async function getSubscribers(env) {
  // Exact count via the YouTube Data API when a key is set (wrangler secret put YT_API_KEY).
  if (env.YT_API_KEY) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CHANNEL_ID}&key=${env.YT_API_KEY}`
    );
    const d = await r.json();
    const n = Number(d?.items?.[0]?.statistics?.subscriberCount);
    if (n) return n;
  }
  // Otherwise read the public number off the channel page (YouTube rounds it above 1,000).
  const r = await fetch(`https://www.youtube.com/@${CHANNEL_HANDLE}`, {
    headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0" },
  });
  const html = await r.text();
  const m = html.match(/"([\d.,]+)([KM]?) subscribers"/);
  if (!m) return null;
  const base = parseFloat(m[1].replace(/,/g, ""));
  return Math.round(base * (m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1));
}

async function getDiscord() {
  const r = await fetch(`https://discord.com/api/v9/invites/${DISCORD_INVITE}?with_counts=true`);
  if (!r.ok) throw new Error(`Discord ${r.status}`);
  const d = await r.json();
  const g = d.guild || {};
  return {
    name: g.name,
    icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
    members: d.approximate_member_count,
    online: d.approximate_presence_count,
    invite: `https://discord.gg/${DISCORD_INVITE}`,
  };
}
