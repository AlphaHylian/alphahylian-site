/* ===================== BIO CYCLE ===================== */
const bios = [
  "Professional Inaction Specialist",
  "Input-Based Voxel Simulation Manager",
  "Pre-Revenue Ideation Specialist",
  "Media Consumption Specialist"
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

/* ===================== TABS ===================== */
const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    if(btn.dataset.tab === 'home' && typeof positionSkinCard === 'function') positionSkinCard();
  });
});

/* ===================== QUOTES ===================== */
const quotes = [
  { text: "Live, if only for the purpose of spiting death.", author: "alphahylian" },
  { text: "The clown who stumbles over his own feet is a gymnast and a juggler before he's a fool.", author: "Sean Anetsberger" },
  { text: "What's up with everyone and having friends?", author: "ShoeBilly_" },
  { text: "I'm a failure, but I'm a failure that doesn't fail.", author: "betarito" },
  { text: "You have no concept of your potential. Don't burn hot, burn BRIGHT!", author: "Noah Bennet" },
  { text: "I remember it all. I am the one with infinite wisdom. I am the one who prophesizes. I am the dream catcher.", author: "eggchan" },
  { text: "A jack of all trades is a master of none, but oftentimes better than a master of one.", author: "" },
  { text: "I just accept what's in front of me bru.", author: "eggchan" },
  { text: "I am the flame that refuses to be extinguished.", author: "FlameFrags" }
];

let quoteIndex = 0;
let quoteTimer = null;
const quoteTextEl = document.getElementById('quote-text');
const quoteAuthorEl = document.getElementById('quote-author');
const quoteCard = document.querySelector('.quote-card');
const dotsWrap = document.getElementById('quote-dots');

quotes.forEach((_, i) => {
  const dot = document.createElement('span');
  if(i === 0) dot.classList.add('active');
  dot.addEventListener('click', () => setQuote(i, true));
  dotsWrap.appendChild(dot);
});

function renderQuote(){
  quoteTextEl.textContent = `"${quotes[quoteIndex].text}"`;
  quoteAuthorEl.textContent = quotes[quoteIndex].author ? `— ${quotes[quoteIndex].author}` : '';
  [...dotsWrap.children].forEach((d, i) => d.classList.toggle('active', i === quoteIndex));
}

function setQuote(i, manual){
  quoteCard.classList.add('quote-fade');
  setTimeout(() => {
    quoteIndex = i;
    renderQuote();
    quoteCard.classList.remove('quote-fade');
  }, 260);
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
  photoTop.style.setProperty('--mx', `${x - rect.left}px`);
  photoTop.style.setProperty('--my', `${y - rect.top}px`);
}

aboutPhoto.addEventListener('mousemove', e => setPhotoPos(e.clientX, e.clientY));
aboutPhoto.addEventListener('mouseleave', () => {
  photoTop.style.setProperty('--mx', '-300px');
  photoTop.style.setProperty('--my', '-300px');
});
aboutPhoto.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if(t) setPhotoPos(t.clientX, t.clientY);
}, { passive: true });

/* ===================== GLOBAL CURSOR TRACKING ===================== */
const mouse = { x: -9999, y: -9999 };
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

/* ===================== SKIN VIEWER ===================== */
const skinCanvas = document.getElementById('skin-canvas');
const skinCard = skinCanvas.parentElement;
const quoteCardEl = document.querySelector('.quote-card');

// Position the skin viewer midway between the quote card's right edge and
// the right edge of the screen, vertically centered on the screen.
// (Desktop only — mobile keeps its own static, in-flow layout via CSS.)
function positionSkinCard(){
  if(window.innerWidth <= 760) return;
  const quoteRect = quoteCardEl.getBoundingClientRect();
  const midX = (quoteRect.right + window.innerWidth) / 2;
  skinCard.style.left = `${midX - skinCard.offsetWidth / 2}px`;
}
positionSkinCard();
window.addEventListener('resize', positionSkinCard);
window.addEventListener('load', positionSkinCard);

const viewer = new skinview3d.SkinViewer({
  canvas: skinCanvas,
  width: skinCard.clientWidth,
  height: skinCard.clientHeight,
  fov: 32,
  zoom: 0.82
});

viewer.loadSkin('assets/skin.png', { model: 'slim' });

// Optional: export your Minecraft builder cape as a PNG, drop it in
// assets/cape.png, then uncomment the line below to render it on the model.
// viewer.loadCape('assets/cape.png');

viewer.animation = new skinview3d.IdleAnimation();
viewer.animation.speed = 0.6;
viewer.background = null;

window.addEventListener('resize', () => {
  viewer.width = skinCard.clientWidth;
  viewer.height = skinCard.clientHeight;
});

// Disable the built-in camera-orbit controls entirely — dragging rotates
// the character itself (like the Bedrock skin/inventory preview), not the
// camera, so there's no camera movement and nothing to cause a zoom jump.
viewer.controls.enabled = false;

