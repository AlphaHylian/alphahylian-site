/* =====================================================================
   STRIP MINE
   An endless downward mine. The world is generated from a hash of the
   cell coordinates, so it never has to be stored — only which cells have
   been broken and how damaged the rest are.
   ===================================================================== */

// Fixed for the session: the world is generated from the column index, so
// changing this mid-game (on an orientation flip) would reshuffle the terrain.
// Phones get a narrower shaft so the blocks stay thumb-sized.
const COLS = window.innerWidth < 760 ? 10 : 16;
const MINE_INTERVAL = 120;      // ms between swings while holding
const CRACK_STAGES = 4;

const BLOCKS = {
  dirt:      { base: [122, 90, 56],  hard: 1, value: 0,  label: 'Dirt' },
  stone:     { base: [124, 122, 120], hard: 2, value: 0,  label: 'Stone' },
  deepslate: { base: [74, 74, 82],   hard: 3, value: 0,  label: 'Deepslate' },
  coal:      { base: [124, 122, 120], ore: [46, 46, 50],  hard: 2, value: 2,  label: 'Coal' },
  iron:      { base: [124, 122, 120], ore: [216, 180, 140], hard: 3, value: 6,  label: 'Iron' },
  redstone:  { base: [124, 122, 120], ore: [224, 58, 58],  hard: 3, value: 9,  label: 'Redstone' },
  gold:      { base: [110, 108, 106], ore: [242, 210, 74], hard: 3, value: 16, label: 'Gold' },
  diamond:   { base: [74, 74, 82],   ore: [94, 232, 224], hard: 4, value: 45, label: 'Diamond' },
  obsidian:  { base: [36, 31, 51],   hard: 9, value: 30, label: 'Obsidian' }
};
const ORE_ORDER = ['coal', 'iron', 'redstone', 'gold', 'diamond', 'obsidian'];

const PICKS = [
  { name: 'Wooden',    power: 1, cost: 0 },
  { name: 'Stone',     power: 2, cost: 45 },
  { name: 'Iron',      power: 3, cost: 160 },
  { name: 'Diamond',   power: 5, cost: 480 },
  { name: 'Netherite', power: 8, cost: 1300 }
];

const stage = document.getElementById('mn-stage');
const canvas = document.getElementById('mn-canvas');
const ctx = canvas.getContext('2d');
const bagEl = document.getElementById('mn-bag');
const el = {
  depth: document.getElementById('mn-depth'),
  value: document.getElementById('mn-value'),
  pick: document.getElementById('mn-pick'),
  best: document.getElementById('mn-best'),
  upgrade: document.getElementById('mn-upgrade'),
  reset: document.getElementById('mn-reset')
};

let W = 0, H = 0, cell = 44;
let camY = 0, camTarget = 0;
let seed = (Math.random() * 1e9) | 0;
let mined = new Set();          // "c,r"
let damage = new Map();         // "c,r" -> hits taken
let bag = {}, value = 0, pickIndex = 0, deepest = 0;
let particles = [];
let holdKey = null, holdTimer = null;
let raf = 0;

