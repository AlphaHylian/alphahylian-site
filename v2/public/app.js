/* ============ EDIT ME ============ */

// Lines that rotate under your name.
const ROLES = [
  "Media Consumption President",
  "Professional Inaction Specialist",
  "Input-Based Voxel Simulation Manager",
  "Pre-Revenue Ideation Director",
];

// Bios your friends wrote. Add more to get a "Next bio" button.
const BIOS = [
  {
    text: "AlphaHylian, or as Alpha's Infinite Library (join discord) know him, \"Big A', is an all time mincrafter. he has Epic Techniques, such as \"Rage bait Breach swapping\", have made him a prominent Mincrafter figure. Many people know him, all his fans get to speak to him directly on Alpha's Infinite Library (join discord) which just goes to show how Generous and \"wholesome chungus\" he is.",
    by: "sanitypun01",
  },
];

// Subscriber goals. The bar fills from the last one you passed to the next.
const MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 25000, 50000, 100000];

/* ================================= */

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const nf = new Intl.NumberFormat("en-US");
const mod = (a, n) => ((a % n) + n) % n;

/* ---------- entrance ---------- */
document.querySelectorAll(".reveal").forEach((el, i) => {
  setTimeout(() => el.classList.add("in"), reduceMotion ? 0 : 80 + i * 110);
});

/* ---------- rotating role ---------- */
(() => {
  const el = $("role");
  let i = 0;
  el.textContent = ROLES[0];
  setInterval(() => {
    el.classList.add("fade");
    setTimeout(() => {
      i = (i + 1) % ROLES.length;
      el.textContent = ROLES[i];
      el.classList.remove("fade");
    }, 350);
  }, 3200);
})();

/* ---------- Tallinn clock ---------- */
(() => {
  const time = $("clock-time"), zone = $("clock-zone");
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tallinn", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const zfmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Tallinn", timeZoneName: "short" });
  const tick = () => {
    const now = new Date();
    time.textContent = fmt.format(now);
    const z = (zfmt.formatToParts(now).find((p) => p.type === "timeZoneName") || {}).value || "";
    zone.textContent = z === "GMT+3" ? "EEST" : z === "GMT+2" ? "EET" : z;
  };
  tick();
  setInterval(tick, 1000);
})();

/* ---------- helpers ---------- */
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  const units = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [secs, name] of units) {
    const n = Math.floor(s / secs);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}
const compact = (n) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/* ---------- video ring ---------- */
const stage = $("stage"), ring = $("ring"), deco = $("deco");
const capText = $("caption"), capTitle = $("cap-title"), capMeta = $("cap-meta");
const SLOTS = 7;            // cards on screen at once; the list loops forever
const STEP = 34;            // degrees between neighbouring cards
let videos = [];
let pos = 0, target = 0;    // pos follows target smoothly; both are "video index" units
let dragging = false, dragX = 0, dragPos = 0, moved = 0, lastX = 0, vel = 0;
let hovering = false, lastInteract = 0, shownIdx = -1;
let tiltX = 0, tiltY = 0, tiltTX = 0, tiltTY = 0;
const cards = [];

function buildCards() {
  ring.innerHTML = "";
  for (let i = 0; i < SLOTS; i++) {
    const c = document.createElement("div");
    c.className = "card";
    c.innerHTML = `<img alt="" draggable="false"><span class="play" aria-hidden="true"></span>`;
    const img = c.querySelector("img");
    img.addEventListener("error", () => {
      // maxres thumbnails don't exist for every upload; fall back once.
      if (!img.src.includes("hq720")) img.src = img.src.replace("maxresdefault", "hq720");
    });
    ring.appendChild(c);
    cards.push(c);
  }
}

function cardWidth() {
  return cards[0] ? cards[0].offsetWidth : 400;
}

