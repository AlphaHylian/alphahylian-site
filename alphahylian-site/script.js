/* ===================== BIO CYCLE ===================== */
const bios = [
  "Professional Inaction Specialist",
  "Input-Based Voxel Simulation Manager",
  "Pre-Revenue Ideation Director",
  "Media Consumption President"
];
let bioIndex = 0;
const roleEl = document.getElementById('role-cycle');

function cycleBio(){
  roleEl.classList.add('fade');
  setTimeout(() => {
    bioIndex = (bioIndex + 1) % bios.length;
    roleEl.textContent = bios[bioIndex];
    roleEl.classList.remove('fade');
  }, 350);
}
setInterval(cycleBio, 3200);

/* ===================== CLOCK (Europe/Tallinn) ===================== */
const timeEl = document.getElementById('clock-time');
const zoneEl = document.getElementById('clock-zone');

function updateClock(){
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tallinn',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(now);
  timeEl.textContent = time;

  // Determine EET vs EEST from the actual UTC offset (DST-aware, no guessing)
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Tallinn', timeZoneName: 'shortOffset'
  }).formatToParts(now);
  const offsetStr = (offsetParts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT+2';
  zoneEl.textContent = offsetStr.includes('+3') ? 'EEST' : 'EET';
}
updateClock();
setInterval(updateClock, 1000);

/* ===================== GLOBAL CURSOR TRACKING ===================== */
const mouse = { x: -9999, y: -9999 };
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===================== TABS ===================== */
const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    if(btn.dataset.tab === 'home'){
      if(typeof positionSkinCard === 'function') positionSkinCard();
      if(typeof fitQfx === 'function') fitQfx();
      if(typeof refreshQuoteCache === 'function') refreshQuoteCache();
    }
  });
});

/* ===================== THEME SWITCHER ===================== */
const THEMES = ['stars', 'terminal', 'minecraft', 'synthwave', 'paper'];
const themeToggle = document.getElementById('theme-toggle');
const themeMenu = document.getElementById('theme-menu');
const themeOptions = [...document.querySelectorAll('.theme-option')];

function applyTheme(name){
  if(!THEMES.includes(name)) name = 'stars';
  document.documentElement.setAttribute('data-theme', name);
  try { localStorage.setItem('ah-theme', name); } catch(e){}
  themeOptions.forEach(o => o.setAttribute('aria-checked', String(o.dataset.theme === name)));
  setBackground(name);
  setQuoteEffect(name);
}

function openThemeMenu(){ themeMenu.hidden = false; themeToggle.setAttribute('aria-expanded', 'true'); }
function closeThemeMenu(){ themeMenu.hidden = true; themeToggle.setAttribute('aria-expanded', 'false'); }

themeToggle.addEventListener('click', e => {
  e.stopPropagation();
  themeMenu.hidden ? openThemeMenu() : closeThemeMenu();
});
themeOptions.forEach(o => o.addEventListener('click', () => {
  applyTheme(o.dataset.theme);
  closeThemeMenu();
}));
document.addEventListener('click', e => {
  if(!themeMenu.hidden && !themeMenu.contains(e.target) && e.target !== themeToggle) closeThemeMenu();
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeThemeMenu(); });

/* ===================== QUOTE HOVER EFFECTS ===================== */
// Each quote is rebuilt as per-character spans (wrapped per word so line
// breaks stay sane). One effect is active at a time, chosen by the theme:
//   stars    -> paintbrush: letters paint purple w/ an ink smudge + trail
//   terminal -> editor caret box around the single hovered glyph
//   minecraft-> hovered word gets a pixel-break highlight, poofs on exit
//   synthwave-> nearby letters glow neon w/ an RGB split, fast decay
//   paper    -> nearby letters turn to ink + a wavy underline follows the cursor
const quoteBody = document.querySelector('.quote-body');
const quoteTextEl = document.getElementById('quote-text');
const quoteAuthorEl = document.getElementById('quote-author');
const qCard = document.querySelector('.quote-card');
const qfxCanvas = document.getElementById('quote-fx');
const qfxCtx = qfxCanvas.getContext('2d');