/* ---------- deterministic world ---------- */
function hash(c, r){
  let h = (c * 374761393) ^ (r * 668265263) ^ (seed * 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function blockAt(c, r){
  if(r < 0) return null;                       // open sky
  const n = hash(c, r);
  if(r < 3) return 'dirt';
  if(r < 6 && n < 0.35) return 'dirt';

  // Each ore owns a DISJOINT slice of n that widens with depth. Cumulative
  // "n < threshold" tests would let the deeper ores eat the shallower ones'
  // range, and gold in particular would all but vanish deep down.
  let lo = 0;
  const band = p => {
    const hi = lo + p;
    const inside = n >= lo && n < hi;
    lo = hi;
    return inside;
  };
  const byDepth = (from, max, rate) => (r <= from ? 0 : Math.min(max, (r - from) * rate));

  if(band(byDepth(60, 0.022, 0.00040))) return 'obsidian';
  if(band(byDepth(38, 0.030, 0.00060))) return 'diamond';
  if(band(byDepth(26, 0.048, 0.00130))) return 'gold';
  if(band(byDepth(18, 0.072, 0.00190))) return 'redstone';
  if(band(byDepth(8,  0.105, 0.00320))) return 'iron';
  if(band(0.130)) return 'coal';

  if(r > 30 && hash(c + 7777, r - 313) < Math.min(0.92, (r - 30) * 0.03)) return 'deepslate';
  return 'stone';
}

function key(c, r){ return c + ',' + r; }
function isMined(c, r){ return r < 0 || mined.has(key(c, r)); }

// You can only break a block that touches air — so you have to tunnel.
function exposed(c, r){
  return isMined(c, r - 1) || isMined(c, r + 1) ||
         isMined(c - 1, r) || isMined(c + 1, r);
}

function hitsFor(type){
  const b = BLOCKS[type];
  return Math.max(1, Math.ceil(b.hard * 2.2 / PICKS[pickIndex].power));
}

/* ---------- sizing ---------- */
function fit(){
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = W / COLS;
}
window.addEventListener('resize', fit);

/* ---------- mining ---------- */
function cellAt(px, py){
  const c = Math.floor(px / cell);
  const r = Math.floor((py + camY) / cell);
  if(c < 0 || c >= COLS || r < 0) return null;
  return { c, r };
}

function swing(c, r){
  if(isMined(c, r) || !exposed(c, r)) return;
  const type = blockAt(c, r);
  if(!type) return;
  const k = key(c, r);
  const need = hitsFor(type);
  const d = (damage.get(k) || 0) + 1;

  if(d >= need){
    damage.delete(k);
    mined.add(k);
    const b = BLOCKS[type];
    if(b.value > 0){
      bag[type] = (bag[type] || 0) + 1;
      value += b.value;
    }
    burst(c, r, b);
    deepest = Math.max(deepest, r);
    saveBest();
    syncHud();
  } else {
    damage.set(k, d);
    const b = BLOCKS[type];
    for(let i = 0; i < 3; i++) particles.push(makeParticle(c, r, b));
  }
}

function makeParticle(c, r, b){
  const col = b.ore || b.base;
  return {
    x: c * cell + cell * (0.2 + Math.random() * 0.6),
    y: r * cell + cell * (0.2 + Math.random() * 0.6),
    vx: (Math.random() - 0.5) * 90,
    vy: -Math.random() * 110,
    s: Math.max(2, cell * 0.07),
    life: 1,
    col: 'rgb(' + col.map(v => Math.min(255, v + 20) | 0).join(',') + ')'
  };
}
function burst(c, r, b){
  for(let i = 0; i < 14; i++) particles.push(makeParticle(c, r, b));
}

stage.addEventListener('pointerdown', e => {
  e.preventDefault();
  // capture keeps the drag alive outside the stage, but it throws if the
  // pointer id isn't active — never let that kill the swing below
  try { stage.setPointerCapture(e.pointerId); } catch(err){}
  const rect = stage.getBoundingClientRect();
  const hit = cellAt(e.clientX - rect.left, e.clientY - rect.top);
  if(!hit) return;
  holdKey = hit;
  swing(hit.c, hit.r);
  clearInterval(holdTimer);
  holdTimer = setInterval(() => {
    if(holdKey) swing(holdKey.c, holdKey.r);
  }, MINE_INTERVAL);
});
stage.addEventListener('pointermove', e => {
  if(!holdKey) return;
  const rect = stage.getBoundingClientRect();
  const hit = cellAt(e.clientX - rect.left, e.clientY - rect.top);
  if(hit) holdKey = hit;
});
function release(){ holdKey = null; clearInterval(holdTimer); }
stage.addEventListener('pointerup', release);
stage.addEventListener('pointerleave', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- drawing ---------- */
function shade(rgb, k){
  return 'rgb(' + rgb.map(v => Math.max(0, Math.min(255, v * k)) | 0).join(',') + ')';
}

// Mined cells still show the rock behind them, heavily darkened — otherwise a
// dug-out tunnel is just a flat black hole.
function drawBackWall(c, r, type){
  const x = c * cell;
  const y = r * cell - camY;
  const b = BLOCKS[type];
  const px = cell / 8;
  ctx.fillStyle = shade(b.base, 0.34);
  ctx.fillRect(x, y, cell, cell);
  for(let i = 0; i < 8; i++){
    const n = hash(c * 31 + i, r * 17 - i);
    const n2 = hash(c * 13 - i, r * 29 + i);
    ctx.fillStyle = shade(b.base, 0.26 + n * 0.16);
    ctx.fillRect(x + Math.floor(n * 8) * px, y + Math.floor(n2 * 8) * px, px, px);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x, y, cell, px * 0.75);
}

function drawBlock(c, r, type){
  const x = c * cell;
  const y = r * cell - camY;
  const b = BLOCKS[type];
  const px = cell / 8;

  ctx.fillStyle = shade(b.base, 1);
  ctx.fillRect(x, y, cell, cell);

  // deterministic pixel noise so each block has texture but never flickers
  for(let i = 0; i < 12; i++){
    const n = hash(c * 31 + i, r * 17 - i);
    const n2 = hash(c * 13 - i, r * 29 + i);
    ctx.fillStyle = shade(b.base, 0.78 + n * 0.42);
    ctx.fillRect(x + Math.floor(n * 8) * px, y + Math.floor(n2 * 8) * px, px, px);
  }

  if(b.ore){
    for(let i = 0; i < 6; i++){
      const n = hash(c * 91 + i * 5, r * 57 + i);
      const n2 = hash(c * 47 - i, r * 83 + i * 3);
      if(n < 0.42) continue;
      ctx.fillStyle = shade(b.ore, 0.85 + n2 * 0.35);
      ctx.fillRect(x + Math.floor(n2 * 6 + 1) * px, y + Math.floor(n * 6 + 1) * px, px * 1.6, px * 1.6);
    }
  }

  // edges
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x, y + cell - px * 0.5, cell, px * 0.5);
  ctx.fillRect(x + cell - px * 0.5, y, px * 0.5, cell);
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.fillRect(x, y, cell, px * 0.4);

  // crack overlay
  const d = damage.get(key(c, r));
  if(d){
    const stageIdx = Math.min(CRACK_STAGES, Math.ceil(d / hitsFor(type) * CRACK_STAGES));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, cell * 0.035);
    for(let i = 0; i < stageIdx * 2; i++){
      const a = hash(c * 5 + i, r * 11 - i) * Math.PI * 2;
      const len = cell * (0.18 + hash(c + i, r - i) * 0.3);
      const cx = x + cell / 2, cy = y + cell / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
  }
}

function draw(dt){
  // sky / cave gradient by depth
  const depthK = Math.min(1, camY / (cell * 60));
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, depthK < 1 ? '#0c1018' : '#07070a');
  g.addColorStop(1, '#050506');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const r0 = Math.floor(camY / cell) - 1;
  const r1 = Math.ceil((camY + H) / cell) + 1;

  for(let r = Math.max(0, r0); r <= r1; r++){
    for(let c = 0; c < COLS; c++){
      const type = blockAt(c, r);
      if(!type) continue;
      if(isMined(c, r)) drawBackWall(c, r, type);
      else drawBlock(c, r, type);
    }
  }

  // torch-ish vignette centred on the dug shaft
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.15, W / 2, H * 0.45, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  for(let i = particles.length - 1; i >= 0; i--){
    const p = particles[i];
    p.vy += 520 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 1.5;
    if(p.life <= 0){ particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x, p.y - camY, p.s, p.s);
    ctx.globalAlpha = 1;
  }

  // depth ruler down the left edge
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.font = '600 10px ui-monospace, monospace';
  for(let r = Math.max(0, r0); r <= r1; r++){
    if(r % 10) continue;
    ctx.fillRect(0, r * cell - camY, 6, 1);
    ctx.fillText(r + 'm', 9, r * cell - camY + 9);
  }
}

/* ---------- loop ---------- */
let last = 0;
function loop(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // follow the deepest point you've opened up
  camTarget = Math.max(0, (deepest + 2) * cell - H * 0.62);
  camY += (camTarget - camY) * Math.min(1, dt * 4.5);

  try { draw(dt); }
  catch(err){ console.warn('mine frame failed:', err); }

  raf = requestAnimationFrame(loop);
}

/* ---------- hud ---------- */
function syncHud(){
  el.depth.textContent = deepest;
  el.value.textContent = value;
  el.pick.textContent = PICKS[pickIndex].name;
  el.best.textContent = loadBest();

  const next = PICKS[pickIndex + 1];
  if(!next){
    el.upgrade.textContent = 'Fully upgraded';
    el.upgrade.disabled = true;
  } else {
    el.upgrade.textContent = 'Upgrade to ' + next.name + ' · ' + next.cost;
    el.upgrade.disabled = value < next.cost;
  }

  bagEl.innerHTML = ORE_ORDER.map(o => {
    const b = BLOCKS[o];
    const col = 'rgb(' + (b.ore || b.base).join(',') + ')';
    return '<span class="mn-ore"><span class="sw" style="background:' + col + '"></span>' +
           '<b>' + (bag[o] || 0) + '</b></span>';
  }).join('');
}

el.upgrade.addEventListener('click', () => {
  const next = PICKS[pickIndex + 1];
  if(!next || value < next.cost) return;
  value -= next.cost;
  pickIndex++;
  syncHud();
});

el.reset.addEventListener('click', () => {
  seed = (Math.random() * 1e9) | 0;
  mined = new Set(); damage = new Map();
  bag = {}; value = 0; pickIndex = 0; deepest = 0;
  particles = []; camY = camTarget = 0;
  syncHud();
});

/* ---------- best depth ---------- */
const BEST_KEY = 'ah-mine-best';
function loadBest(){
  try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch(e){ return 0; }
}
function saveBest(){
  try { if(deepest > loadBest()) localStorage.setItem(BEST_KEY, String(deepest)); } catch(e){}
}

/* ---------- ambient page background ---------- */
(function background(){
  const bg = document.getElementById('bg-canvas');
  const bx = bg.getContext('2d');
  let w, h, dots = [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#8a6cf2').trim();
  function size(){
    w = bg.width = window.innerWidth;
    h = bg.height = window.innerHeight;
    dots = Array.from({ length: Math.min(110, Math.floor(w * h / 18000)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1,
      s: Math.random() < 0.8 ? 1 : 2
    }));
  }
  size();
  window.addEventListener('resize', size);
  function tick(){
    bx.clearRect(0, 0, w, h);
    bx.fillStyle = accent;
    bx.globalAlpha = 0.22;
    for(const d of dots){
      d.x += d.vx; d.y += d.vy;
      if(d.x < 0) d.x += w; else if(d.x > w) d.x -= w;
      if(d.y < 0) d.y += h; else if(d.y > h) d.y -= h;
      bx.fillRect(d.x, d.y, d.s, d.s);
    }
    bx.globalAlpha = 1;
    if(!reduce) requestAnimationFrame(tick);
  }
  tick();
})();

/* ---------- boot ---------- */
fit();
syncHud();
last = performance.now();
raf = requestAnimationFrame(loop);