function render() {
  const w = cardWidth();
  const R = w * 1.05;
  const base = Math.round(pos);
  for (let j = -3; j <= 3; j++) {
    const k = base + j;
    const c = cards[mod(k, SLOTS)];
    if (c.dataset.k !== String(k)) {
      c.dataset.k = k;
      const v = videos[mod(k, videos.length)];
      c.querySelector("img").src = `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`;
    }
    const o = k - pos;
    const a = Math.abs(o);
    const ang = Math.max(-3.2, Math.min(3.2, o)) * STEP * Math.PI / 180;
    const x = Math.sin(ang) * R;
    const z = -(1 - Math.cos(ang)) * R * 0.45;
    const rot = -o * STEP * 0.9;
    const scale = 1 - Math.min(a, 2) * 0.1;
    c.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    c.style.opacity = a > 2.4 ? Math.max(0, 1 - (a - 2.4) / 0.6).toFixed(3) : "1";
    c.style.filter = `brightness(${Math.max(0.35, 1 - a * 0.28).toFixed(3)})`;
    c.style.zIndex = String(100 - Math.round(a * 10));
    c.classList.toggle("center", k === base && a < 0.2);
  }
  ring.style.transform = `rotateX(${tiltY.toFixed(2)}deg) rotateY(${tiltX.toFixed(2)}deg)`;
  deco.style.transform = `translate3d(${(-tiltX * 4).toFixed(1)}px, ${(tiltY * 4).toFixed(1)}px, 0)`;

  const idx = mod(base, videos.length);
  if (idx !== shownIdx) showCaption(idx);
}

function showCaption(idx) {
  shownIdx = idx;
  const v = videos[idx];
  capText.classList.add("swap");
  setTimeout(() => {
    capTitle.textContent = v.title;
    capMeta.textContent = `${v.views ? nf.format(v.views) + " views · " : ""}${ago(v.published)}`;
    capText.classList.remove("swap");
  }, shownIdx === -1 || reduceMotion ? 0 : 180);
}

function loop() {
  if (!dragging) {
    const d = target - pos;
    pos = Math.abs(d) < 0.0005 ? target : pos + d * (reduceMotion ? 1 : 0.11);
  }
  tiltX += (tiltTX - tiltX) * 0.06;
  tiltY += (tiltTY - tiltY) * 0.06;
  render();
  requestAnimationFrame(loop);
}

function go(delta) {
  target = Math.round(target) + delta;
  lastInteract = performance.now();
}

stage.addEventListener("pointerdown", (e) => {
  if (!videos.length) return;
  dragging = true; moved = 0; vel = 0;
  dragX = lastX = e.clientX; dragPos = pos;
  stage.setPointerCapture(e.pointerId);
  stage.classList.add("dragging");
});
stage.addEventListener("pointermove", (e) => {
  const r = stage.getBoundingClientRect();
  tiltTX = ((e.clientX - r.left) / r.width - 0.5) * 6;
  tiltTY = -((e.clientY - r.top) / r.height - 0.5) * 4;
  if (!dragging) return;
  const dx = e.clientX - dragX;
  moved = Math.max(moved, Math.abs(dx));
  vel = e.clientX - lastX;
  lastX = e.clientX;
  pos = dragPos - dx / (cardWidth() * 0.75);
  target = pos;
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  stage.classList.remove("dragging");
  lastInteract = performance.now();
  if (moved < 6) {
    // A tap, not a drag: play the middle card, or bring a side card to the middle.
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList && el.classList.contains("card"));
    if (hit) {
      const k = Number(hit.dataset.k);
      if (k === Math.round(pos)) openPlayer(videos[mod(k, videos.length)]);
      else target = k;
    }
    target = Math.round(target);
    return;
  }
  target = Math.round(pos - vel / 18);
}
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("pointerenter", () => { hovering = true; });
stage.addEventListener("pointerleave", () => { hovering = false; tiltTX = tiltTY = 0; });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayer(videos[mod(Math.round(pos), videos.length)]); }
});
$("vid-prev").addEventListener("click", () => go(-1));
$("vid-next").addEventListener("click", () => go(1));