// ---- Head / body look-at-cursor, Bedrock-inventory style ----
// - Normally the head tracks the cursor directly on both axes.
// - Once the head would need to turn more than ~45°, the body turns instead
//   to bring the cursor back within the head's range.
// - Dragging the model rotates it directly (both axes) and suspends all
//   cursor-tracking; on release it eases back to neutral, then tracking resumes.
const HEAD_LIMIT = Math.PI / 4;  // 45 degrees, both axes
const HEAD_SPEED = 0.35;         // very responsive, just a touch of smoothing
const BODY_TURN_SPEED = 0.16;    // body catching up to an extreme cursor
const BODY_RESET_SPEED = 0.15;   // easing back to center after a drag
const SETTLE_EPSILON = 0.015;
const DRAG_SENSITIVITY = 0.008;
const PITCH_DRAG_LIMIT = 1.2;

let bodyYaw = 0, bodyPitch = 0;
let headYaw = 0, headPitch = 0;
let lookMode = 'tracking'; // 'tracking' | 'turning' | 'dragging' | 'resetting'
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

function updateHeadLook(){
  const wrapper = viewer.playerWrapper;
  const head = viewer.playerObject && viewer.playerObject.skin.head;

  if(head && wrapper){
    if(lookMode === 'dragging'){
      // Model rotates directly with the drag; head stays neutral; no tracking.
      headYaw += (0 - headYaw) * HEAD_SPEED;
      headPitch += (0 - headPitch) * HEAD_SPEED;
    } else if(lookMode === 'resetting'){
      // Ease back to facing forward, then resume cursor-tracking.
      bodyYaw += (0 - bodyYaw) * BODY_RESET_SPEED;
      bodyPitch += (0 - bodyPitch) * BODY_RESET_SPEED;
      headYaw += (0 - headYaw) * HEAD_SPEED;
      headPitch += (0 - headPitch) * HEAD_SPEED;
      if(Math.abs(bodyYaw) < SETTLE_EPSILON && Math.abs(bodyPitch) < SETTLE_EPSILON){
        bodyYaw = 0; bodyPitch = 0;
        lookMode = 'tracking';
      }
    } else {
      // 'tracking' or 'turning' — both driven by cursor position.
      const rect = skinCanvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.32;
      const dx = (mouse.x - cx) / (rect.width / 2 || 1);
      const dy = (mouse.y - cy) / (rect.height / 2 || 1);

      const desiredYaw = Math.max(-1.6, Math.min(1.6, dx)) * 0.95;
      const desiredPitch = Math.max(-1.2, Math.min(1.2, dy)) * 0.85;

      const residualYaw = desiredYaw - bodyYaw;
      const residualPitch = desiredPitch - bodyPitch;

      if(lookMode === 'tracking' && (Math.abs(residualYaw) > HEAD_LIMIT || Math.abs(residualPitch) > HEAD_LIMIT)){
        lookMode = 'turning';
      } else if(lookMode === 'turning' && Math.abs(residualYaw) < HEAD_LIMIT * 0.9 && Math.abs(residualPitch) < HEAD_LIMIT * 0.9){
        lookMode = 'tracking';
      }

      if(lookMode === 'turning'){
        // Head goes neutral while the body turns enough to bring the
        // cursor back within the head's own range.
        headYaw += (0 - headYaw) * HEAD_SPEED;
        headPitch += (0 - headPitch) * HEAD_SPEED;
        bodyYaw += (desiredYaw - bodyYaw) * BODY_TURN_SPEED;
        bodyPitch += (desiredPitch - bodyPitch) * BODY_TURN_SPEED;
      } else {
        const clampedYaw = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, residualYaw));
        const clampedPitch = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, residualPitch));
        headYaw += (clampedYaw - headYaw) * HEAD_SPEED;
        headPitch += (clampedPitch - headPitch) * HEAD_SPEED;
      }
    }

    head.rotation.y = headYaw;
    head.rotation.x = headPitch;
    wrapper.rotation.y = bodyYaw;
    wrapper.rotation.x = bodyPitch;
  }

  requestAnimationFrame(updateHeadLook);
}
updateHeadLook();


/* ===================== INTERACTIVE VOXEL BACKGROUND ===================== */
const bgCanvas = document.getElementById('bg-canvas');
const ctx = bgCanvas.getContext('2d');
let w, h, particles = [];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resizeBg(){
  w = bgCanvas.width = window.innerWidth;
  h = bgCanvas.height = window.innerHeight;
  const count = Math.min(260, Math.floor((w * h) / 8500));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    size: Math.random() < 0.8 ? 2 : 3
  }));
}
resizeBg();
window.addEventListener('resize', resizeBg);

function drawBg(){
  ctx.clearRect(0, 0, w, h);

  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if(p.x < 0 || p.x > w) p.vx *= -1;
    if(p.y < 0 || p.y > h) p.vy *= -1;

    const dx = p.x - mouse.x, dy = p.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if(dist < 170){
      const force = (170 - dist) / 170;
      p.x += (dx / dist) * force * 5.5;
      p.y += (dy / dist) * force * 5.5;
    }
  });

  ctx.fillStyle = 'rgba(150,120,255,0.75)';
  particles.forEach(p => {
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });

  for(let i = 0; i < particles.length; i++){
    for(let j = i + 1; j < particles.length; j++){
      const a = particles[i], b = particles[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if(dist < 130){
        ctx.strokeStyle = `rgba(150,120,255,${0.38 * (1 - dist / 130)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(drawBg);
}

if(!prefersReducedMotion){
  drawBg();
} else {
  ctx.fillStyle = 'rgba(138,108,242,0.35)';
  particles.forEach(p => ctx.fillRect(p.x, p.y, p.size, p.size));
}