function buildQuoteSpans(el, text){
  el.textContent = '';
  const words = String(text).split(' ');
  words.forEach((word, wi) => {
    const w = document.createElement('span');
    w.className = 'q-word';
    for(const ch of word){
      const c = document.createElement('span');
      c.className = 'q-ch';
      c.textContent = ch;
      w.appendChild(c);
    }
    el.appendChild(w);
    // A real text-node space between the inline-block words so the line wraps
    // normally (a styled span here can suppress the wrap opportunity).
    if(wi < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
}

function quoteChars(){ return [...quoteBody.querySelectorAll('.q-ch')]; }

function fitQfx(){
  const r = qCard.getBoundingClientRect();
  qfxCanvas.width = Math.max(1, Math.round(r.width));
  qfxCanvas.height = Math.max(1, Math.round(r.height));
}

// Cached geometry so a busy mousemove doesn't call getBoundingClientRect
// dozens of times per event.
let charCache = [];
let wordCache = [];
let qfxRect = { left: 0, top: 0 };
function refreshQuoteCache(){
  qfxRect = qfxCanvas.getBoundingClientRect();
  charCache = quoteChars().map(el => {
    const r = el.getBoundingClientRect();
    return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
             left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  wordCache = [...quoteBody.querySelectorAll('.q-word')].map(el => {
    const r = el.getBoundingClientRect();
    return { el, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
}
window.addEventListener('scroll', refreshQuoteCache, { passive: true });
window.addEventListener('resize', () => { fitQfx(); refreshQuoteCache(); });
window.addEventListener('load', () => { fitQfx(); refreshQuoteCache(); });
if(window.ResizeObserver){
  new ResizeObserver(() => { fitQfx(); refreshQuoteCache(); }).observe(qCard);
}

const QuoteEffects = {};
let activeQfx = null;

function setQuoteEffect(name){
  if(activeQfx && activeQfx.stop) activeQfx.stop();
  qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
  quoteBody.querySelectorAll('.q-ch, .q-word').forEach(s => {
    s.style.color = ''; s.style.textShadow = ''; s.style.transform = '';
    s.classList.remove('q-box', 'q-break');
  });
  const factory = QuoteEffects[name] || QuoteEffects.stars;
  activeQfx = factory();
  if(activeQfx.onRender) activeQfx.onRender();
}

quoteBody.addEventListener('mousemove', e => {
  if(activeQfx && activeQfx.onMove) activeQfx.onMove(e);
});
quoteBody.addEventListener('mouseleave', () => {
  if(activeQfx && activeQfx.onLeave) activeQfx.onLeave();
});
quoteBody.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if(t && activeQfx && activeQfx.onMove) activeQfx.onMove({ clientX: t.clientX, clientY: t.clientY });
}, { passive: true });

/* ---- stars: paintbrush ---- */
QuoteEffects.stars = () => {
  const BRUSH_RADIUS = 46;   // px around the cursor that gets painted
  const PAINT_DECAY = 0.02;  // per frame — ~1.2s to fade a painted letter back
  const TRAIL_MS = 700;
  let painted = new WeakMap();
  let trail = [];
  let raf = 0, running = true;

  function onRender(){
    refreshQuoteCache();
    painted = new WeakMap();
    charCache.forEach(c => { c.el.style.color = ''; c.el.style.textShadow = ''; c.el.style.transform = ''; });
  }
  function onMove(e){
    const mx = e.clientX - qfxRect.left, my = e.clientY - qfxRect.top;
    trail.push({ x: mx, y: my, t: performance.now() });
    if(trail.length > 30) trail.shift();
    for(const c of charCache){
      if(Math.hypot(c.cx - e.clientX, c.cy - e.clientY) < BRUSH_RADIUS){
        const prev = painted.get(c.el);
        const p = {
          level: 1,
          jx: prev ? prev.jx : (Math.random() - 0.5) * 2.4,
          jy: prev ? prev.jy : (Math.random() - 0.5) * 2.4,
          rot: prev ? prev.rot : (Math.random() - 0.5) * 8
        };
        painted.set(c.el, p);
        applyPaint(c.el, p);   // show immediately, even if the decay loop is off
      }
    }
  }
  function onLeave(){ /* trail + paint fade on their own */ }

  function applyPaint(el, p){
    const l = p.level;
    el.style.color = `rgba(168,136,255,${(0.55 + 0.45 * l).toFixed(3)})`;
    el.style.textShadow =
      `0 0 ${(6 * l).toFixed(1)}px rgba(138,108,242,${(0.7 * l).toFixed(2)}),` +
      `0 0 ${(15 * l).toFixed(1)}px rgba(138,108,242,${(0.4 * l).toFixed(2)})`;
    el.style.transform =
      `translate(${(p.jx * l).toFixed(2)}px,${(p.jy * l).toFixed(2)}px) rotate(${(p.rot * l).toFixed(2)}deg)`;
  }

  function loop(){
    if(!running) return;
    const now = performance.now();
    for(const c of charCache){
      const p = painted.get(c.el);
      if(!p) continue;
      p.level -= PAINT_DECAY;
      if(p.level <= 0){
        painted.delete(c.el);
        c.el.style.color = ''; c.el.style.textShadow = ''; c.el.style.transform = '';
        continue;
      }
      applyPaint(c.el, p);
    }

    qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
    for(let i = 0; i < trail.length; i++){
      const pt = trail[i];
      const age = (now - pt.t) / TRAIL_MS;
      if(age >= 1) continue;
      const a = (1 - age) * (i / trail.length);
      const rad = 10 + i * 0.7;
      const g = qfxCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rad);
      g.addColorStop(0, `rgba(138,108,242,${(0.5 * a).toFixed(3)})`);
      g.addColorStop(1, 'rgba(138,108,242,0)');
      qfxCtx.fillStyle = g;
      qfxCtx.beginPath();
      qfxCtx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
      qfxCtx.fill();
    }
    trail = trail.filter(pt => now - pt.t < TRAIL_MS);
    raf = requestAnimationFrame(loop);
  }
  if(!prefersReducedMotion) raf = requestAnimationFrame(loop);

  return {
    onMove, onLeave, onRender,
    stop(){
      running = false;
      cancelAnimationFrame(raf);
      qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
      quoteChars().forEach(el => { el.style.color = ''; el.style.textShadow = ''; el.style.transform = ''; });
    }
  };
};

/* ---- terminal: editor caret box ---- */
QuoteEffects.terminal = () => {
  let current = null;
  function onRender(){ refreshQuoteCache(); current = null; }
  function hitTest(e){
    for(const c of charCache){
      if(e.clientX >= c.left && e.clientX <= c.right && e.clientY >= c.top && e.clientY <= c.bottom) return c.el;
    }
    return null;
  }
  function onMove(e){
    const hit = hitTest(e);
    if(hit === current) return;
    if(current) current.classList.remove('q-box');
    if(hit) hit.classList.add('q-box');
    current = hit;
  }
  function onLeave(){ if(current){ current.classList.remove('q-box'); current = null; } }
  return {
    onMove, onLeave, onRender,
    stop(){ quoteChars().forEach(el => el.classList.remove('q-box')); }
  };
};

/* ---- minecraft: block break ---- */
QuoteEffects.minecraft = () => {
  let current = null;
  function onRender(){ refreshQuoteCache(); current = null; }
  function poof(wordEl){
    const r = wordEl.getBoundingClientRect();
    const x0 = r.left - qfxRect.left + r.width / 2;
    const y0 = r.top - qfxRect.top + r.height / 2;
    const parts = Array.from({ length: 16 }, () => ({
      x: x0, y: y0,
      vx: (Math.random() - 0.5) * 150,
      vy: (Math.random() - 0.5) * 150 - 30,
      s: 3 + Math.random() * 3,
      life: 1,
      t: performance.now()
    }));
    (function anim(){
      const now = performance.now();
      qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
      let alive = false;
      for(const p of parts){
        const dt = Math.min(0.05, (now - p.t) / 1000); p.t = now;
        p.vy += 340 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt * 1.6;
        if(p.life > 0){
          alive = true;
          qfxCtx.fillStyle = `rgba(146,215,87,${p.life.toFixed(2)})`;
          qfxCtx.fillRect(p.x, p.y, p.s, p.s);
        }
      }
      if(alive) requestAnimationFrame(anim);
      else qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
    })();
  }
  function hitWord(e){
    for(const w of wordCache){
      if(e.clientX >= w.left && e.clientX <= w.right && e.clientY >= w.top && e.clientY <= w.bottom) return w.el;
    }
    return null;
  }
  function onMove(e){
    const hit = hitWord(e);
    if(hit === current) return;
    if(current) current.classList.remove('q-break');
    if(hit) hit.classList.add('q-break');
    current = hit;
  }
  function onLeave(){
    if(current){ current.classList.remove('q-break'); if(!prefersReducedMotion) poof(current); current = null; }
  }
  return {
    onMove, onLeave, onRender,
    stop(){
      quoteBody.querySelectorAll('.q-word').forEach(el => el.classList.remove('q-break'));
      qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
    }
  };
};

/* ---- synthwave: neon glow ---- */
QuoteEffects.synthwave = () => {
  const REACH = 60;
  let lvl = new WeakMap();
  let raf = 0, running = true;
  function onRender(){ refreshQuoteCache(); lvl = new WeakMap(); charCache.forEach(c => { c.el.style.color = ''; c.el.style.textShadow = ''; }); }
  function glow(el, l){
    el.style.color = '#ffffff';
    el.style.textShadow =
      `${(-2 * l).toFixed(1)}px 0 rgba(255,45,149,${(0.9 * l).toFixed(2)}),` +
      `${(2 * l).toFixed(1)}px 0 rgba(0,229,255,${(0.9 * l).toFixed(2)}),` +
      `0 0 ${(12 * l).toFixed(1)}px rgba(255,45,149,${(0.7 * l).toFixed(2)})`;
  }
  function onMove(e){
    for(const c of charCache){
      const d = Math.hypot(c.cx - e.clientX, c.cy - e.clientY);
      if(d < REACH){
        const nl = Math.max(lvl.get(c.el) || 0, 1 - d / REACH);
        lvl.set(c.el, nl);
        glow(c.el, nl);   // show immediately, even if the decay loop is off
      }
    }
  }
  function onLeave(){}
  function loop(){
    if(!running) return;
    for(const c of charCache){
      let l = lvl.get(c.el);
      if(l == null) continue;
      l -= 0.06;
      if(l <= 0){ lvl.delete(c.el); c.el.style.color = ''; c.el.style.textShadow = ''; continue; }
      lvl.set(c.el, l);
      glow(c.el, l);
    }
    raf = requestAnimationFrame(loop);
  }
  if(!prefersReducedMotion) raf = requestAnimationFrame(loop);
  return {
    onMove, onLeave, onRender,
    stop(){ running = false; cancelAnimationFrame(raf); quoteChars().forEach(el => { el.style.color = ''; el.style.textShadow = ''; }); }
  };
};

/* ---- paper: ink + wavy underline ---- */
QuoteEffects.paper = () => {
  const REACH = 44;
  const STROKE_MS = 900;
  let pts = [];
  let inked = new Set();
  let raf = 0, running = true;
  function onRender(){ refreshQuoteCache(); pts = []; inked.forEach(el => el.style.color = ''); inked = new Set(); }
  function onMove(e){
    pts.push({ x: e.clientX - qfxRect.left, y: e.clientY - qfxRect.top + 9, t: performance.now() });
    if(pts.length > 46) pts.shift();
    for(const c of charCache){
      if(Math.hypot(c.cx - e.clientX, c.cy - e.clientY) < REACH){
        c.el.style.color = 'var(--accent)';
        inked.add(c.el);
      }
    }
  }
  function onLeave(){}
  function loop(){
    if(!running) return;
    const now = performance.now();
    pts = pts.filter(p => now - p.t < STROKE_MS);
    qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
    qfxCtx.lineCap = 'round';
    qfxCtx.lineJoin = 'round';
    for(let i = 1; i < pts.length; i++){
      const p0 = pts[i - 1], p1 = pts[i];
      const age = (now - p1.t) / STROKE_MS;
      const a = (1 - age) * 0.8;
      const w0 = Math.sin((i - 1) * 0.9 + now * 0.008) * 1.6;
      const w1 = Math.sin(i * 0.9 + now * 0.008) * 1.6;
      qfxCtx.strokeStyle = `rgba(53,80,112,${a.toFixed(3)})`;
      qfxCtx.lineWidth = 2.4 * (1 - age) + 0.4;
      qfxCtx.beginPath();
      qfxCtx.moveTo(p0.x, p0.y + w0);
      qfxCtx.lineTo(p1.x, p1.y + w1);
      qfxCtx.stroke();
    }
    raf = requestAnimationFrame(loop);
  }
  if(!prefersReducedMotion) raf = requestAnimationFrame(loop);
  return {
    onMove, onLeave, onRender,
    stop(){ running = false; cancelAnimationFrame(raf); qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height); inked.forEach(el => el.style.color = ''); }
  };
};

/* ===================== QUOTES ===================== */
const quotes = [
  { text: "Live, if only for the purpose of spiting death.", author: "AlphaHylian" },
  { text: "The clown who stumbles over his own feet is a gymnast and a juggler before he's a fool.", author: "Sean Anetsberger" },
  { text: "What's up with everyone and having friends?", author: "ShoeBilly_" },
  { text: "I'm a failure, but I'm a failure that doesn't fail.", author: "BetaRito" },
  { text: "You have no concept of your potential. Don't burn hot, burn BRIGHT!", author: "Noah Bennet" },
  { text: "I remember it all. I am the one with infinite wisdom. I am the one who prophesizes. I am the dream catcher.", author: "eggchan" },
  { text: "A jack of all trades is a master of none, but oftentimes better than a master of one.", author: "" },
  { text: "I just accept what's in front of me bru.", author: "eggchan" },
  { text: "I am the flame that refuses to be extinguished.", author: "FlameFrags" },
  { text: "a to a? you mean tuah? heh, lonmg story....", author: "sanitypun01" }
];

let quoteIndex = 0;
let quoteTimer = null;
const dotsWrap = document.getElementById('quote-dots');

quotes.forEach((_, i) => {
  const dot = document.createElement('span');
  if(i === 0) dot.classList.add('active');
  dot.addEventListener('click', () => setQuote(i, true));
  dotsWrap.appendChild(dot);
});

function renderQuote(){
  buildQuoteSpans(quoteTextEl, `"${quotes[quoteIndex].text}"`);
  buildQuoteSpans(quoteAuthorEl, quotes[quoteIndex].author ? `— ${quotes[quoteIndex].author}` : '');
  // Re-toggling 'active' restarts each dot's CSS fill animation from scratch.
  [...dotsWrap.children].forEach((d, i) => d.classList.toggle('active', i === quoteIndex));
  if(activeQfx && activeQfx.onRender) activeQfx.onRender();
}

function setQuote(i, manual){
  quoteBody.classList.add('swoosh-out');
  setTimeout(() => {
    quoteIndex = i;
    renderQuote();
    quoteBody.classList.remove('swoosh-out');
    quoteBody.classList.add('swoosh-in-instant');
    void quoteBody.offsetWidth;
    quoteBody.classList.remove('swoosh-in-instant');
  }, 280);
  if(manual) restartQuoteTimer();
}

function nextQuote(manual){ setQuote((quoteIndex + 1) % quotes.length, manual); }
function prevQuote(){ setQuote((quoteIndex - 1 + quotes.length) % quotes.length, true); }

function restartQuoteTimer(){
  clearInterval(quoteTimer);
  quoteTimer = setInterval(() => nextQuote(false), 10000);
}

document.getElementById('quote-next').addEventListener('click', () => nextQuote(true));
document.getElementById('quote-prev').addEventListener('click', prevQuote);

renderQuote();
restartQuoteTimer();

/* ===================== ABOUT PHOTO REVEAL ===================== */
const aboutPhoto = document.getElementById('about-photo');
const photoTop = document.getElementById('photo-top');

function setPhotoPos(x, y){
  const rect = aboutPhoto.getBoundingClientRect();
  // Radius scales with the photo so a cursor at the centre uncovers the whole
  // nametag (half the diagonal reaches every corner).
  const reach = Math.hypot(rect.width, rect.height) / 2;
  photoTop.style.setProperty('--mx', `${x - rect.left}px`);
  photoTop.style.setProperty('--my', `${y - rect.top}px`);
  photoTop.style.setProperty('--r0', `${(reach * 0.92).toFixed(1)}px`);
  photoTop.style.setProperty('--r1', `${(reach * 1.1).toFixed(1)}px`);
}

aboutPhoto.addEventListener('mousemove', e => setPhotoPos(e.clientX, e.clientY));
aboutPhoto.addEventListener('mouseleave', () => {
  photoTop.style.setProperty('--mx', '-400px');
  photoTop.style.setProperty('--my', '-400px');
});
aboutPhoto.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if(t) setPhotoPos(t.clientX, t.clientY);
}, { passive: true });

/* ===================== SKIN VIEWER ===================== */
const skinCanvas = document.getElementById('skin-canvas');
const skinCard = skinCanvas.parentElement;
const quoteCardEl = document.querySelector('.quote-card');

function positionSkinCard(){
  if(window.innerWidth <= 760) return;
  const quoteRect = quoteCardEl.getBoundingClientRect();
  const midX = (quoteRect.right + window.innerWidth) / 2;
  skinCard.style.left = `${midX - skinCard.offsetWidth / 2}px`;
}
positionSkinCard();
window.addEventListener('resize', positionSkinCard);
window.addEventListener('load', positionSkinCard);

// Wrapped so a WebGL failure (headless render, blocked context, old GPU) can't
// abort the rest of the script — the theme + background engine come after this.
let viewer = null;
try {
  viewer = new skinview3d.SkinViewer({
    canvas: skinCanvas,
    width: skinCard.clientWidth,
    height: skinCard.clientHeight,
    fov: 32,
    zoom: 0.82
  });

  viewer.loadSkin('assets/skin.png', { model: 'slim' });
  viewer.loadCape('assets/cape.png');

  viewer.animation = new skinview3d.IdleAnimation();
  viewer.animation.speed = 0.6;
  viewer.background = null;

  window.addEventListener('resize', () => {
    if(!viewer) return;
    viewer.width = skinCard.clientWidth;
    viewer.height = skinCard.clientHeight;
  });

  if(viewer.controls) viewer.controls.enabled = false;
} catch(err){
  console.warn('Skin viewer unavailable:', err);
  viewer = null;
}

const HEAD_SOFT_LIMIT = 0.698;
const HEAD_HARD_LIMIT = Math.PI / 4;
const HEAD_SPEED = 0.35;
const BODY_ASSIST_SPEED = 0.1;
const BODY_RESET_SPEED = 0.15;
const SETTLE_EPSILON = 0.015;
const DRAG_SENSITIVITY = 0.016;
const PITCH_DRAG_LIMIT = 1.2;
// The rig pitches the head about the neck pivot, not the eyes. On the 8x8 face
// the eyes sit on the 3rd pixel row from the bottom — ~0.19 of the head height
// below its geometric centre — so without a bias the pivot, not the eyes, ends
// up aimed at the cursor and the model appears to look up from under its brow.
// This tips the look-target down to land on the eyes. Tunable live.
const EYE_PITCH_OFFSET = 0.18;

let bodyYaw = 0, bodyPitch = 0;
let headYaw = 0, headPitch = 0;
let lookMode = 'tracking';
let lastPointerX = 0, lastPointerY = 0;

function pointerXY(e){
  if(e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function startDrag(e){
  const p = pointerXY(e);
  lastPointerX = p.x;
  lastPointerY = p.y;
  lookMode = 'dragging';
}

function dragMove(e){
  if(lookMode !== 'dragging') return;
  const p = pointerXY(e);
  const dx = p.x - lastPointerX;
  const dy = p.y - lastPointerY;
  lastPointerX = p.x;
  lastPointerY = p.y;
  bodyYaw += dx * DRAG_SENSITIVITY;
  bodyPitch = Math.max(-PITCH_DRAG_LIMIT, Math.min(PITCH_DRAG_LIMIT, bodyPitch + dy * DRAG_SENSITIVITY));
}

function endDrag(){
  if(lookMode !== 'dragging') return;
  lookMode = 'resetting';
}

skinCanvas.addEventListener('mousedown', startDrag);
skinCanvas.addEventListener('touchstart', startDrag, { passive: true });
window.addEventListener('mousemove', dragMove);
window.addEventListener('touchmove', dragMove, { passive: true });
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);

function overflowPast(value, limit){
  if(value > limit) return value - limit;
  if(value < -limit) return value + limit;
  return 0;
}

function updateHeadLook(){
  if(!viewer) return;
  const wrapper = viewer.playerWrapper;
  const head = viewer.playerObject && viewer.playerObject.skin.head;

  if(head && wrapper){
    if(lookMode === 'dragging'){
      headYaw += (0 - headYaw) * HEAD_SPEED;
      headPitch += (0 - headPitch) * HEAD_SPEED;
    } else if(lookMode === 'resetting'){
      bodyYaw += (0 - bodyYaw) * BODY_RESET_SPEED;
      bodyPitch += (0 - bodyPitch) * BODY_RESET_SPEED;
      headYaw += (0 - headYaw) * HEAD_SPEED;
      headPitch += (0 - headPitch) * HEAD_SPEED;
      if(Math.abs(bodyYaw) < SETTLE_EPSILON && Math.abs(bodyPitch) < SETTLE_EPSILON){
        bodyYaw = 0; bodyPitch = 0;
        lookMode = 'tracking';
      }
    } else {
      const rect = skinCanvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.32;
      const dx = (mouse.x - cx) / (rect.width / 2 || 1);
      const dy = (mouse.y - cy) / (rect.height / 2 || 1);

      const desiredYaw = Math.max(-1.6, Math.min(1.6, dx)) * 0.95;
      const desiredPitch = Math.max(-1.2, Math.min(1.2, dy)) * 0.85 + EYE_PITCH_OFFSET;

      const overflowYaw = overflowPast(desiredYaw - bodyYaw, HEAD_SOFT_LIMIT);
      const overflowPitch = overflowPast(desiredPitch - bodyPitch, HEAD_SOFT_LIMIT);
      bodyYaw += overflowYaw * BODY_ASSIST_SPEED;
      bodyPitch += overflowPitch * BODY_ASSIST_SPEED;

      const targetHeadYaw = Math.max(-HEAD_HARD_LIMIT, Math.min(HEAD_HARD_LIMIT, desiredYaw - bodyYaw));
      const targetHeadPitch = Math.max(-HEAD_HARD_LIMIT, Math.min(HEAD_HARD_LIMIT, desiredPitch - bodyPitch));
      headYaw += (targetHeadYaw - headYaw) * HEAD_SPEED;
      headPitch += (targetHeadPitch - headPitch) * HEAD_SPEED;
    }

    head.rotation.y = headYaw;
    head.rotation.x = headPitch;
    wrapper.rotation.y = bodyYaw;
    wrapper.rotation.x = bodyPitch;
  }

  requestAnimationFrame(updateHeadLook);
}
updateHeadLook();

/* ===================== INTERACTIVE BACKGROUND ENGINE ===================== */
// A theme owns its background. setBackground() tears the current one down
// (stops its RAF + resize listener) and starts the new one.
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
let bgW = 0, bgH = 0;

function fitBgCanvas(){
  bgW = bgCanvas.width = window.innerWidth;
  bgH = bgCanvas.height = window.innerHeight;
}
fitBgCanvas();

function makeBg(build){
  let raf = 0, running = false, last = 0;
  const api = build();
  function onResize(){ fitBgCanvas(); if(api.resize) api.resize(); }
  return {
    start(){
      fitBgCanvas();
      if(api.init) api.init();
      window.addEventListener('resize', onResize);
      if(prefersReducedMotion){ if(api.frame) api.frame(16, 0); return; }
      running = true;
      last = performance.now();
      const loop = now => {
        if(!running) return;
        const dt = Math.min(50, now - last); last = now;
        api.frame(dt, now);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    stop(){
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if(api.teardown) api.teardown();
    }
  };
}

const Backgrounds = {};
let activeBg = null;

function setBackground(name){
  if(activeBg && activeBg.stop) activeBg.stop();
  bgCtx.clearRect(0, 0, bgW, bgH);
  const factory = Backgrounds[name] || Backgrounds.stars;
  activeBg = factory();
  activeBg.start();
}

/* ---- stars: spawning/dying constellation + calm ambient layer ---- */
Backgrounds.stars = () => makeBg(() => {
  let bright = [], ambient = [];
  const rand = () => Math.random();

  function makeBright(){
    return {
      x: rand() * bgW, y: rand() * bgH,
      vx: (rand() - 0.5) * 0.25, vy: (rand() - 0.5) * 0.25,
      size: rand() < 0.8 ? 2 : 3,
      age: 0,
      life: 6000 + rand() * 10000,   // 6–16s before it dies and respawns elsewhere
      fadeIn: 900 + rand() * 500,
      fadeOut: 1200 + rand() * 700
    };
  }
  function makeAmbient(){
    return {
      x: rand() * bgW, y: rand() * bgH,
      vx: (rand() - 0.5) * 0.03, vy: (rand() - 0.5) * 0.03,
      phase: rand() * Math.PI * 2,
      tw: 0.0006 + rand() * 0.0012,
      base: 0.12 + rand() * 0.22
    };
  }
  function envelope(p){
    if(p.age < p.fadeIn) return p.age / p.fadeIn;
    const outStart = p.life - p.fadeOut;
    if(p.age > outStart) return Math.max(0, 1 - (p.age - outStart) / p.fadeOut);
    return 1;
  }

  function init(){
    const bCount = Math.min(320, Math.floor(bgW * bgH / 6500));
    const aCount = Math.floor(bCount * 1.4);
    bright = Array.from({ length: bCount }, makeBright);
    bright.forEach(p => { p.age = rand() * p.life; });   // stagger the lifecycle
    ambient = Array.from({ length: aCount }, makeAmbient);
  }

  function frame(dt, t){
    bgCtx.clearRect(0, 0, bgW, bgH);

    // ambient layer — behind, dim, barely moves, ignores the cursor
    for(const p of ambient){
      p.x += p.vx; p.y += p.vy;
      if(p.x < 0) p.x += bgW; else if(p.x > bgW) p.x -= bgW;
      if(p.y < 0) p.y += bgH; else if(p.y > bgH) p.y -= bgH;
      const a = p.base * (0.4 + 0.6 * Math.sin(p.phase + t * p.tw));
      bgCtx.fillStyle = `rgba(150,130,220,${Math.max(0, a).toFixed(3)})`;
      bgCtx.fillRect(p.x, p.y, 1, 1);
    }

    // bright interactive layer
    for(const p of bright){
      p.age += dt;
      if(p.age >= p.life){ Object.assign(p, makeBright()); }
      p.x += p.vx; p.y += p.vy;
      if(p.x < 0 || p.x > bgW) p.vx *= -1;
      if(p.y < 0 || p.y > bgH) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if(dist < 170 && dist > 0.001){
        const force = (170 - dist) / 170;
        p.x += (dx / dist) * force * 5.5;
        p.y += (dy / dist) * force * 5.5;
      }
      p._e = envelope(p);
    }

    for(const p of bright){
      bgCtx.fillStyle = `rgba(150,120,255,${(0.78 * p._e).toFixed(3)})`;
      bgCtx.fillRect(p.x, p.y, p.size, p.size);
    }
    for(let i = 0; i < bright.length; i++){
      const a = bright[i];
      for(let j = i + 1; j < bright.length; j++){
        const b = bright[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if(d < 130){
          const al = 0.36 * (1 - d / 130) * a._e * b._e;
          if(al <= 0.004) continue;
          bgCtx.strokeStyle = `rgba(150,120,255,${al.toFixed(3)})`;
          bgCtx.lineWidth = 1;
          bgCtx.beginPath();
          bgCtx.moveTo(a.x, a.y);
          bgCtx.lineTo(b.x, b.y);
          bgCtx.stroke();
        }
      }
    }
  }

  return { init, resize: init, frame };
});

/* ---- terminal: subtly falling 1s and 0s that brighten under the cursor ---- */
Backgrounds.terminal = () => makeBg(() => {
  const FONT = 14, COL = 14, ROW = 16;
  let cols = 0, rows = 0, totalH = 0, offs = [], speed = [], glyphs = [];

  function init(){
    cols = Math.ceil(bgW / COL) + 1;
    rows = Math.ceil(bgH / ROW) + 3;
    totalH = rows * ROW;
    offs = Array.from({ length: cols }, () => Math.random() * totalH);
    speed = Array.from({ length: cols }, () => 6 + Math.random() * 16);   // px/s — slow
    // Sparse: most cells are empty, so the rain stays faint and cheap to draw.
    glyphs = Array.from({ length: cols }, () =>
      Array.from({ length: rows }, () => (Math.random() < 0.3 ? (Math.random() < 0.5 ? '0' : '1') : null)));
  }

  function frame(dt, t){
    bgCtx.fillStyle = 'rgba(4,16,10,0.34)';   // trailing fade
    bgCtx.fillRect(0, 0, bgW, bgH);
    bgCtx.font = `${FONT}px 'JetBrains Mono', ui-monospace, Menlo, monospace`;
    bgCtx.textBaseline = 'top';

    for(let c = 0; c < cols; c++){
      offs[c] = (offs[c] + speed[c] * dt / 1000) % totalH;
      const x = c * COL;
      for(let r = 0; r < rows; r++){
        const g = glyphs[c][r];
        if(g === null) continue;
        const y = (r * ROW + offs[c]) % totalH - ROW;
        const dx = x - mouse.x, dy = y - mouse.y;
        const d = Math.hypot(dx, dy);
        let a = 0.055;
        if(d < 140) a = 0.055 + (1 - d / 140) * 0.85;
        bgCtx.fillStyle = `rgba(53,255,133,${a.toFixed(3)})`;
        bgCtx.fillText(g, x, y);
      }
      if(Math.random() < 0.04){
        const rr = (Math.random() * rows) | 0;
        glyphs[c][rr] = glyphs[c][rr] === null ? (Math.random() < 0.5 ? '0' : '1') : null;
      }
    }
  }

  return { init, resize: init, frame };
});

/* ---- minecraft: slow-falling iso blocks that light up near the cursor ---- */
Backgrounds.minecraft = () => makeBg(() => {
  let cubes = [];
  const PALETTES = [
    ['#7bbf3a', '#5a9e2a', '#3f7a1c'],   // grass
    ['#9c8a6c', '#877559', '#6a5a42'],   // dirt
    ['#9a9a9a', '#828282', '#666666'],   // stone
    ['#6ec6e6', '#57a9c9', '#3f87a6']    // diamond
  ];

  function shade(hex, lift){
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, r + lift * 95);
    g = Math.min(255, g + lift * 95);
    b = Math.min(255, b + lift * 95);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function makeCube(fromTop){
    const layer = 0.5 + Math.random() * 1.7;
    return {
      x: Math.random() * bgW,
      y: fromTop ? -60 - Math.random() * bgH * 0.5 : Math.random() * bgH,
      s: 12 + layer * 9,
      vy: 7 + layer * 15,
      vx: (Math.random() - 0.5) * 6,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.4 + Math.random() * 0.5,
      col: PALETTES[(Math.random() * PALETTES.length) | 0],
      glow: 0
    };
  }
  function drawCube(c){
    const w = c.s, h = c.s * 0.55, l = c.glow;
    bgCtx.save();
    bgCtx.translate(c.x, c.y);
    bgCtx.rotate(Math.sin(c.sway) * 0.05);
    bgCtx.beginPath();                       // top
    bgCtx.moveTo(0, -h); bgCtx.lineTo(w, 0); bgCtx.lineTo(0, h); bgCtx.lineTo(-w, 0);
    bgCtx.closePath();
    bgCtx.fillStyle = shade(c.col[0], l); bgCtx.fill();
    bgCtx.beginPath();                       // left face
    bgCtx.moveTo(-w, 0); bgCtx.lineTo(0, h); bgCtx.lineTo(0, h + c.s); bgCtx.lineTo(-w, c.s);
    bgCtx.closePath();
    bgCtx.fillStyle = shade(c.col[2], l); bgCtx.fill();
    bgCtx.beginPath();                       // right face
    bgCtx.moveTo(w, 0); bgCtx.lineTo(0, h); bgCtx.lineTo(0, h + c.s); bgCtx.lineTo(w, c.s);
    bgCtx.closePath();
    bgCtx.fillStyle = shade(c.col[1], l); bgCtx.fill();
    bgCtx.restore();
  }

  function init(){
    const count = Math.min(64, Math.floor(bgW * bgH / 26000));
    cubes = Array.from({ length: count }, () => makeCube(false));
  }

  function frame(dt){
    bgCtx.fillStyle = '#17150f';
    bgCtx.fillRect(0, 0, bgW, bgH);
    const sec = dt / 1000;
    for(const c of cubes){
      c.y += c.vy * sec;
      c.x += c.vx * sec;
      c.sway += c.swaySpeed * sec;
      const dx = c.x - mouse.x, dy = c.y - mouse.y;
      const d = Math.hypot(dx, dy);
      const target = d < 150 ? 1 - d / 150 : 0;
      c.glow += (target - c.glow) * 0.1;
      if(d < 150 && d > 0.001){
        const f = (150 - d) / 150;
        c.x += (dx / d) * f * 1.3;
        c.y += (dy / d) * f * 1.3;
      }
      if(c.y - c.s > bgH) Object.assign(c, makeCube(true));
      drawCube(c);
    }
  }

  return { init, resize: init, frame };
});

/* ---- synthwave: neon sun + scrolling perspective grid ---- */
Backgrounds.synthwave = () => makeBg(() => {
  let scroll = 0, stars = [];

  function init(){
    stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * bgW,
      y: Math.random() * bgH * 0.52,
      r: Math.random() < 0.85 ? 1 : 1.7,
      p: Math.random() * Math.PI * 2,
      tw: 0.001 + Math.random() * 0.003
    }));
  }

  function frame(dt, t){
    const horizon = bgH * 0.58;

    const sky = bgCtx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#1a0b32');
    sky.addColorStop(1, '#3a1152');
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, bgW, horizon);

    const gnd = bgCtx.createLinearGradient(0, horizon, 0, bgH);
    gnd.addColorStop(0, '#1a0730');
    gnd.addColorStop(1, '#0c0418');
    bgCtx.fillStyle = gnd;
    bgCtx.fillRect(0, horizon, bgW, bgH - horizon);

    for(const s of stars){
      const a = 0.25 + 0.6 * Math.abs(Math.sin(s.p + t * s.tw));
      bgCtx.fillStyle = `rgba(255,233,251,${a.toFixed(3)})`;
      bgCtx.fillRect(s.x, s.y, s.r, s.r);
    }

    // neon sun
    const cx = bgW / 2, cy = horizon - 92, rad = 94;
    bgCtx.save();
    bgCtx.beginPath();
    bgCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    bgCtx.clip();
    const sg = bgCtx.createLinearGradient(0, cy - rad, 0, cy + rad);
    sg.addColorStop(0, '#ffd93b');
    sg.addColorStop(0.5, '#ff5ca8');
    sg.addColorStop(1, '#ff2d95');
    bgCtx.fillStyle = sg;
    bgCtx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    bgCtx.fillStyle = '#3a1152';
    for(let i = 0; i < 7; i++){
      const gy = cy + i * 9 + 4;
      bgCtx.fillRect(cx - rad, gy, rad * 2, Math.max(2, i * 1.1));
    }
    bgCtx.restore();

    // grid floor
    scroll = (scroll + dt * 0.05) % 44;
    bgCtx.strokeStyle = 'rgba(0,229,255,0.4)';
    bgCtx.lineWidth = 1;
    for(let i = 0; i < 24; i++){
      const f = i / 24;
      const y = horizon + (f * f) * (bgH - horizon) + scroll * (0.25 + f);
      if(y > bgH || y < horizon) continue;
      bgCtx.globalAlpha = 0.12 + 0.5 * (y - horizon) / (bgH - horizon);
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(bgW, y);
      bgCtx.stroke();
    }
    bgCtx.globalAlpha = 0.3;
    const vanish = cx + (mouse.x >= 0 ? (mouse.x - cx) * 0.04 : 0);
    for(let i = -12; i <= 12; i++){
      const bx = cx + i * (bgW / 12);
      bgCtx.beginPath();
      bgCtx.moveTo(vanish, horizon);
      bgCtx.lineTo(bx, bgH);
      bgCtx.stroke();
    }
    bgCtx.globalAlpha = 1;

    if(mouse.y > horizon){
      const g = bgCtx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 130);
      g.addColorStop(0, 'rgba(0,229,255,0.25)');
      g.addColorStop(1, 'rgba(0,229,255,0)');
      bgCtx.fillStyle = g;
      bgCtx.fillRect(mouse.x - 130, mouse.y - 130, 260, 260);
    }

    bgCtx.fillStyle = 'rgba(0,0,0,0.05)';
    for(let y = 0; y < bgH; y += 3) bgCtx.fillRect(0, y, bgW, 1);
  }

  return { init, resize: init, frame };
});

/* ---- paper: ink blots that bloom then dry, droplets trail the cursor ---- */
Backgrounds.paper = () => makeBg(() => {
  let blots = [];
  let lastDrop = 0;

  function makeBlot(x, y, small){
    const big = !small;
    return {
      x: x == null ? Math.random() * bgW : x,
      y: y == null ? Math.random() * bgH : y,
      r: big ? 10 + Math.random() * 22 : 3 + Math.random() * 6,
      age: 0,
      grow: big ? 1400 + Math.random() * 1600 : 600,
      life: big ? 9000 + Math.random() * 8000 : 3000,
      seed: Math.random() * 1000,
      max: big ? 0.5 : 0.34
    };
  }

  function init(){
    blots = Array.from({ length: 7 }, () => {
      const b = makeBlot();
      b.age = Math.random() * b.life;
      return b;
    });
    lastDrop = 0;
  }

  function frame(dt, t){
    bgCtx.fillStyle = '#ede2c9';
    bgCtx.fillRect(0, 0, bgW, bgH);
    bgCtx.strokeStyle = 'rgba(53,41,26,0.06)';
    bgCtx.lineWidth = 1;
    for(let y = 40; y < bgH; y += 34){
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(bgW, y);
      bgCtx.stroke();
    }

    if(mouse.x >= 0 && t - lastDrop > 400){
      lastDrop = t;
      blots.push(makeBlot(mouse.x + (Math.random() - 0.5) * 10, mouse.y + (Math.random() - 0.5) * 10, true));
    }

    for(let i = blots.length - 1; i >= 0; i--){
      const b = blots[i];
      b.age += dt;
      if(b.age > b.life){ blots.splice(i, 1); continue; }
      const growth = Math.min(1, b.age / b.grow);
      const r = b.r * (0.3 + 0.7 * growth);
      const fade = b.age > b.life * 0.6 ? 1 - (b.age - b.life * 0.6) / (b.life * 0.4) : 1;
      const alpha = b.max * fade * (0.55 + 0.45 * growth);

      bgCtx.beginPath();
      const steps = 20;
      for(let k = 0; k <= steps; k++){
        const ang = (k / steps) * Math.PI * 2;
        const wob = 1 + 0.12 * Math.sin(ang * 3 + b.seed) + 0.06 * Math.cos(ang * 5 - b.seed);
        const px = b.x + Math.cos(ang) * r * wob;
        const py = b.y + Math.sin(ang) * r * wob;
        k === 0 ? bgCtx.moveTo(px, py) : bgCtx.lineTo(px, py);
      }
      bgCtx.closePath();
      const dried = b.age > b.grow * 1.6;
      bgCtx.fillStyle = dried
        ? `rgba(96,72,50,${(alpha * 0.3).toFixed(3)})`
        : `rgba(40,28,18,${alpha.toFixed(3)})`;
      bgCtx.fill();
    }

    if(blots.length < 11 && Math.random() < 0.003) blots.push(makeBlot());
  }

  return { init, resize: init, frame };
});

/* ===================== INIT THEME ===================== */
let savedTheme = 'stars';
try { savedTheme = localStorage.getItem('ah-theme') || 'stars'; } catch(e){}
applyTheme(savedTheme);
