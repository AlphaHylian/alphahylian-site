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
const THEMES = ['constellation', 'terminal', 'minecraft', 'paper'];
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

/* ---- paper: a pen stroke that traces the cursor across the whole panel ---- */
QuoteEffects.paper = () => {
  const STROKE_MS = 2400;  // how long the ink takes to dry away
  const MIN_STEP = 3;      // px between recorded points
  const MAX_PTS = 420;
  const CHUNK = 14;        // segments per stroked path — batching keeps it cheap
  let pts = [];
  let raf = 0, running = true;

  function onRender(){ refreshQuoteCache(); pts = []; }
  function onMove(e){
    const x = e.clientX - qfxRect.left;
    const y = e.clientY - qfxRect.top;
    const last = pts[pts.length - 1];
    if(last && Math.hypot(x - last.x, y - last.y) < MIN_STEP) return;
    pts.push({ x, y, t: performance.now(), brk: false });
    if(pts.length > MAX_PTS) pts.shift();
  }
  // Pen lifts when the cursor leaves the panel — don't join across the gap.
  function onLeave(){ if(pts.length) pts[pts.length - 1].brk = true; }

  function loop(){
    if(!running) return;
    const now = performance.now();
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
    stop(){ running = false; cancelAnimationFrame(raf); qfxCtx.clearRect(0, 0, qfxCanvas.width, qfxCanvas.height); }
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

/* ---- punch on click ----
   IdleAnimation drives the arms every frame, so it's swapped out for the
   duration of the swing and restored when the arm is back at rest. */
const PUNCH_MS = 340;
const PUNCH_REACH = 1.75;   // radians the right arm swings forward
let punchStart = -1;
let savedAnimation = null;

function triggerPunch(){
  if(!viewer || !viewer.playerObject || punchStart >= 0) return;
  savedAnimation = viewer.animation;
  viewer.animation = null;
  punchStart = performance.now();
}
window.addEventListener('mousedown', triggerPunch);
window.addEventListener('touchstart', triggerPunch, { passive: true });

function updatePunch(){
  if(punchStart < 0) return;
  const skin = viewer.playerObject && viewer.playerObject.skin;
  const arm = skin && skin.rightArm;
  if(!arm){ punchStart = -1; viewer.animation = savedAnimation; return; }
  const p = Math.min(1, (performance.now() - punchStart) / PUNCH_MS);
  const swing = p < 0.34 ? p / 0.34 : 1 - (p - 0.34) / 0.66;
  const ease = swing * swing * (3 - 2 * swing);   // smoothstep
  arm.rotation.x = -PUNCH_REACH * ease;
  arm.rotation.z = 0.1 * ease;
  if(p >= 1){
    arm.rotation.x = 0;
    arm.rotation.z = 0;
    viewer.animation = savedAnimation;
    punchStart = -1;
  }
}

function overflowPast(value, limit){
  if(value > limit) return value - limit;
  if(value < -limit) return value + limit;
  return 0;
}

function updateHeadLook(){
  if(!viewer) return;
  updatePunch();

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

  // Click sends out a shockwave that shoves stars aside and flares them up.
  const WAVE_MS = 900;
  const WAVE_SPEED = 620;     // px/s
  function click(x, y){
    waves.push({ x, y, t: performance.now() });
    if(waves.length > 5) waves.shift();
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
      if(p.x < 0 || p.x > bgW) p.vx *= -1;
      if(p.y < 0 || p.y > bgH) p.vy *= -1;

      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if(dist < 170 && dist > 0.001){
        const force = (170 - dist) / 170;
        p.x += (dx / dist) * force * 5.5;
        p.y += (dy / dist) * force * 5.5;
      }

      for(const w of waves){
        const age = (t - w.t) / WAVE_MS;
        const ring = age * WAVE_SPEED;
        const wx = p.x - w.x, wy = p.y - w.y;
        const d = Math.hypot(wx, wy);
        const band = Math.abs(d - ring);
        if(band < 70 && d > 0.001){
          const push = (1 - band / 70) * (1 - age) * 7;
          p.x += (wx / d) * push;
          p.y += (wy / d) * push;
          p.flare = Math.max(p.flare, (1 - band / 70) * (1 - age));
        }
      }
      p.flare *= 0.94;
      p._e = envelope(p);
    }

    for(const p of bright){
      const a = 0.78 * p._e + p.flare * 0.9;
      bgCtx.fillStyle = `rgba(${(150 + p.flare * 105) | 0},${(120 + p.flare * 110) | 0},255,${Math.min(1, a).toFixed(3)})`;
      const s = p.size + (p.flare > 0.4 ? 1 : 0);
      bgCtx.fillRect(p.x, p.y, s, s);
    }

    // faint expanding ring so the shockwave reads even in sparse areas
    for(const w of waves){
      const age = (t - w.t) / WAVE_MS;
      bgCtx.strokeStyle = `rgba(168,136,255,${(0.35 * (1 - age)).toFixed(3)})`;
      bgCtx.lineWidth = 2 * (1 - age) + 0.5;
      bgCtx.beginPath();
      bgCtx.arc(w.x, w.y, age * WAVE_SPEED, 0, Math.PI * 2);
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

/* ---- terminal: dim falling 1s and 0s; clicking sends a bright ring ---- */
Backgrounds.terminal = () => makeBg(() => {
  const FONT = 14, COL = 14, ROW = 16;
  const BASE_ALPHA = 0.03;    // dim, and deliberately unaffected by the cursor
  const PULSE_MS = 1500;
  const PULSE_SPEED = 720;    // px/s
  const PULSE_BAND = 60;
  let cols = 0, rows = 0, totalH = 0, offs = [], speed = [], glyphs = [];
  let pulses = [];

  function init(){
    cols = Math.ceil(bgW / COL) + 1;
    rows = Math.ceil(bgH / ROW) + 3;
    totalH = rows * ROW;
    offs = Array.from({ length: cols }, () => Math.random() * totalH);
    speed = Array.from({ length: cols }, () => 6 + Math.random() * 16);   // px/s — slow
    // Sparse: most cells are empty, so the rain stays faint and cheap to draw.
    glyphs = Array.from({ length: cols }, () =>
      Array.from({ length: rows }, () => (Math.random() < 0.3 ? (Math.random() < 0.5 ? '0' : '1') : null)));
    pulses = [];
  }

  function click(x, y){
    pulses.push({ x, y, t: performance.now() });
    if(pulses.length > 4) pulses.shift();
  }

  function frame(dt, t){
    bgCtx.fillStyle = 'rgba(4,16,10,0.45)';   // trailing fade
    bgCtx.fillRect(0, 0, bgW, bgH);
    bgCtx.font = `${FONT}px 'JetBrains Mono', ui-monospace, Menlo, monospace`;
    bgCtx.textBaseline = 'top';

    for(let i = pulses.length - 1; i >= 0; i--){
      if(t - pulses[i].t > PULSE_MS) pulses.splice(i, 1);
    }

    for(let c = 0; c < cols; c++){
      offs[c] = (offs[c] + speed[c] * dt / 1000) % totalH;
      const x = c * COL;
      for(let r = 0; r < rows; r++){
        const g = glyphs[c][r];
        if(g === null) continue;
        const y = (r * ROW + offs[c]) % totalH - ROW;
        let a = BASE_ALPHA;
        for(const p of pulses){
          const age = (t - p.t) / PULSE_MS;
          const ring = age * PULSE_SPEED;
          const band = Math.abs(Math.hypot(x - p.x, y - p.y) - ring);
          if(band < PULSE_BAND) a += (1 - band / PULSE_BAND) * (1 - age) * 0.9;
        }
        bgCtx.fillStyle = `rgba(53,255,133,${Math.min(1, a).toFixed(3)})`;
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
        const dirt = Math.random() < 0.15;
        const base = dirt ? [124, 94, 62] : [124, 122, 120];
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

/* ---- paper: ink blots that bloom then dry, a droplet trail off the cursor,
       and a splatter on click ---- */
Backgrounds.paper = () => makeBg(() => {
  const DROP_MS = 70;         // how often the cursor sheds a droplet
  let blots = [];
  let lastDrop = 0;

  function makeBlot(x, y, kind){
    // kind: 'big' (ambient stain) | 'drop' (cursor trail) | 'splat' (click)
    const big = kind === 'big';
    const splat = kind === 'splat';
    return {
      x: x == null ? Math.random() * bgW : x,
      y: y == null ? Math.random() * bgH : y,
      r: big ? 10 + Math.random() * 22 : splat ? 5 + Math.random() * 14 : 2 + Math.random() * 4,
      age: 0,
      grow: big ? 1400 + Math.random() * 1600 : splat ? 380 : 320,
      life: big ? 9000 + Math.random() * 8000 : splat ? 4200 : 1900,
      seed: Math.random() * 1000,
      max: big ? 0.5 : splat ? 0.55 : 0.3
    };
  }

  function init(){
    blots = Array.from({ length: 7 }, () => {
      const b = makeBlot(null, null, 'big');
      b.age = Math.random() * b.life;
      return b;
    });
    lastDrop = 0;
  }

  function click(x, y){
    blots.push(makeBlot(x, y, 'splat'));
    const n = 9 + ((Math.random() * 6) | 0);
    for(let i = 0; i < n; i++){
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 76;
      blots.push(makeBlot(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, 'splat'));
    }
    if(blots.length > 160) blots.splice(0, blots.length - 160);
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

    // frequent small droplets so the cursor leaves a subtle trail
    if(mouse.x >= 0 && t - lastDrop > DROP_MS){
      lastDrop = t;
      blots.push(makeBlot(mouse.x + (Math.random() - 0.5) * 7,
                          mouse.y + (Math.random() - 0.5) * 7, 'drop'));
      if(blots.length > 200) blots.shift();
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

    if(blots.length < 11 && Math.random() < 0.003) blots.push(makeBlot(null, null, 'big'));
  }

  return { init, resize: init, frame, click };
});

/* ===================== INIT THEME ===================== */
let savedTheme = 'constellation';
try { savedTheme = localStorage.getItem('ah-theme') || 'constellation'; } catch(e){}
applyTheme(savedTheme);
