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

// Ambient background motion respects this; cursor-driven feedback does not,
// since that's direct response to input rather than decorative movement.
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
      positionSkinCard();
      fitQfx();
      refreshQuoteCache();
    }
  });
});

/* ===================== THEME SWITCHER ===================== */
const THEMES = ['constellation', 'terminal', 'minecraft', 'paper', 'nether'];
// Older saved values that no longer exist map onto the default.
const THEME_ALIASES = { stars: 'constellation', synthwave: 'constellation' };

const themeToggle = document.getElementById('theme-toggle');
const themeMenu = document.getElementById('theme-menu');
const themeOptions = [...document.querySelectorAll('.theme-option')];

function applyTheme(name){
  name = THEME_ALIASES[name] || name;
  if(!THEMES.includes(name)) name = 'constellation';
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
// One effect is active at a time, chosen by the theme:
//   constellation -> a purple duplicate of the text, revealed through a mask
//                    of soft blobs along the recent cursor path (trailing paint)
//   terminal      -> editor caret box around the single hovered glyph
//   minecraft     -> hovered word gets a block-break highlight, poofs on exit
//   paper         -> an accurate pen stroke that follows the cursor anywhere
//                    on the panel and slowly dries away
const quoteBody = document.querySelector('.quote-body');
const quoteTextEl = document.getElementById('quote-text');
const quoteAuthorEl = document.getElementById('quote-author');
const paintLayer = document.getElementById('quote-paint');
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

// Exact duplicate of the live quote, used as the constellation paint layer.
// Cloning keeps the layout identical, so the purple copy sits pixel-perfect
// on top of the real text; ids are stripped to avoid duplicates in the DOM.
function buildPaintLayer(){
  paintLayer.textContent = '';
  [quoteTextEl, quoteAuthorEl].forEach(src => {
    const clone = src.cloneNode(true);
    clone.removeAttribute('id');
    paintLayer.appendChild(clone);
  });
}
function clearPaintLayer(){
  paintLayer.textContent = '';
  paintLayer.style.opacity = '0';
  paintLayer.style.webkitMaskImage = '';
  paintLayer.style.maskImage = '';
}

// Scoped to the real text only — the constellation paint layer is a clone that
// also lives inside .quote-body, and its spans must never enter the caches.
function quoteChars(){
  return [...quoteTextEl.querySelectorAll('.q-ch'), ...quoteAuthorEl.querySelectorAll('.q-ch')];
}
function quoteWords(){
  return [...quoteTextEl.querySelectorAll('.q-word'), ...quoteAuthorEl.querySelectorAll('.q-word')];
}

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
let bodyRect = { left: 0, top: 0 };
function refreshQuoteCache(){
  qfxRect = qfxCanvas.getBoundingClientRect();
  bodyRect = quoteBody.getBoundingClientRect();
  charCache = quoteChars().map(el => {
    const r = el.getBoundingClientRect();
    return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
             left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  wordCache = quoteWords().map(el => {
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
  clearPaintLayer();
  [...quoteChars(), ...quoteWords()].forEach(s => {
    s.style.color = ''; s.style.textShadow = ''; s.style.transform = '';
    s.classList.remove('q-box', 'q-break');
  });
  const factory = QuoteEffects[name] || QuoteEffects.constellation;
  activeQfx = factory();
  if(activeQfx.onRender) activeQfx.onRender();
}

// Listeners live on the whole card, not just the text, so effects can react to
// the cursor being *near* the words (and so paper can draw across the panel).
qCard.addEventListener('mousemove', e => {
  if(activeQfx && activeQfx.onMove) activeQfx.onMove(e);
});
qCard.addEventListener('mouseleave', () => {
  if(activeQfx && activeQfx.onLeave) activeQfx.onLeave();
});
qCard.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if(t && activeQfx && activeQfx.onMove) activeQfx.onMove({ clientX: t.clientX, clientY: t.clientY });
}, { passive: true });

/* ---- constellation: purple paint revealed through a trailing mask ---- */
QuoteEffects.constellation = () => {
  const TRAIL_MS = 950;    // how long a painted spot lingers
  const BLOB_R = 54;       // radius of the brush at the cursor
  const MAX_PTS = 16;      // mask layers — keep modest, each one costs
  const MIN_STEP = 9;      // px between recorded points
  let pts = [];
  let raf = 0, running = true;

  function onRender(){ buildPaintLayer(); }

  function onMove(e){
    const x = e.clientX - bodyRect.left;
    const y = e.clientY - bodyRect.top;
    const last = pts[pts.length - 1];
    if(last && Math.hypot(x - last.x, y - last.y) < MIN_STEP){
      last.t = performance.now();   // resting on a spot keeps it wet
      return;
    }
    pts.push({ x, y, t: performance.now() });
    if(pts.length > MAX_PTS) pts.shift();
    apply();
  }
  function onLeave(){}

  function apply(){
    const now = performance.now();
    const layers = [];
    for(const p of pts){
      const age = (now - p.t) / TRAIL_MS;
      if(age >= 1) continue;
      const a = Math.pow(1 - age, 1.5);
      const rad = BLOB_R * (0.62 + 0.38 * (1 - age));
      layers.push(
        `radial-gradient(circle ${rad.toFixed(1)}px at ${p.x.toFixed(1)}px ${p.y.toFixed(1)}px,` +
        ` rgba(0,0,0,${a.toFixed(3)}) 0%,` +
        ` rgba(0,0,0,${(a * 0.8).toFixed(3)}) 45%,` +
        ` rgba(0,0,0,0) 100%)`
      );
    }
    if(!layers.length){ paintLayer.style.opacity = '0'; return; }
    const s = layers.join(',');
    paintLayer.style.opacity = '1';
    paintLayer.style.webkitMaskImage = s;
    paintLayer.style.maskImage = s;
  }

  function loop(){
    if(!running) return;
    if(pts.length) apply();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    onMove, onLeave, onRender,
    stop(){ running = false; cancelAnimationFrame(raf); clearPaintLayer(); }
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
    if(current){ current.classList.remove('q-break'); poof(current); current = null; }
  }
  return {
    onMove, onLeave, onRender,
    stop(){
      quoteWords().forEach(el => el.classList.remove('q-break'));
      qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
    }
  };
};

/* ---- paper: a pen stroke that traces the cursor across the whole panel,
       and letters it passes turning to ink ---- */
QuoteEffects.paper = () => {
  const STROKE_MS = 2400;  // how long the ink takes to dry away
  const MIN_STEP = 3;      // px between recorded points
  const MAX_PTS = 420;
  const CHUNK = 14;        // segments per stroked path — batching keeps it cheap
  const INK_REACH = 46;    // px around the nib that stains the letters
  const INK_DECAY = 0.012; // per frame — letters fade back over ~1.4s
  let pts = [];
  let inked = new Map();
  let raf = 0, running = true;

  function clearInk(){
    inked.forEach((_, el) => { el.style.color = ''; });
    inked = new Map();
  }
  function onRender(){ refreshQuoteCache(); pts = []; clearInk(); }

  function onMove(e){
    const x = e.clientX - qfxRect.left;
    const y = e.clientY - qfxRect.top;
    const last = pts[pts.length - 1];
    if(!last || Math.hypot(x - last.x, y - last.y) >= MIN_STEP){
      pts.push({ x, y, t: performance.now(), brk: false });
      if(pts.length > MAX_PTS) pts.shift();
    }
    for(const c of charCache){
      if(Math.hypot(c.cx - e.clientX, c.cy - e.clientY) < INK_REACH) inked.set(c.el, 1);
    }
  }
  // Pen lifts when the cursor leaves the panel — don't join across the gap.
  function onLeave(){ if(pts.length) pts[pts.length - 1].brk = true; }

  function loop(){
    if(!running) return;
    const now = performance.now();

    // letters stained by the nib, easing back to the body colour
    inked.forEach((level, el) => {
      const next = level - INK_DECAY;
      if(next <= 0){ el.style.color = ''; inked.delete(el); return; }
      inked.set(el, next);
      el.style.color = `rgba(53,80,112,${(0.35 + 0.65 * next).toFixed(3)})`;
    });

    while(pts.length && now - pts[0].t > STROKE_MS) pts.shift();
    qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
    qfxCtx.lineCap = 'round';
    qfxCtx.lineJoin = 'round';

    for(let start = 0; start < pts.length - 1; start += CHUNK){
      const end = Math.min(pts.length - 1, start + CHUNK);
      const mid = pts[(start + end) >> 1];
      const age = (now - mid.t) / STROKE_MS;
      const alpha = Math.max(0, 1 - age) * 0.85;
      if(alpha <= 0.01) continue;
      qfxCtx.strokeStyle = `rgba(38,29,19,${alpha.toFixed(3)})`;
      qfxCtx.lineWidth = 2.5 * (1 - age * 0.55) + 0.5;
      qfxCtx.beginPath();
      let penDown = false;
      for(let i = start; i <= end; i++){
        const p = pts[i];
        if(!penDown){ qfxCtx.moveTo(p.x, p.y); penDown = true; }
        else qfxCtx.lineTo(p.x, p.y);
        if(p.brk) penDown = false;
      }
      qfxCtx.stroke();
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    onMove, onLeave, onRender,
    stop(){
      running = false;
      cancelAnimationFrame(raf);
      qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height);
      clearInk();
    }
  };
};

/* ---- nether: same trailing paint-mask as constellation, recoloured to fire
       entirely in CSS (see html[data-theme="nether"] .quote-paint) ---- */
QuoteEffects.nether = QuoteEffects.constellation;

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
  refreshQuoteCache();
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
// Tracked globally, so the hole keeps following the cursor even when it's off
// the image. The radius only needs to be big enough that parking the cursor on
// the nametag uncovers the whole name.
const aboutPhoto = document.getElementById('about-photo');
const photoTop = document.getElementById('photo-top');
const REVEAL_INNER = 0.42;   // × photo width — solid reveal
const REVEAL_OUTER = 0.52;   // × photo width — feathered edge

function setPhotoPos(x, y){
  const rect = aboutPhoto.getBoundingClientRect();
  if(!rect.width) return;
  photoTop.style.setProperty('--mx', `${(x - rect.left).toFixed(1)}px`);
  photoTop.style.setProperty('--my', `${(y - rect.top).toFixed(1)}px`);
  photoTop.style.setProperty('--r0', `${(rect.width * REVEAL_INNER).toFixed(1)}px`);
  photoTop.style.setProperty('--r1', `${(rect.width * REVEAL_OUTER).toFixed(1)}px`);
}

window.addEventListener('mousemove', e => setPhotoPos(e.clientX, e.clientY));
window.addEventListener('touchmove', e => {
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

// A press only becomes a drag once the pointer actually moves — otherwise a
// plain click on the model would drop head tracking and snap it to centre.
const DRAG_THRESHOLD = 4;
let dragArmed = false;
let dragOriginX = 0, dragOriginY = 0;

function startDrag(e){
  const p = pointerXY(e);
  lastPointerX = dragOriginX = p.x;
  lastPointerY = dragOriginY = p.y;
  dragArmed = true;
}

function dragMove(e){
  if(!dragArmed && lookMode !== 'dragging') return;
  const p = pointerXY(e);
  if(dragArmed){
    if(Math.hypot(p.x - dragOriginX, p.y - dragOriginY) < DRAG_THRESHOLD){
      lastPointerX = p.x; lastPointerY = p.y;
      return;
    }
    dragArmed = false;
    lookMode = 'dragging';
  }
  const dx = p.x - lastPointerX;
  const dy = p.y - lastPointerY;
  lastPointerX = p.x;
  lastPointerY = p.y;
  bodyYaw += dx * DRAG_SENSITIVITY;
  bodyPitch = Math.max(-PITCH_DRAG_LIMIT, Math.min(PITCH_DRAG_LIMIT, bodyPitch + dy * DRAG_SENSITIVITY));
}

function endDrag(){
  dragArmed = false;
  if(lookMode !== 'dragging') return;
  lookMode = 'resetting';
}

skinCanvas.addEventListener('mousedown', startDrag);
skinCanvas.addEventListener('touchstart', startDrag, { passive: true });
window.addEventListener('mousemove', dragMove);
window.addEventListener('touchmove', dragMove, { passive: true });
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);

/* ---- punch on click ----
   Uses skinview3d's own HitAnimation, layered onto the running IdleAnimation
   via PlayerAnimation.addAnimation() so it plays once and removes itself.
   Reassigning viewer.animation is avoided on purpose: that setter calls
   playerObject.resetJoints(), which zeroes the head and makes the model
   visibly lose cursor tracking for a moment after every click. */
const HIT_SPEED = 1.9;                                // playback rate of the swing
const HIT_PERIOD = (2 * Math.PI / 18) / HIT_SPEED;    // exactly one full swing
let hitAnim = null;
let punchId = null;

function triggerPunch(){
  if(!viewer || !viewer.playerObject || !viewer.animation) return;
  if(punchId !== null) return;
  if(!hitAnim) hitAnim = new skinview3d.HitAnimation();
  const anim = viewer.animation;

  // IdleAnimation only writes leftArm.rotation.z, rightArm.rotation.z and
  // cape.rotation.x each frame. Everything else the swing touches is static, so
  // it has to be snapshotted HERE, at rest — reading it back inside the
  // callback would just read the previous frame's blended output and the arm
  // would converge to wherever it drifted instead of to neutral.
  const skin0 = viewer.playerObject.skin;
  const rest = {
    rax: skin0.rightArm.rotation.x,
    lax: skin0.leftArm.rotation.x,
    lpx: skin0.leftArm.position.x,
    lpz: skin0.leftArm.position.z,
    by:  skin0.body.rotation.y
  };

  function restorePose(skin){
    skin.rightArm.rotation.x = rest.rax;
    skin.leftArm.rotation.x  = rest.lax;
    skin.leftArm.position.x  = rest.lpx;
    skin.leftArm.position.z  = rest.lpz;
    skin.body.rotation.y     = rest.by;
  }

  punchId = anim.addAnimation((player, progress, id) => {
    const skin = player.skin;
    if(progress >= HIT_PERIOD){
      anim.removeAnimation(id);
      if(punchId === id) punchId = null;
      restorePose(skin);            // land exactly back on neutral
      return;
    }

    // the two z rotations ARE idle-driven, so this frame's value is the true
    // rest pose for them
    const restRaz = skin.rightArm.rotation.z;
    const restLaz = skin.leftArm.rotation.z;

    hitAnim.progress = progress * HIT_SPEED;
    hitAnim.animate(player);

    const edge = Math.min(progress, HIT_PERIOD - progress) / (HIT_PERIOD * 0.3);
    const e = Math.max(0, Math.min(1, edge));
    const k = e * e * (3 - 2 * e);                    // smoothstep
    const mix = (cur, base) => base + (cur - base) * k;
    skin.rightArm.rotation.x = mix(skin.rightArm.rotation.x, rest.rax);
    skin.rightArm.rotation.z = mix(skin.rightArm.rotation.z, restRaz);
    skin.leftArm.rotation.x  = mix(skin.leftArm.rotation.x,  rest.lax);
    skin.leftArm.rotation.z  = mix(skin.leftArm.rotation.z,  restLaz);
    skin.leftArm.position.x  = mix(skin.leftArm.position.x,  rest.lpx);
    skin.leftArm.position.z  = mix(skin.leftArm.position.z,  rest.lpz);
    skin.body.rotation.y     = mix(skin.body.rotation.y,     rest.by);
  });
}
window.addEventListener('mousedown', triggerPunch);
window.addEventListener('touchstart', triggerPunch, { passive: true });

function overflowPast(value, limit){
  if(value > limit) return value - limit;
  if(value < -limit) return value + limit;
  return 0;
}

// Wrap an angle into (-PI, PI] so easing takes the short way round.
function normalizeAngle(a){
  a = (a + Math.PI) % (Math.PI * 2);
  if(a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

// Where the cursor wants the model to look, in yaw/pitch.
function lookTarget(){
  const rect = skinCanvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.32;
  const dx = (mouse.x - cx) / (rect.width / 2 || 1);
  const dy = (mouse.y - cy) / (rect.height / 2 || 1);
  return {
    yaw: Math.max(-1.6, Math.min(1.6, dx)) * 0.95,
    pitch: Math.max(-1.2, Math.min(1.2, dy)) * 0.85 + EYE_PITCH_OFFSET
  };
}

// The body angle continuous tracking would settle at for a given look target:
// zero while the head can cover it alone, otherwise just enough to take up the
// slack past the soft limit.
function restingBody(desired){
  return desired - Math.max(-HEAD_SOFT_LIMIT, Math.min(HEAD_SOFT_LIMIT, desired));
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
      // Settle straight into the pose that's already looking at the cursor,
      // taking the shortest way round rather than unwinding the whole spin.
      const { yaw: desiredYaw, pitch: desiredPitch } = lookTarget();
      const targetBodyYaw = restingBody(desiredYaw);
      const targetBodyPitch = restingBody(desiredPitch);

      bodyYaw = targetBodyYaw + normalizeAngle(bodyYaw - targetBodyYaw);
      bodyPitch = targetBodyPitch + normalizeAngle(bodyPitch - targetBodyPitch);
      bodyYaw += (targetBodyYaw - bodyYaw) * BODY_RESET_SPEED;
      bodyPitch += (targetBodyPitch - bodyPitch) * BODY_RESET_SPEED;

      // the head keeps tracking throughout, so it arrives already on target
      const th = Math.max(-HEAD_HARD_LIMIT, Math.min(HEAD_HARD_LIMIT, desiredYaw - bodyYaw));
      const tp = Math.max(-HEAD_HARD_LIMIT, Math.min(HEAD_HARD_LIMIT, desiredPitch - bodyPitch));
      headYaw += (th - headYaw) * HEAD_SPEED;
      headPitch += (tp - headPitch) * HEAD_SPEED;

      if(Math.abs(bodyYaw - targetBodyYaw) < SETTLE_EPSILON &&
         Math.abs(bodyPitch - targetBodyPitch) < SETTLE_EPSILON){
        bodyYaw = targetBodyYaw; bodyPitch = targetBodyPitch;
        lookMode = 'tracking';
      }
    } else {
      const { yaw: desiredYaw, pitch: desiredPitch } = lookTarget();

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
// (stops its RAF + resize listener) and starts the new one. Each background
// may expose click(x, y) for its own click effect.
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
      if(prefersReducedMotion){ if(api.frame) api.frame(16, performance.now()); return; }
      running = true;
      last = performance.now();
      const loop = now => {
        if(!running) return;
        const dt = Math.min(50, now - last); last = now;
        // A throw inside a rAF callback kills the loop permanently, freezing
        // the background mid-frame. Never let one bad frame do that.
        try { api.frame(dt, now); }
        catch(err){ console.warn('background frame failed:', err); }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    stop(){
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if(api.teardown) api.teardown();
    },
    click(x, y){
      if(!api.click) return;
      api.click(x, y);
      // With animation suppressed there's no loop to show it, so repaint once.
      if(prefersReducedMotion && api.frame) api.frame(16, performance.now());
    }
  };
}

const Backgrounds = {};
let activeBg = null;

function setBackground(name){
  if(activeBg && activeBg.stop) activeBg.stop();
  bgCtx.clearRect(0, 0, bgW, bgH);
  const factory = Backgrounds[name] || Backgrounds.constellation;
  activeBg = factory();
  activeBg.start();
}

window.addEventListener('mousedown', e => {
  if(activeBg && activeBg.click) activeBg.click(e.clientX, e.clientY);
});

/* ---- constellation: spawning/dying stars + calm ambient layer ---- */
Backgrounds.constellation = () => makeBg(() => {
  let bright = [], ambient = [], waves = [];
  const rand = () => Math.random();

  function makeBright(){
    return {
      x: rand() * bgW, y: rand() * bgH,
      vx: (rand() - 0.5) * 0.25, vy: (rand() - 0.5) * 0.25,
      size: rand() < 0.8 ? 2 : 3,
      age: 0,
      life: 6000 + rand() * 10000,   // 6–16s before it dies and respawns elsewhere
      fadeIn: 900 + rand() * 500,
      fadeOut: 1200 + rand() * 700,
      flare: 0
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
    waves = [];
  }

  // Click sends out a gentle ripple — a slight nudge and a brief brightening,
  // nothing that visibly rearranges the constellation.
  const WAVE_MS = 900;
  const WAVE_SPEED = 460;     // px/s
  const WAVE_BAND = 46;       // how wide the ripple front is
  const WAVE_PUSH = 1.2;      // px/frame at the very centre of the front
  function click(x, y){
    waves.push({ x, y, t: performance.now() });
    if(waves.length > 3) waves.shift();
  }

  function frame(dt, t){
    bgCtx.clearRect(0, 0, bgW, bgH);

    for(let i = waves.length - 1; i >= 0; i--){
      if(t - waves[i].t > WAVE_MS) waves.splice(i, 1);
    }

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

      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if(dist < 170 && dist > 0.001){
        const force = (170 - dist) / 170;
        p.x += (dx / dist) * force * 5.5;
        p.y += (dy / dist) * force * 5.5;
      }

      for(const w of waves){
        // The rAF timestamp is the frame's start, which can predate the
        // performance.now() taken while handling the click — so clamp, or the
        // ring radius below goes negative and arc() throws.
        const age = Math.max(0, (t - w.t) / WAVE_MS);
        const ring = age * WAVE_SPEED;
        const wx = p.x - w.x, wy = p.y - w.y;
        const d = Math.hypot(wx, wy);
        const band = Math.abs(d - ring);
        if(band < WAVE_BAND && d > 0.001){
          const strength = (1 - band / WAVE_BAND) * (1 - age);
          p.x += (wx / d) * strength * WAVE_PUSH;
          p.y += (wy / d) * strength * WAVE_PUSH;
          p.flare = Math.max(p.flare, strength * 0.5);
        }
      }
      p.flare *= 0.93;

      // Clamp back on screen and turn the velocity inward. The cursor and the
      // click ripple can shove a star past the edge; only flipping velocity
      // (the old behaviour) left it stranded outside, flipping every frame and
      // never returning — after some clicking enough stars were gone that the
      // constellation lines visibly fell apart.
      if(p.x < 0){ p.x = 0; p.vx = Math.abs(p.vx); }
      else if(p.x > bgW){ p.x = bgW; p.vx = -Math.abs(p.vx); }
      if(p.y < 0){ p.y = 0; p.vy = Math.abs(p.vy); }
      else if(p.y > bgH){ p.y = bgH; p.vy = -Math.abs(p.vy); }

      p._e = envelope(p);
    }

    for(const p of bright){
      const a = 0.78 * p._e + p.flare * 0.35;
      bgCtx.fillStyle = `rgba(${(150 + p.flare * 70) | 0},${(120 + p.flare * 80) | 0},255,${Math.min(1, a).toFixed(3)})`;
      bgCtx.fillRect(p.x, p.y, p.size, p.size);
    }

    // barely-there expanding ring so the ripple still reads in sparse areas
    for(const w of waves){
      const age = Math.max(0, (t - w.t) / WAVE_MS);
      bgCtx.strokeStyle = `rgba(168,136,255,${(0.1 * (1 - age)).toFixed(3)})`;
      bgCtx.lineWidth = 1;
      bgCtx.beginPath();
      bgCtx.arc(w.x, w.y, Math.max(0, age * WAVE_SPEED), 0, Math.PI * 2);
      bgCtx.stroke();
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

  return { init, resize: init, frame, click };
});

/* ---- terminal: dim falling 1s and 0s that light up under the cursor;
       clicking drops a bright data packet down that column ---- */
Backgrounds.terminal = () => makeBg(() => {
  const FONT = 14, COL = 14, ROW = 16;
  const BASE_ALPHA = 0.03;    // dim at rest
  const CURSOR_R = 135;       // glyphs within this of the cursor brighten
  const CURSOR_BOOST = 0.8;
  const STREAM_SPEED = 900;   // px/s the packet falls
  const STREAM_TAIL = 190;    // px of glowing tail behind its head
  let cols = 0, rows = 0, totalH = 0, offs = [], speed = [], glyphs = [];
  let streams = [];

  function init(){
    cols = Math.ceil(bgW / COL) + 1;
    rows = Math.ceil(bgH / ROW) + 3;
    totalH = rows * ROW;
    offs = Array.from({ length: cols }, () => Math.random() * totalH);
    speed = Array.from({ length: cols }, () => 6 + Math.random() * 16);   // px/s — slow
    // Sparse: most cells are empty, so the rain stays faint and cheap to draw.
    glyphs = Array.from({ length: cols }, () =>
      Array.from({ length: rows }, () => (Math.random() < 0.3 ? (Math.random() < 0.5 ? '0' : '1') : null)));
    streams = [];
  }

  // A click fires a packet down the clicked column (and its neighbours).
  function click(x, y){
    const c = Math.round(x / COL);
    for(let k = -1; k <= 1; k++){
      streams.push({ col: c + k, y: y - Math.abs(k) * 30, head: y - Math.abs(k) * 30 });
    }
    if(streams.length > 24) streams.splice(0, streams.length - 24);
  }

  function frame(dt, t){
    bgCtx.fillStyle = 'rgba(4,16,10,0.45)';   // trailing fade
    bgCtx.fillRect(0, 0, bgW, bgH);
    bgCtx.font = `${FONT}px 'JetBrains Mono', ui-monospace, Menlo, monospace`;
    bgCtx.textBaseline = 'top';

    for(let i = streams.length - 1; i >= 0; i--){
      streams[i].head += STREAM_SPEED * dt / 1000;
      if(streams[i].head - STREAM_TAIL > bgH) streams.splice(i, 1);
    }

    for(let c = 0; c < cols; c++){
      offs[c] = (offs[c] + speed[c] * dt / 1000) % totalH;
      const x = c * COL;
      // packets running down this column right now
      const colStreams = streams.length ? streams.filter(s => s.col === c) : null;

      for(let r = 0; r < rows; r++){
        const g = glyphs[c][r];
        if(g === null) continue;
        const y = (r * ROW + offs[c]) % totalH - ROW;

        let a = BASE_ALPHA;
        const d = Math.hypot(x - mouse.x, y - mouse.y);
        if(d < CURSOR_R) a += (1 - d / CURSOR_R) * CURSOR_BOOST;

        let head = 0;
        if(colStreams){
          for(const s of colStreams){
            const behind = s.head - y;
            if(behind >= 0 && behind < STREAM_TAIL){
              const f = 1 - behind / STREAM_TAIL;
              a += f;
              if(behind < ROW * 1.5) head = Math.max(head, 1 - behind / (ROW * 1.5));
            }
          }
        }

        bgCtx.fillStyle = head > 0
          ? `rgba(${(190 + 65 * head) | 0},255,${(190 + 60 * head) | 0},${Math.min(1, a).toFixed(3)})`
          : `rgba(53,255,133,${Math.min(1, a).toFixed(3)})`;
        bgCtx.fillText(g, x, y);
      }
      if(Math.random() < 0.04){
        const rr = (Math.random() * rows) | 0;
        glyphs[c][rr] = glyphs[c][rr] === null ? (Math.random() < 0.5 ? '0' : '1') : null;
      }
    }
  }

  return { init, resize: init, frame, click };
});

/* ---- minecraft: a cave wall of blocks lit by a torch that follows the cursor;
       clicking mines the block under it ---- */
Backgrounds.minecraft = () => makeBg(() => {
  const CELL = 42;            // block size in px
  const TORCH_R = 430;        // torchlight radius
  let field = null;           // offscreen canvas: the wall at full brightness
  let motes = [];
  let breaks = [];
  let parts = [];
  let flick = 0;

  const ORES = [
    { c: '#3a3a3e', chance: 0.030 },   // coal
    { c: '#d9c1a2', chance: 0.018 },   // iron
    { c: '#f2d24a', chance: 0.008 },   // gold
    { c: '#7ce9e0', chance: 0.005 },   // diamond
    { c: '#e04a4a', chance: 0.009 }    // redstone
  ];
  // Stone variants rather than dirt — reads as a proper cave wall.
  const ROCKS = [
    { base: [124, 122, 120], w: 0.52 },   // stone
    { base: [104, 102, 100], w: 0.22 },   // cobblestone
    { base: [ 74,  74,  82], w: 0.16 },   // deepslate
    { base: [141, 139, 136], w: 0.10 }    // andesite
  ];
  function pickRock(){
    let r = Math.random();
    for(const rock of ROCKS){
      if(r < rock.w) return rock.base;
      r -= rock.w;
    }
    return ROCKS[0].base;
  }

  const clamp255 = v => Math.max(0, Math.min(255, v | 0));

  // The wall never moves, so it's rendered once into an offscreen canvas and
  // each frame is just that image plus a lighting pass — two draws, not 10k.
  function buildField(){
    field = document.createElement('canvas');
    field.width = Math.max(1, bgW);
    field.height = Math.max(1, bgH);
    const f = field.getContext('2d');
    const cols = Math.ceil(bgW / CELL), rows = Math.ceil(bgH / CELL);
    const px = CELL / 8;

    for(let cx = 0; cx < cols; cx++){
      for(let cy = 0; cy < rows; cy++){
        const x = cx * CELL, y = cy * CELL;
        const base = pickRock();
        f.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
        f.fillRect(x, y, CELL, CELL);

        for(let i = 0; i < 24; i++){          // pixel noise = block texture
          const n = (Math.random() - 0.5) * 46;
          f.fillStyle = `rgb(${clamp255(base[0] + n)},${clamp255(base[1] + n)},${clamp255(base[2] + n)})`;
          f.fillRect(x + ((Math.random() * 8) | 0) * px, y + ((Math.random() * 8) | 0) * px, px, px);
        }

        for(const ore of ORES){               // an occasional ore vein
          if(Math.random() < ore.chance){
            f.fillStyle = ore.c;
            const n = 3 + ((Math.random() * 4) | 0);
            for(let i = 0; i < n; i++){
              f.fillRect(x + (1 + ((Math.random() * 6) | 0)) * px,
                         y + (1 + ((Math.random() * 6) | 0)) * px, px, px);
            }
            break;
          }
        }

        f.fillStyle = 'rgba(0,0,0,0.22)';     // block seams
        f.fillRect(x, y + CELL - px / 2, CELL, px / 2);
        f.fillRect(x + CELL - px / 2, y, px / 2, CELL);
      }
    }
  }

  function init(){
    buildField();
    breaks = [];
    parts = [];
    motes = Array.from({ length: 70 }, () => ({
      x: Math.random() * bgW,
      y: Math.random() * bgH,
      vx: (Math.random() - 0.5) * 6,
      vy: -4 - Math.random() * 10,
      s: Math.random() < 0.7 ? 2 : 3
    }));
  }

  function click(x, y){
    const bx = Math.floor(x / CELL) * CELL;
    const by = Math.floor(y / CELL) * CELL;
    breaks.push({ x: bx, y: by, t: performance.now() });
    if(breaks.length > 70) breaks.shift();
    for(let i = 0; i < 18; i++){
      parts.push({
        x: bx + CELL / 2, y: by + CELL / 2,
        vx: (Math.random() - 0.5) * 190,
        vy: -Math.random() * 170,
        s: 2 + Math.random() * 3,
        life: 1
      });
    }
  }

  function frame(dt, t){
    if(!field) buildField();
    const sec = dt / 1000;

    bgCtx.drawImage(field, 0, 0);

    // mined-out blocks, before lighting so the holes stay dark
    for(let i = breaks.length - 1; i >= 0; i--){
      const b = breaks[i];
      if(t - b.t > 6000){ breaks.splice(i, 1); continue; }
      bgCtx.fillStyle = '#0a0908';
      bgCtx.fillRect(b.x, b.y, CELL, CELL);
    }

    // torchlight — multiply a warm radial falloff over the wall
    flick += dt;
    const wob = 1 + Math.sin(flick * 0.011) * 0.035 + Math.sin(flick * 0.027) * 0.02;
    const R = TORCH_R * wob;
    const lx = mouse.x < 0 ? bgW * 0.5 : mouse.x;
    const ly = mouse.y < 0 ? bgH * 0.42 : mouse.y;
    const g = bgCtx.createRadialGradient(lx, ly, 0, lx, ly, R);
    g.addColorStop(0,    'rgb(255,246,224)');
    g.addColorStop(0.32, 'rgb(214,178,130)');
    g.addColorStop(0.66, 'rgb(116,97,74)');
    g.addColorStop(1,    'rgb(36,32,27)');
    bgCtx.globalCompositeOperation = 'multiply';
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, bgW, bgH);
    bgCtx.globalCompositeOperation = 'source-over';

    // cave dust drifting up, brighter inside the torchlight
    for(const m of motes){
      m.x += m.vx * sec;
      m.y += m.vy * sec;
      if(m.y < -8){ m.y = bgH + 8; m.x = Math.random() * bgW; }
      if(m.x < -8) m.x = bgW + 8; else if(m.x > bgW + 8) m.x = -8;
      const lit = Math.max(0.05, 1 - Math.hypot(m.x - lx, m.y - ly) / R);
      bgCtx.fillStyle = `rgba(255,226,182,${(lit * 0.5).toFixed(3)})`;
      bgCtx.fillRect(m.x, m.y, m.s, m.s);
    }

    // block-break debris
    for(let i = parts.length - 1; i >= 0; i--){
      const p = parts[i];
      p.vy += 620 * sec;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.life -= sec * 1.3;
      if(p.life <= 0){ parts.splice(i, 1); continue; }
      const lit = Math.max(0.15, 1 - Math.hypot(p.x - lx, p.y - ly) / R);
      bgCtx.fillStyle = `rgba(${(150 * lit + 40) | 0},${(142 * lit + 38) | 0},${(136 * lit + 34) | 0},${p.life.toFixed(2)})`;
      bgCtx.fillRect(p.x, p.y, p.s, p.s);
    }
  }

  return { init, resize: init, frame, click };
});

/* ---- paper: ambient stains that bloom then dry, a connected ink trail off
       the cursor, and an ink bloom that wicks into the paper on click ---- */
Backgrounds.paper = () => makeBg(() => {
  const DROP_MS = 280;         // the trail carries the motion, so drops are
                               // fewer and fatter than before
  const TRAIL_MS = 2600;       // how long the trail stays wet
  const TRAIL_STEP = 5;        // px between recorded trail points
  const MAX_TRAIL = 260;
  let blots = [];
  let blooms = [];
  let trail = [];
  let lastDrop = 0;

  function makeBlot(x, y, big){
    return {
      x: x == null ? Math.random() * bgW : x,
      y: y == null ? Math.random() * bgH : y,
      r: big ? 10 + Math.random() * 22 : 5 + Math.random() * 7,
      age: 0,
      grow: big ? 1400 + Math.random() * 1600 : 420,
      life: big ? 9000 + Math.random() * 8000 : TRAIL_MS,
      seed: Math.random() * 1000,
      max: big ? 0.5 : 0.4
    };
  }

  function init(){
    blots = Array.from({ length: 7 }, () => {
      const b = makeBlot(null, null, true);
      b.age = Math.random() * b.life;
      return b;
    });
    blooms = [];
    trail = [];
    lastDrop = 0;
  }

  // Click = a drop of ink hitting the page: a stain that swells and wicks into
  // the fibres, irregular lobes creeping off its edge, a soft halo bleeding
  // past that, and a scatter of flung satellite droplets. All the randomness is
  // baked in here so the shape is stable while it grows and dries.
  const BLOOM_MS = 7000;
  function click(x, y){
    const maxR = 32 + Math.random() * 20;
    blooms.push({
      x, y,
      t: performance.now(),
      maxR,
      seed: Math.random() * 1000,
      lobes: Array.from({ length: 6 + ((Math.random() * 4) | 0) }, () => ({
        a: Math.random() * Math.PI * 2,
        d: 0.85 + Math.random() * 0.5,      // × r from the centre
        s: 0.16 + Math.random() * 0.2,      // × r
        seed: Math.random() * 1000
      })),
      sats: Array.from({ length: 5 + ((Math.random() * 5) | 0) }, () => ({
        a: Math.random() * Math.PI * 2,
        d: 1.7 + Math.random() * 1.6,       // × maxR
        s: 0.05 + Math.random() * 0.1,
        seed: Math.random() * 1000,
        delay: Math.random() * 90
      }))
    });
    if(blooms.length > 12) blooms.shift();
  }

  function inkBlobPath(x, y, r, seed, wobA, wobB){
    bgCtx.beginPath();
    const steps = 22;
    for(let k = 0; k <= steps; k++){
      const ang = (k / steps) * Math.PI * 2;
      const wob = 1 + wobA * Math.sin(ang * 3 + seed) + wobB * Math.cos(ang * 5 - seed);
      const px = x + Math.cos(ang) * r * wob;
      const py = y + Math.sin(ang) * r * wob;
      k === 0 ? bgCtx.moveTo(px, py) : bgCtx.lineTo(px, py);
    }
    bgCtx.closePath();
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

    /* --- cursor ink trail: a continuous stroke with droplets sitting on it --- */
    if(mouse.x >= 0){
      const last = trail[trail.length - 1];
      if(!last || Math.hypot(mouse.x - last.x, mouse.y - last.y) >= TRAIL_STEP){
        trail.push({ x: mouse.x, y: mouse.y, t });
        if(trail.length > MAX_TRAIL) trail.shift();
      }
      if(t - lastDrop > DROP_MS){
        lastDrop = t;
        blots.push(makeBlot(mouse.x + (Math.random() - 0.5) * 6,
                            mouse.y + (Math.random() - 0.5) * 6, false));
        if(blots.length > 200) blots.shift();
      }
    }
    while(trail.length && t - trail[0].t > TRAIL_MS) trail.shift();

    // draw the trail in short chunks so each can carry its own age/alpha
    bgCtx.lineCap = 'round';
    bgCtx.lineJoin = 'round';
    const CHUNK = 10;
    for(let start = 0; start < trail.length - 1; start += CHUNK){
      const end = Math.min(trail.length - 1, start + CHUNK);
      const age = (t - trail[(start + end) >> 1].t) / TRAIL_MS;
      const alpha = Math.max(0, 1 - age) * 0.4;
      if(alpha <= 0.01) continue;
      bgCtx.strokeStyle = `rgba(48,34,22,${alpha.toFixed(3)})`;
      bgCtx.lineWidth = 3.4 * (1 - age * 0.6) + 0.6;
      bgCtx.beginPath();
      bgCtx.moveTo(trail[start].x, trail[start].y);
      for(let i = start + 1; i <= end; i++) bgCtx.lineTo(trail[i].x, trail[i].y);
      bgCtx.stroke();
    }

    /* --- blots (ambient stains + trail droplets) --- */
    for(let i = blots.length - 1; i >= 0; i--){
      const b = blots[i];
      b.age += dt;
      if(b.age > b.life){ blots.splice(i, 1); continue; }
      const growth = Math.min(1, b.age / b.grow);
      const r = b.r * (0.3 + 0.7 * growth);
      const fade = b.age > b.life * 0.6 ? 1 - (b.age - b.life * 0.6) / (b.life * 0.4) : 1;
      const alpha = b.max * fade * (0.55 + 0.45 * growth);
      inkBlobPath(b.x, b.y, r, b.seed, 0.12, 0.06);
      const dried = b.age > b.grow * 1.6;
      bgCtx.fillStyle = dried
        ? `rgba(96,72,50,${(alpha * 0.3).toFixed(3)})`
        : `rgba(40,28,18,${alpha.toFixed(3)})`;
      bgCtx.fill();
    }

    /* --- click blooms --- */
    for(let i = blooms.length - 1; i >= 0; i--){
      const b = blooms[i];
      const age = Math.max(0, (t - b.t) / BLOOM_MS);
      if(age >= 1){ blooms.splice(i, 1); continue; }

      // swells fast on impact, then creeps outward much more slowly
      const grow = 1 - Math.pow(1 - Math.min(1, age * 5), 3);
      const r = b.maxR * (0.28 + 0.72 * grow);
      const wet = Math.max(0, 1 - age * 2.4);
      const fade = age > 0.6 ? 1 - (age - 0.6) / 0.4 : 1;
      // wet ink is near-black; as it dries it lightens to a sepia stain
      const ink = a => `rgba(${(26 + 68 * (1 - wet)) | 0},${(17 + 54 * (1 - wet)) | 0},${(10 + 40 * (1 - wet)) | 0},${a.toFixed(3)})`;

      // soft halo bleeding past the edge, drawn as a few widening ghosts
      for(let h = 3; h >= 1; h--){
        inkBlobPath(b.x, b.y, r * (1 + h * 0.17), b.seed + h * 13, 0.14, 0.07);
        bgCtx.fillStyle = ink(0.055 * fade);
        bgCtx.fill();
      }

      // irregular lobes creeping off the rim
      for(const l of b.lobes){
        inkBlobPath(b.x + Math.cos(l.a) * r * l.d,
                    b.y + Math.sin(l.a) * r * l.d,
                    Math.max(2, r * l.s * (0.45 + 0.55 * grow)), l.seed, 0.17, 0.08);
        bgCtx.fillStyle = ink(0.4 * fade);
        bgCtx.fill();
      }

      // the main stain
      inkBlobPath(b.x, b.y, r, b.seed, 0.13, 0.07);
      bgCtx.fillStyle = ink((0.44 + 0.34 * wet) * fade);
      bgCtx.fill();

      // droplets flung clear of the impact — keep the wobble low, a few px of
      // radius with a strong wobble makes the polygon self-intersect and the
      // droplet comes out an angular splinter instead of a blob
      for(const s of b.sats){
        if(t - b.t < s.delay) continue;
        inkBlobPath(b.x + Math.cos(s.a) * b.maxR * s.d,
                    b.y + Math.sin(s.a) * b.maxR * s.d,
                    Math.max(1.8, b.maxR * s.s), s.seed, 0.11, 0.05);
        bgCtx.fillStyle = ink(0.36 * fade);
        bgCtx.fill();
      }
    }

    if(blots.length < 11 && Math.random() < 0.003) blots.push(makeBlot(null, null, true));
  }

  return { init, resize: init, frame, click };
});

/* ---- nether: embers rising off a lava glow; clicking throws a fireball ---- */
Backgrounds.nether = () => makeBg(() => {
  const BURST_MS = 700;
  let embers = [], bursts = [];

  function makeEmber(atBottom){
    return {
      x: Math.random() * bgW,
      y: atBottom ? bgH + Math.random() * 80 : Math.random() * bgH,
      vy: -(16 + Math.random() * 52),          // px/s, rising
      vx: (Math.random() - 0.5) * 16,
      s: Math.random() < 0.75 ? 2 : 3,
      phase: Math.random() * Math.PI * 2,
      wob: 0.5 + Math.random() * 1.6,
      soul: Math.random() < 0.1,               // rare soul-fire fleck
      heat: 0
    };
  }

  function init(){
    const n = Math.min(210, Math.floor(bgW * bgH / 9000));
    embers = Array.from({ length: n }, () => makeEmber(false));
    bursts = [];
  }

  function click(x, y){
    bursts.push({ x, y, t: performance.now() });
    if(bursts.length > 4) bursts.shift();
    for(let i = 0; i < 26; i++){
      const e = makeEmber(false);
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 200;
      e.x = x; e.y = y;
      e.vx = Math.cos(a) * sp;
      e.vy = Math.sin(a) * sp - 40;
      e.heat = 1;
      embers.push(e);
    }
    if(embers.length > 320) embers.splice(0, embers.length - 320);
  }

  function frame(dt, t){
    const sec = dt / 1000;

    const sky = bgCtx.createLinearGradient(0, 0, 0, bgH);
    sky.addColorStop(0, '#140404');
    sky.addColorStop(0.62, '#280907');
    sky.addColorStop(1, '#4d1206');
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, bgW, bgH);

    // lava glow pooling along the bottom edge
    const glow = bgCtx.createLinearGradient(0, bgH * 0.72, 0, bgH);
    glow.addColorStop(0, 'rgba(255,80,10,0)');
    glow.addColorStop(1, 'rgba(255,120,26,0.34)');
    bgCtx.fillStyle = glow;
    bgCtx.fillRect(0, bgH * 0.72, bgW, bgH * 0.28);

    for(let i = bursts.length - 1; i >= 0; i--){
      if(t - bursts[i].t > BURST_MS) bursts.splice(i, 1);
    }

    for(let i = embers.length - 1; i >= 0; i--){
      const e = embers[i];
      e.phase += e.wob * sec * 2.4;
      e.x += (e.vx + Math.sin(e.phase) * 16) * sec;
      e.y += e.vy * sec;
      e.vy += 22 * sec;              // buoyancy easing off as it cools

      // the cursor is hot: nearby embers scatter and flare
      const d = Math.hypot(e.x - mouse.x, e.y - mouse.y);
      if(d < 150 && d > 0.001){
        const f = (1 - d / 150);
        e.x += ((e.x - mouse.x) / d) * f * 2.2;
        e.y += ((e.y - mouse.y) / d) * f * 2.2;
        e.heat = Math.max(e.heat, f);
      }
      e.heat *= 0.94;

      if(e.y < -20 || e.x < -30 || e.x > bgW + 30){
        embers[i] = makeEmber(true);
        continue;
      }

      const depth = Math.min(1, e.y / bgH);           // hotter nearer the lava
      const a = (0.28 + 0.52 * depth + e.heat * 0.5);
      if(e.soul){
        bgCtx.fillStyle = 'rgba(' + (90 + 90 * e.heat | 0) + ',' + (200 + 40 * e.heat | 0) + ',255,' + Math.min(1, a).toFixed(3) + ')';
      } else {
        const g = 90 + 110 * depth + 55 * e.heat;
        bgCtx.fillStyle = 'rgba(255,' + (g | 0) + ',' + (30 + 60 * e.heat | 0) + ',' + Math.min(1, a).toFixed(3) + ')';
      }
      const size = e.s + (e.heat > 0.5 ? 1 : 0);
      bgCtx.fillRect(e.x, e.y, size, size);
    }

    // fireball shockwaves
    for(const b of bursts){
      const age = Math.max(0, (t - b.t) / BURST_MS);
      const r = Math.max(0, age * 260);
      bgCtx.strokeStyle = 'rgba(255,' + (140 + 80 * (1 - age) | 0) + ',60,' + (0.5 * (1 - age)).toFixed(3) + ')';
      bgCtx.lineWidth = 3 * (1 - age) + 0.5;
      bgCtx.beginPath();
      bgCtx.arc(b.x, b.y, r, 0, Math.PI * 2);
      bgCtx.stroke();
    }
  }

  return { init, resize: init, frame, click };
});

/* ===================== TOAST + EASTER EGGS ===================== */
const toastEl = document.getElementById('toast');
const toastText = document.getElementById('toast-text');
const toastIcon = document.getElementById('toast-icon');
let toastTimer = null;

function showToast(html, icon, ms){
  if(!toastEl) return;
  toastText.innerHTML = html;
  toastIcon.textContent = icon || '\u2726';
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 4600);
}

/* ---- Konami code unlocks the hidden Nether style ---- */
const NETHER_KEY = 'ah-nether';
const netherOption = document.getElementById('theme-nether');

function netherUnlocked(){
  try { return localStorage.getItem(NETHER_KEY) === '1'; } catch(e){ return false; }
}
function revealNether(){
  if(netherOption) netherOption.hidden = false;
}
function unlockNether(){
  const already = netherUnlocked();
  try { localStorage.setItem(NETHER_KEY, '1'); } catch(e){}
  revealNether();
  applyTheme('nether');
  closeThemeMenu();
  showToast(already
    ? '<b>Nether.</b> Welcome back to the other side.'
    : '<b>Nether unlocked.</b> A fifth style just appeared in the theme menu.',
    '\uD83D\uDD25', 5200);
}

const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
let konamiPos = 0;
document.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  if(k === KONAMI[konamiPos]){
    konamiPos++;
    if(konamiPos === KONAMI.length){ konamiPos = 0; unlockNether(); }
  } else {
    konamiPos = (k === KONAMI[0]) ? 1 : 0;
  }
});

/* ---- seven quick taps on the avatar and he swings for it ---- */
const avatarEl = document.querySelector('.avatar');
if(avatarEl){
  let taps = 0, tapTimer = null;
  avatarEl.style.cursor = 'pointer';
  avatarEl.addEventListener('click', () => {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1400);
    if(taps >= 7){
      taps = 0;
      showToast('<b>Alright, alright.</b> That is the secret handshake.', '\uD83E\uDD1C');
      let n = 0;
      const combo = setInterval(() => {
        triggerPunch();
        if(++n >= 5) clearInterval(combo);
      }, 400);
    }
  });
}

/* ===================== INIT THEME ===================== */
let savedTheme = 'constellation';
try { savedTheme = localStorage.getItem('ah-theme') || 'constellation'; } catch(e){}
if(netherUnlocked() || savedTheme === 'nether') revealNether();
applyTheme(savedTheme);