// Drift to the next video every few seconds while nobody is touching it.
setInterval(() => {
  if (reduceMotion || !videos.length || dragging || hovering || document.hidden || $("player").open) return;
  if (performance.now() - lastInteract < 8000) return;
  target = Math.round(target) + 1;
}, 5000);

/* ---------- player ---------- */
const player = $("player"), frame = $("player-frame");
function openPlayer(v) {
  if (!v) return;
  frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  frame.querySelector("iframe").title = v.title;
  player.showModal();
}
player.addEventListener("close", () => { frame.innerHTML = ""; });
$("player-close").addEventListener("click", () => player.close());
player.addEventListener("click", (e) => { if (e.target === player) player.close(); });

fetch("/api/videos")
  .then((r) => r.json())
  .then((d) => {
    videos = (d.videos || []).filter((v) => !v.short);
    if (!videos.length) throw new Error("no videos");
    buildCards();
    requestAnimationFrame(loop);
  })
  .catch(() => {
    capTitle.innerHTML = `Couldn&rsquo;t load videos &mdash; <a class="text-link" href="https://youtube.com/@alphahylian">watch on YouTube</a>`;
  });

/* ---------- sub goal ---------- */
function renderSubs(subs) {
  if (subs == null) return;
  let idx = MILESTONES.findIndex((m) => m > subs);
  if (idx === -1) idx = MILESTONES.length - 1;
  const goal = MILESTONES[idx];
  const prev = idx > 0 ? MILESTONES[idx - 1] : 0;
  const pct = Math.max(3, Math.min(100, ((subs - prev) / (goal - prev)) * 100));

  $("goal-target").textContent = nf.format(goal);
  $("goal-of").textContent = `/ ${nf.format(goal)}`;
  $("goal-left").textContent = `${nf.format(Math.max(0, goal - subs))} to go`;
  const bar = $("bar");
  bar.setAttribute("aria-valuemax", goal);
  bar.setAttribute("aria-valuenow", subs);

  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    $("bar-fill").style.width = pct + "%";
    const nowEl = $("goal-now");
    if (reduceMotion) { nowEl.textContent = nf.format(subs); return; }
    const t0 = performance.now(), dur = 1600;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      nowEl.textContent = nf.format(Math.round(subs * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.6 });
  io.observe(bar);
}

/* ---------- discord ---------- */
function renderDiscord(d) {
  if (!d) return;
  $("dc-online").textContent = nf.format(d.online);
  $("dc-members").textContent = nf.format(d.members);
  if (d.icon) $("dc-icon").src = d.icon;
}

// Discord often refuses requests from Cloudflare's servers, so when the Worker
// comes back without counts, ask Discord straight from the visitor's browser.
function discordFromBrowser() {
  return fetch("https://discord.com/api/v9/invites/QFWWQhbz7P?with_counts=true")
    .then((r) => r.json())
    .then((d) => {
      const g = d.guild || {};
      renderDiscord({
        members: d.approximate_member_count,
        online: d.approximate_presence_count,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
      });
    })
    .catch(() => {});
}

fetch("/api/stats")
  .then((r) => r.json())
  .then((d) => {
    renderSubs(d.subscribers);
    if (d.discord) renderDiscord(d.discord);
    else discordFromBrowser();
  })
  .catch(() => discordFromBrowser());

/* ---------- friend bios ---------- */
(() => {
  const wrap = $("bios"), btn = $("bio-next");
  let cur = 0;
  const els = BIOS.map((b, i) => {
    const el = document.createElement("figure");
    el.className = "bio";
    const p = document.createElement("p");
    p.textContent = `“${b.text}”`;
    const c = document.createElement("cite");
    c.textContent = `— ${b.by}`;
    el.append(p, c);
    el.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    wrap.appendChild(el);
    return el;
  });
  if (BIOS.length > 1) {
    btn.hidden = false;
    btn.addEventListener("click", () => {
      els[cur].setAttribute("aria-hidden", "true");
      cur = (cur + 1) % els.length;
      els[cur].setAttribute("aria-hidden", "false");
    });
  }
})();
