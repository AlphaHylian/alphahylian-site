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

/* ===================== SKIN VIEWER ===================== */
const skinCanvas = document.getElementById('skin-canvas');
const skinCard = skinCanvas.parentElement;

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

/* ===================== INTERACTIVE VOXEL BACKGROUND ===================== */
const bgCanvas = document.getElementById('bg-canvas');
const ctx = bgCanvas.getContext('2d');
let w, h, particles = [];
const mouse = { x: -9999, y: -9999 };
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resizeBg(){
  w = bgCanvas.width = window.innerWidth;
  h = bgCanvas.height = window.innerHeight;
  const count = Math.min(90, Math.floor((w * h) / 22000));
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
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

function drawBg(){
  ctx.clearRect(0, 0, w, h);

  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if(p.x < 0 || p.x > w) p.vx *= -1;
    if(p.y < 0 || p.y > h) p.vy *= -1;

    const dx = p.x - mouse.x, dy = p.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if(dist < 130){
      const force = (130 - dist) / 130;
      p.x += (dx / dist) * force * 1.6;
      p.y += (dy / dist) * force * 1.6;
    }
  });

  ctx.fillStyle = 'rgba(138,108,242,0.55)';
  particles.forEach(p => {
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });

  for(let i = 0; i < particles.length; i++){
    for(let j = i + 1; j < particles.length; j++){
      const a = particles[i], b = particles[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if(dist < 110){
        ctx.strokeStyle = `rgba(138,108,242,${0.14 * (1 - dist / 110)})`;
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
