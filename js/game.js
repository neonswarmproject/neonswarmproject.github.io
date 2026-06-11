/* ============================================================================
   NEON SWARM  —  a synthwave bullet-heaven survival game
   ----------------------------------------------------------------------------
   One file, no libraries, no images. Everything you see is drawn with the
   Canvas 2D API and every sound is synthesized (see js/audio.js).

   Sections:
     1.  Boot / canvas / palette / math helpers
     2.  Glow-sprite cache & drawing helpers
     3.  Spatial hash (broad-phase collision)
     4.  Game state container
     5.  Input  (keyboard / mouse / touch joystick)
     6.  Player, stats & derived values
     7.  Weapons   (7, each upgradeable)
     8.  Passives  (12 stat upgrades)
     9.  Upgrade selection (level-up cards)
     10. Enemies   (8 types + bosses) and the spawn director
     11. Combat resolution / particles / pickups / xp
     12. Update loop
     13. Render loop  (background, entities, HUD, overlays)
     14. State machine & UI wiring
     15. Main loop / boot
   ========================================================================== */
(function () {
'use strict';

// Single source of truth for the build version (shown discreetly on the title
// screen).
const VERSION = '2.4';

/* ===========================================================================
   1. BOOT / CANVAS / PALETTE / MATH
   ========================================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const boot = document.getElementById('boot');

let W = 0, H = 0, DPR = 1;

// v2 mobile view (Section G): zoom OUT on small touch screens so the player
// sees a comparable slice of the arena to desktop. camZoom scales the world
// transform; every world<->screen calculation divides by it (spawn ring,
// magnet radius, grid extents, pointer picking).
const MOBILE_ZOOM_MIN_DIM = 820;   // screens with min(W,H) below this zoom out
const MOBILE_ZOOM = 0.62;          // world scale on small touch screens
let camZoom = 1;
function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}
let LV_BADGE_FONT = '700 10px Segoe UI, sans-serif';
function computeZoom() {
  camZoom = (isTouchDevice() && Math.min(W, H) < MOBILE_ZOOM_MIN_DIM) ? MOBILE_ZOOM : 1;
  // the Lv badge is drawn inside the world transform: counter the zoom so it
  // stays readable on exactly the small screens the zoom-out targets
  LV_BADGE_FONT = '700 ' + Math.round(10 / camZoom) + 'px Segoe UI, sans-serif';
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  computeZoom();
}
window.addEventListener('resize', resize);
resize();

// Palette
const CY = '#19f0ff', MA = '#ff2d9b', PU = '#9d4dff', YE = '#ffe14d',
      GR = '#5dff9b', OR = '#ff8a3d', RD = '#ff4d4d', WH = '#ffffff',
      BL = '#5b8cff', PK = '#ff7bd5';

// Math
const TAU = Math.PI * 2;
const rand  = (a = 1, b)  => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

const ARENA = 4200;          // arena spans -ARENA/2 .. ARENA/2 on each axis
const BASE_SPEED = 232;

// v2 boss-rush cadence (declared early: the G literal reads these at boot)
const FIRST_BOSS_AT    = 45;   // s — the opening 1v1 duel is the hook
const BOSS_FARM_WINDOW = 75;   // s of adaptive farming between boss kills

// v2 movement feel (Section F)
const MOVE_LERP = 0.2;         // baseline velocity smoothing
const TURN_ASSIST = 3.2;       // extra steering response when reversing at speed
const DASH_TIME = 0.16, DASH_CD = 1.5, DASH_SPEED_MUL = 4.2, DASH_IFRAME = 0.28;
const DASH_VEL_CARRY = 0.45;   // dash momentum kept when the dash ends
const DASH_ZOOM = 0.06;        // camera punch-in while dashing
const DASH_TRAIL_LIFE = 0.22;  // s each afterimage ghost lives
const CAM_LERP = 0.12;         // smooth camera follow (never snaps)

/* ===========================================================================
   2. GLOW SPRITE CACHE & DRAW HELPERS
   ========================================================================= */
const glowCache = new Map();
function glowSprite(hex) {
  if (glowCache.has(hex)) return glowCache.get(hex);
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0,   rgba(hex, 1));
  grd.addColorStop(0.2, rgba(hex, 0.85));
  grd.addColorStop(0.5, rgba(hex, 0.30));
  grd.addColorStop(1,   rgba(hex, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  glowCache.set(hex, c);
  return c;
}
// additive glow blob (call within 'lighter' composite)
function glow(x, y, r, hex, alpha) {
  const spr = glowSprite(hex);
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
function poly(x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i / sides * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function star(x, y, r, points, rot, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + i / (points * 2) * TAU;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/* ===========================================================================
   3. SPATIAL HASH
   ========================================================================= */
const grid = {
  cell: 96,
  map: new Map(),
  clear() { this.map.clear(); },
  _k(cx, cy) { return cx * 73856093 ^ cy * 19349663; },
  insert(e) {
    const cx = Math.floor(e.x / this.cell), cy = Math.floor(e.y / this.cell);
    const k = this._k(cx, cy);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(e);
  },
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.map.get(this._k(cx, cy));
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    return out;
  }
};
const _q = []; // reusable query buffer
const _wq = [], _wq2 = []; // dedicated buffers for the new weapons (never clobber _q)

/* ===========================================================================
   4. GAME STATE
   ========================================================================= */
const MAX_ENEMIES = 380;
const MAX_EPROJ = 1200;      // enemy-bullet cap; drop oldest so bullet-hell phases stay smooth on mobile

/* ---- v2 ADAPTIVE PERFORMANCE (Section I): the fixed particle cap is gone.
   Startup classifies the device into a tier (cores + memory + DPR/screen) for
   an initial particle/effect budget; at runtime a rolling FPS sample nudges
   the budget up or down to hold ~60fps (graceful at 30 on weak devices).
   Telegraphs and enemy bullets are gameplay signal — they are NEVER culled. */
const PERF_TIER_BUDGET = [500, 900, 1400, 2200];  // particle budget per tier 0..3
const PERF_FPS_TARGET = 55;       // comfortable: budget may recover
const PERF_FPS_LOW = 45;          // struggling: budget gets cut
const PERF_SAMPLE_T = 1.0;        // s per FPS sample window
const PERF_STEP = 0.85;           // cut multiplier
const PERF_RECOVER = 1.06;        // recovery multiplier
const PERF_MIN_PARTICLES = 220;
const PERF = { tier: 2, particleBudget: 1400, budgetMax: 1400, fxLevel: 1, frames: 0, accum: 0 };
function initPerf() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const dpr = window.devicePixelRatio || 1;
  const small = Math.min(screen.width, screen.height) < 800;
  let score = 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  score += mem >= 8 ? 2 : mem >= 4 ? 1 : 0;
  if (dpr > 2 && small) score -= 1;     // tiny high-DPI screens pay a fill-rate tax
  PERF.tier = clamp(small ? Math.min(score, 2) : score, 0, 3);
  PERF.budgetMax = PERF_TIER_BUDGET[PERF.tier];
  PERF.particleBudget = PERF.budgetMax;
  PERF.fxLevel = PERF.tier >= 2 ? 1 : PERF.tier === 1 ? 0.7 : 0.45;
}
initPerf();
function perfSample(dt) {
  PERF.frames++; PERF.accum += dt;
  if (PERF.accum < PERF_SAMPLE_T) return;
  const fps = PERF.frames / PERF.accum;
  PERF.frames = 0; PERF.accum = 0;
  if (fps < PERF_FPS_LOW) {
    PERF.particleBudget = Math.max(PERF_MIN_PARTICLES, Math.floor(PERF.particleBudget * PERF_STEP));
    PERF.fxLevel = Math.max(0.3, PERF.fxLevel * 0.92);
  } else if (fps > PERF_FPS_TARGET && PERF.particleBudget < PERF.budgetMax) {
    PERF.particleBudget = Math.min(PERF.budgetMax, Math.ceil(PERF.particleBudget * PERF_RECOVER));
    PERF.fxLevel = Math.min(PERF.tier >= 2 ? 1 : 0.8, PERF.fxLevel * 1.03);
  }
}

const G = {
  state: 'title',                 // title | playing | levelup | paused | gameover
  time: 0,                        // seconds survived
  cam: { x: 0, y: 0 },
  dashZoom: 0,                    // momentary camera punch-in while dashing
  trail: [],                      // dash afterimage ghosts
  shake: 0,                       // trauma 0..1
  hitstop: 0,                     // seconds of frozen time
  flash: 0,                       // white/red screen flash 0..1
  flashColor: WH,
  enemies: [], eProj: [], pProj: [], gems: [], pickups: [],
  particles: [], floaters: [], beams: [], arcs: [], telegraphs: [],
  kills: 0, score: 0,
  combo: 0, comboTimer: 0,
  pendingLevels: 0,
  rerolls: 1,
  spawnTimer: 0,
  dirIntensity: 1,                 // hidden adaptive pressure 0.55..1.65 (never shown)
  dirStress: 0,                    // hidden player-stress 0..1 (never shown)
  dirKps: 0,                       // decaying kill counter -> clear-rate signal
  dirDps: 0,                       // decaying damage-taken counter -> stress signal
  spawnRamp: 1,                    // 0 after a bomb, climbs back over BOMB_RAMP_TIME
  nextBossAt: FIRST_BOSS_AT,
  bossNum: 0,                      // running total of bosses spawned
  bossBag: [],                     // shuffled bag of upcoming bosses (refilled per cycle)
  bossBanner: null,                // {name, life, max} — WARNING banner on boss arrival
  bossTier: 0,                     // completed bag cycles; bosses return stronger
  lvUnlockAt: null,                // time when enemy leveling unlocked (Section E)
  focusTarget: null,               // creature the player tapped/clicked (Section H)
  dmgDir: null,                    // {a,t} — directional damage indicator (Section L)
  glyphs: {},                      // boss id -> true once its Glyph Fragment is collected
  glyphCount: 0,                   // cached Object.keys(glyphs).length for the HUD
  sigil: 0,                        // 0 none | 1 forged (all glyphs) | 2 consumed
  ritual: null,                    // {t} — ARCHITECT summoning countdown
  sigilUI: null,                   // screen-space hit area of the sigil slot
  inputHiccup: 0,                  // brief (<=0.5s) movement-input loss from GLITCH boss
  glitchFX: 0,                     // screen-space glitch overlay intensity 0..1
  boss: null,
  frost: null,                    // {radius, slow, dmg} computed each frame
  playerSlow: 1,                  // 0..1 move multiplier from disruptor fields (reset each frame)
  best: loadBest(),
  choices: [],
  selIndex: 0,
};
let enemyId = 1;

function loadBest() {
  try { return JSON.parse(localStorage.getItem('neonswarm.best')) || { score: 0, time: 0, kills: 0, level: 1 }; }
  catch (e) { return { score: 0, time: 0, kills: 0, level: 1 }; }
}
function saveBest(b) { try { localStorage.setItem('neonswarm.best', JSON.stringify(b)); } catch (e) {} }
// permanent meta-progression (Section D: THE ARCHITECT unlock lives here)
function loadMeta() { try { return JSON.parse(localStorage.getItem('neonswarm.meta')) || {}; } catch (e) { return {}; } }
function saveMeta(m) { try { localStorage.setItem('neonswarm.meta', JSON.stringify(m)); } catch (e) {} }
const META = loadMeta();

/* ===========================================================================
   5. INPUT
   ========================================================================= */
const keys = new Set();
const pointer = { down: false, type: 'mouse', sx: 0, sy: 0, x: 0, y: 0, t0: 0, moved: 0 };
const IS_TOUCH = isTouchDevice();
const JOY_MAX = 70;
const lastTapUp = { t: -1e9, x: 0, y: 0 };   // set on pointerup when the touch was a TAP

/* ---- v2 MULTI-TOUCH (Section G): every finger tracked by pointerId.
   One finger drives a dynamic joystick (anchored where it lands, with a dead
   zone), other fingers can dash / tap-focus / hit UI — and NOTHING ever
   interrupts movement. The legacy `pointer` object now serves mouse/pen only. */
const touches = new Map();    // pointerId -> {x,y,sx,sy,t0,role:'move'|'free'|'ui'}
let joyId = null;             // pointerId currently driving the joystick
const JOY_DEAD = 10;          // px dead zone (fixes "reapply finger -> random direction")
const TAP_MAX_DIST = 18;      // px drift allowed for a tap (vs a drag)
const TAP_MAX_TIME = 0.25;    // s held allowed for a tap
const DOUBLE_TAP_T = 280;     // ms window for the double-tap dash
const DOUBLE_TAP_R = 80;      // px — both taps must land near the same spot

function key(e, down) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // keys we own (prevent page scroll etc.)
  const owned = [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if (owned.includes(e.key)) e.preventDefault();

  if (down) {
    // global toggles
    if (k === 'm') return toggleMute();
    if (k === 'f') return toggleFull();

    if (G.state === 'title') {
      if (k === 'Enter' || k === ' ') startGame();
      return;
    }
    if (G.state === 'gameover') {
      if (k === 'Enter') startGame();   // ENTER only — dash keys must never skip the report
      return;
    }
    if (G.state === 'levelup') {
      if (k === '1') chooseCard(0);
      else if (k === '2') chooseCard(1);
      else if (k === '3') chooseCard(2);
      else if (k === 'r') doReroll();
      else if (k === 'ArrowLeft')  { G.selIndex = (G.selIndex + 2) % 3; highlightCard(); }
      else if (k === 'ArrowRight') { G.selIndex = (G.selIndex + 1) % 3; highlightCard(); }
      else if (k === 'Enter') chooseCard(G.selIndex);
      return;
    }
    if (G.state === 'playing' || G.state === 'paused') {
      if (k === 'Escape' || k === 'p') return togglePause();
    }
    if (G.state === 'playing' && k === 'g') return activateSigil();   // ARCHITECT summon
    keys.add(k);
    if ((k === ' ' || k === 'Shift') && G.state === 'playing') tryDash();
  } else {
    keys.delete(k);
  }
}
window.addEventListener('keydown', e => key(e, true));
window.addEventListener('keyup',   e => key(e, false));

function onPointerDown(e) {
  // ignore clicks that land on HTML buttons / overlays
  if (e.target !== canvas) return;
  unlockAudio();
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;

  if (G.state === 'title') {
    startGame();
    // the starting finger immediately becomes the joystick — holding it down
    // and dragging moves the ship without a forced re-press
    if (e.pointerType === 'touch') {
      const rec = { x, y, sx: x, sy: y, t0: performance.now(), role: 'move' };
      touches.set(e.pointerId, rec); joyId = e.pointerId;
    }
    return;
  }

  // SIGIL slot tap/click (Section D) — consumes the press, never moves/dashes
  if (G.state === 'playing' && G.sigilUI &&
      dist(x, y, G.sigilUI.x, G.sigilUI.y) <= G.sigilUI.r + 8) {
    activateSigil();
    if (e.pointerType === 'touch') touches.set(e.pointerId, { role: 'ui' });
    return;
  }

  if (e.pointerType === 'touch') {
    // dash button: an independent touch — never touches the joystick state
    if (G.state === 'playing' && dist(x, y, W - 56, H - 56) < 44) {
      tryDash();
      touches.set(e.pointerId, { role: 'ui' });
      return;
    }
    // double-tap dash: this touch quickly follows a completed TAP near the same
    // spot and doesn't land on a creature (that's a focus tap). Joystick
    // re-grips and extra fingers never trigger it — a drag's release is no TAP.
    const now = performance.now();
    if (G.state === 'playing' && now - lastTapUp.t < DOUBLE_TAP_T &&
        dist(x, y, lastTapUp.x, lastTapUp.y) < DOUBLE_TAP_R && !enemyAtScreen(x, y)) tryDash();
    const rec = { x, y, sx: x, sy: y, t0: now, role: 'free' };
    touches.set(e.pointerId, rec);
    if (joyId === null) { joyId = e.pointerId; rec.role = 'move'; }   // joystick lands here
    return;
  }

  // mouse / pen: hold-to-move toward the cursor (unchanged)
  pointer.down = true;
  pointer.type = e.pointerType || 'mouse';
  pointer.sx = pointer.x = x;
  pointer.sy = pointer.y = y;
  pointer.t0 = performance.now();
  pointer.moved = 0;
}
function onPointerMove(e) {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const rec = touches.get(e.pointerId);
  if (rec) {
    if (rec.role !== 'ui') { rec.x = x; rec.y = y; }
    return;
  }
  if (pointer.down && e.pointerType !== 'touch') {
    pointer.moved += Math.abs(x - pointer.x) + Math.abs(y - pointer.y);
    pointer.x = x; pointer.y = y;
  }
}
function onPointerUp(e) {
  const rec = touches.get(e.pointerId);
  if (rec) {
    touches.delete(e.pointerId);
    if (e.pointerId === joyId) {
      joyId = null;
      // promote a remaining free finger to the joystick (anchor at its spot,
      // so the hand-off causes no movement jump)
      for (const [id, t] of touches) {
        if (t.role === 'free') { joyId = id; t.role = 'move'; t.sx = t.x; t.sy = t.y; break; }
      }
    }
    // a short, stationary touch is a TAP -> focus attempt (Section H)
    if (rec.role !== 'ui' && G.state === 'playing' &&
        (performance.now() - rec.t0) / 1000 < TAP_MAX_TIME &&
        dist(rec.x, rec.y, rec.sx, rec.sy) < TAP_MAX_DIST) {
      lastTapUp.t = performance.now(); lastTapUp.x = rec.sx; lastTapUp.y = rec.sy;
      tryFocusAt(rec.sx, rec.sy);
    }
    return;
  }
  if (e.pointerType !== 'touch') {
    // a clean click (no drag) is a focus attempt on PC (Section H)
    if (pointer.down && G.state === 'playing' && pointer.moved < 6 &&
        performance.now() - pointer.t0 < TAP_MAX_TIME * 1000) {
      tryFocusAt(pointer.sx, pointer.sy);
    }
    pointer.down = false;
  }
}
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);

// resolve movement direction (-1..1 each axis), magnitude up to 1
function moveVector() {
  let dx = 0, dy = 0;
  if (keys.has('a') || keys.has('ArrowLeft'))  dx -= 1;
  if (keys.has('d') || keys.has('ArrowRight')) dx += 1;
  if (keys.has('w') || keys.has('ArrowUp'))    dy -= 1;
  if (keys.has('s') || keys.has('ArrowDown'))  dy += 1;
  if (dx || dy) { const l = Math.hypot(dx, dy); return { x: dx / l, y: dy / l, mag: 1, src: 'key' }; }

  // touch: the dedicated joystick pointer (dead zone kills phantom direction)
  if (joyId !== null) {
    const t = touches.get(joyId);
    if (t) {
      const jx = t.x - t.sx, jy = t.y - t.sy;
      const l = Math.hypot(jx, jy);
      if (l < JOY_DEAD) return { x: 0, y: 0, mag: 0, src: 'touch' };
      const mag = Math.min(l / JOY_MAX, 1);
      return { x: jx / l, y: jy / l, mag, src: 'touch' };
    }
  }
  if (pointer.down && pointer.type !== 'touch') {
    const jx = pointer.x - W / 2, jy = pointer.y - H / 2;
    const l = Math.hypot(jx, jy);
    if (l < 14) return { x: 0, y: 0, mag: 0, src: 'mouse' };
    return { x: jx / l, y: jy / l, mag: 1, src: 'mouse' };
  }
  return { x: 0, y: 0, mag: 0, src: 'none' };
}

// C1 (v2.4): global weapon-REACH multiplier — every player attack's range is
// cut 25% so builds can never outrange bosses. Applied at each weapon's
// range-defining site (projectile travel life, beam length, aura/orbit radius,
// target acquisition). AoE blast sizes and field durations are untouched.
const WRANGE = 0.75;

/* ---- v2 FOCUS TARGET (Section H): tap/click a creature to focus it; auto-
   aiming weapons prefer the focus while it lives. Same creature toggles off,
   another switches. Empty space never clears (no accidental drops). ---- */
const FOCUS_PICK_R = 34;       // screen px — generous pick radius
const FOCUS_LEAD_R = 800 * WRANGE; // world px — focus must be this close to the querying
                               // weapon/anchor to steal aim (≈ max projectile reach)
function effZoom() { return (1 + G.dashZoom) * camZoom; }    // the ONE world<->screen scale
// radius of the visible world circle — matches the off-screen spawn ring
function viewRadius() { return Math.hypot(W / camZoom, H / camZoom) / 2; }
function screenToWorld(sx, sy) {
  const z = effZoom();
  return { x: G.cam.x + (sx - W / 2) / z, y: G.cam.y + (sy - H / 2) / z };
}
function enemyAtScreen(sx, sy) {
  const w = screenToWorld(sx, sy);
  const pickR = FOCUS_PICK_R / effZoom();
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist(w.x, w.y, e.x, e.y) - e.r;
    if (d < pickR && d < bd) { bd = d; best = e; }
  }
  return best;
}
function tryFocusAt(sx, sy) {
  const best = enemyAtScreen(sx, sy);
  if (!best) return;                                          // empty space: keep focus
  G.focusTarget = (G.focusTarget === best) ? null : best;     // toggle / switch
  if (G.focusTarget) {
    sfx('hover');
    spawnRing(best.x, best.y, best.r, best.r + 18, 0.3, WH);
  }
}
function focusAlive() {
  const f = G.focusTarget;
  if (f && !f.dead) return f;
  if (f) G.focusTarget = null;
  return null;
}

/* ===========================================================================
   6. PLAYER
   ========================================================================= */
const player = {
  x: 0, y: 0, vx: 0, vy: 0, r: 14, aim: -Math.PI / 2,
  hp: 100, maxHp: 100,
  level: 1, xp: 0, xpNext: 6,
  invuln: 0, dashCD: 0, dashTime: 0, dashDir: { x: 1, y: 0 },
  weapons: [],
  passives: {},                   // id -> level
  stats: null,
  buffT: { triple: 0, nectar: 0, aura: 0, auraTick: 0 },  // timed boss buffs (seconds left)
};
function freshStats() {
  return {
    damageMul: 1, attackSpeedMul: 1, areaMul: 1, projSpeedMul: 1, projDurMul: 1,
    moveSpeedMul: 1, maxHpBonus: 0, regen: 0, armor: 0,
    crit: 0.03, critMult: 2, xpGain: 1, pickup: 95, luck: 0,
  };
}

function tryDash() {
  if (player.dashCD > 0 || G.state !== 'playing') return;
  const mv = moveVector();
  let d = (mv.mag > 0) ? { x: mv.x, y: mv.y } : { x: Math.cos(player.aim), y: Math.sin(player.aim) };
  player.dashDir = d;
  player.dashTime = DASH_TIME;
  player.dashCD = DASH_CD;
  player.invuln = Math.max(player.invuln, DASH_IFRAME);
  sfx('dash');
  for (let i = 0; i < 14; i++)
    spawnParticle(player.x, player.y, -d.x * rand(40, 160) + rand(-40, 40), -d.y * rand(40, 160) + rand(-40, 40), rand(0.2, 0.4), rand(2, 4), CY, 'spark');
}

const DMG_IND_T = 0.6;        // s the directional damage indicator stays up (Section L)
const FIRST_RUN_HINT_T = 14;  // s the first-run hint line stays on screen (Section L)
function hurtPlayer(dmg, srcX, srcY) {
  if (player.invuln > 0 || player.dashTime > 0 || G.state !== 'playing') return;
  const real = Math.max(1, dmg - player.stats.armor);
  player.hp -= real;
  G.dirDps += real;                       // feeds the hidden stress signal
  if (srcX !== undefined) G.dmgDir = { a: angTo(player.x, player.y, srcX, srcY), t: DMG_IND_T };
  player.invuln = 0.75;
  G.shake = Math.min(1, G.shake + 0.5);
  G.flash = 0.6; G.flashColor = RD;
  G.hitstop = Math.max(G.hitstop, 0.06);
  sfx('hurt');
  G.combo = 0;
  spawnRing(player.x, player.y, player.r, player.r * 4, 0.35, RD);
  for (let i = 0; i < 18; i++)
    spawnParticle(player.x, player.y, rand(-180, 180), rand(-180, 180), rand(0.2, 0.5), rand(2, 4), RD, 'spark');
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

/* ===========================================================================
   7. WEAPONS
   ----------------------------------------------------------------------------
   Each definition exposes:
     name, icon, color, max (max level)
     info(level)  -> short upgrade description for the card
     update(self, dt) -> fully self-contained behaviour (handles its own timer)
   A weapon "self" is: { id, level, t, data }
   ========================================================================= */
const S = () => player.stats;

function nearestEnemy(x, y, maxD) {
  // focus target wins while alive and in range (Section H) — but never from
  // beyond FOCUS_LEAD_R: a kited-away focus must not eat shots that can't reach
  const f = focusAlive();
  const fr = Math.min(maxD || FOCUS_LEAD_R, FOCUS_LEAD_R);
  if (f && dist2(x, y, f.x, f.y) <= fr * fr) return f;
  let best = null, bd = (maxD || 1e9) ** 2;
  const arr = G.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i]; if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function nearestEnemies(x, y, n) {
  const list = [];
  const arr = G.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i]; if (e.dead) continue;
    list.push([dist2(x, y, e.x, e.y), e]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const out = [];
  const f = focusAlive();
  // focus leads the volley — only when in reach of the query point (chain arcs
  // anchor on the previous hit; a cross-map focus must not bend them away)
  if (f && dist2(x, y, f.x, f.y) <= FOCUS_LEAD_R * FOCUS_LEAD_R) out.push(f);
  for (let i = 0; i < list.length && out.length < n; i++) {
    const e = list[i][1];
    if (e !== f) out.push(e);
  }
  return out;
}

const TRIPLE_SPREAD = 0.15;   // rad each side for the Prism Shard buff
function firePlayerProjectile(o) {
  const base = Object.assign({
    x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 10, pierce: 0, life: 1.2,
    color: CY, hit: null, homing: 0, target: null, kind: 'bolt', trail: 0
  }, o);
  G.pProj.push(base);
  // Prism Shard: every fired projectile becomes a triple (aura/orbit/beam weapons
  // don't call this, so they're unaffected — that's intended).
  if (player.buffT.triple > 0 && (base.vx || base.vy)) {
    const sp = Math.hypot(base.vx, base.vy), a0 = Math.atan2(base.vy, base.vx);
    for (const s of [-TRIPLE_SPREAD, TRIPLE_SPREAD]) {
      const a = a0 + s;
      const clone = Object.assign({}, base, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      if (base.hit) clone.hit = new Set();   // independent hit-set so clones can also hit
      G.pProj.push(clone);
    }
  }
}

// v2 balance pass (Section B): gentle buffs for under-picked weapons so more
// builds are viable. Tuned small on purpose; revisit after human playtests.
const PULSE_CD = 0.6, PULSE_CD_LV4 = 0.09;   // lv4 card says "Faster fire rate" — now true
const FROST_DPS_BASE = 7;                     // was 5
const WHIP_DMG_BASE = 24;                     // was 20
const SENTRY_DMG_BASE = 13, SENTRY_LIFE_BASE = 7;  // was 10 / 6
const FLAK_DMG_BASE = 11;                     // was 9

const WEAPONS = {
  /* ---- Pulse Cannon : auto-targeting bolts ---- */
  pulse: {
    name: 'Pulse Cannon', icon: '✦', color: CY, max: 12,
    info(l) {
      const m = ['Auto-fires a bolt at the nearest foe.',
        '+1 bolt per volley.', '+45% damage.', 'Faster fire rate.',
        '+1 bolt &amp; pierces 1 enemy.', '+45% damage.', '+1 bolt.', 'Pierces +2, big damage.',
        '+1 bolt &amp; pierce +1.', '+50% damage.', '+1 bolt.', 'Overload: max bolts, +damage &amp; pierce.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      self.t -= dt;
      const lv = self.level;
      const cd = (PULSE_CD - (lv >= 4 ? PULSE_CD_LV4 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const count = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 1 : 0) + (lv >= 9 ? 1 : 0) + (lv >= 11 ? 1 : 0);
      let dmg = 11 * (1 + (lv >= 3 ? 0.45 : 0) + (lv >= 6 ? 0.45 : 0) + (lv >= 8 ? 0.6 : 0) + (lv >= 10 ? 0.5 : 0) + (lv >= 12 ? 0.7 : 0)) * S().damageMul;
      const pierce = (lv >= 5 ? 1 : 0) + (lv >= 8 ? 2 : 0) + (lv >= 9 ? 1 : 0) + (lv >= 12 ? 2 : 0);
      const targets = nearestEnemies(player.x, player.y, count);
      if (!targets.length) return;
      const spd = 560 * S().projSpeedMul;
      for (let i = 0; i < count; i++) {
        const t = targets[i % targets.length];
        let a = t ? angTo(player.x, player.y, t.x, t.y) : player.aim;
        a += (i - (count - 1) / 2) * 0.12;
        firePlayerProjectile({
          x: player.x, y: player.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: 6, dmg, pierce, life: 1.4 * WRANGE * S().projDurMul, color: CY, hit: new Set(), trail: 1
        });
      }
      // muzzle flash (Section J)
      for (let i = 0; i < 3; i++)
        spawnParticle(player.x, player.y, rand(-90, 90), rand(-90, 90), 0.15, 2.5, CY, 'spark');
      sfx('shoot');
    }
  },

  /* ---- Halo Blades : orbiting blades ---- */
  orbit: {
    name: 'Halo Blades', icon: '🌀', color: PU, max: 11,
    info(l) {
      const m = ['Blades orbit you, shredding contact.',
        '+1 blade.', '+40% damage.', '+1 blade &amp; wider orbit.',
        'Faster spin, +damage.', '+1 blade.', 'Huge orbit &amp; damage.',
        '+1 blade.', 'Wider orbit &amp; +damage.', '+1 blade &amp; faster spin.', 'Maelstrom: vast orbit &amp; damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      if (!self.data) self.data = { ang: 0, hits: new Map() };
      const count = 2 + (lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0) + (lv >= 6 ? 1 : 0) + (lv >= 8 ? 1 : 0) + (lv >= 10 ? 1 : 0);
      const radius = (78 + (lv >= 4 ? 26 : 0) + (lv >= 7 ? 40 : 0) + (lv >= 9 ? 30 : 0) + (lv >= 11 ? 36 : 0)) * Math.sqrt(S().areaMul) * WRANGE;
      const spin = (2.0 + (lv >= 5 ? 1.1 : 0) + (lv >= 10 ? 0.8 : 0)) * S().attackSpeedMul;
      const dmg = 9 * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 5 ? 0.4 : 0) + (lv >= 7 ? 0.7 : 0) + (lv >= 9 ? 0.5 : 0) + (lv >= 11 ? 0.7 : 0)) * S().damageMul * dt * 6;
      self.data.ang += spin * dt;
      const br = 13;
      self.data.positions = [];
      for (let i = 0; i < count; i++) {
        const a = self.data.ang + i / count * TAU;
        const bx = player.x + Math.cos(a) * radius, by = player.y + Math.sin(a) * radius;
        self.data.positions.push({ x: bx, y: by });
        grid.query(bx, by, br + 26, _q);
        for (let j = 0; j < _q.length; j++) {
          const e = _q[j]; if (e.dead) continue;
          if (dist2(bx, by, e.x, e.y) < (br + e.r) ** 2) {
            const last = self.data.hits.get(e.id) || 0;
            if (G.time - last > 0.18) {
              self.data.hits.set(e.id, G.time);
              damageEnemy(e, dmg * 6, { kbx: (e.x - player.x), kby: (e.y - player.y), kb: 60, color: PU });
            }
          }
        }
      }
    },
    draw(self) {
      if (!self.data || !self.data.positions) return;
      for (const p of self.data.positions) {
        glow(p.x, p.y, 22, PU, 0.8);
      }
    }
  },

  /* ---- Shock Pulse : periodic nova ---- */
  nova: {
    name: 'Shock Pulse', icon: '💥', color: YE, max: 11,
    info(l) {
      const m = ['Emits a damaging shockwave around you.',
        'Bigger radius.', '+45% damage.', 'Faster pulses.',
        'Bigger radius &amp; knockback.', '+45% damage.', 'Massive blast.',
        'Bigger radius.', 'Faster pulses.', '+50% damage.', 'Cataclysm: enormous blast &amp; knockback.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (2.4 - (lv >= 4 ? 0.6 : 0) - (lv >= 9 ? 0.4 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const radius = (120 + (lv >= 2 ? 40 : 0) + (lv >= 5 ? 60 : 0) + (lv >= 7 ? 90 : 0) + (lv >= 8 ? 50 : 0) + (lv >= 11 ? 80 : 0)) * S().areaMul * WRANGE;
      const dmg = 16 * (1 + (lv >= 3 ? 0.45 : 0) + (lv >= 6 ? 0.45 : 0) + (lv >= 7 ? 0.6 : 0) + (lv >= 10 ? 0.5 : 0)) * S().damageMul;
      grid.query(player.x, player.y, radius, _q);
      for (let i = 0; i < _q.length; i++) {
        const e = _q[i]; if (e.dead) continue;
        if (dist2(player.x, player.y, e.x, e.y) < (radius + e.r) ** 2)
          damageEnemy(e, dmg, { kbx: e.x - player.x, kby: e.y - player.y, kb: 140 + (lv >= 5 ? 120 : 0) + (lv >= 11 ? 120 : 0), color: YE });
      }
      G.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 10, mr: radius, life: 0.45, max: 0.45, color: YE, kind: 'ring' });
      G.shake = Math.min(1, G.shake + 0.18);
      sfx('nova');
    }
  },

  /* ---- Arc Lightning : chaining bolts ---- */
  chain: {
    name: 'Arc Lightning', icon: '⚡', color: BL, max: 11,
    info(l) {
      const m = ['Lightning leaps between nearby foes.',
        '+1 chain jump.', '+40% damage.', 'Faster strikes.',
        '+2 chain jumps.', '+40% damage.', 'Storm: +damage &amp; jumps.',
        '+2 chain jumps.', 'Faster strikes.', '+50% damage.', 'Tempest: +jumps &amp; damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.4 - (lv >= 4 ? 0.45 : 0) - (lv >= 9 ? 0.3 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      const first = nearestEnemy(player.x, player.y, 460 * WRANGE);
      if (!first) { self.t = 0.2; return; }
      self.t = cd;
      const jumps = 3 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 2 : 0) + (lv >= 7 ? 2 : 0) + (lv >= 9 ? 2 : 0) + (lv >= 11 ? 2 : 0);
      let dmg = 13 * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 6 ? 0.4 : 0) + (lv >= 7 ? 0.6 : 0) + (lv >= 10 ? 0.5 : 0)) * S().damageMul;
      const hitSet = new Set();
      let from = { x: player.x, y: player.y };
      let cur = first;
      const pts = [{ x: player.x, y: player.y }];
      for (let j = 0; j < jumps && cur; j++) {
        pts.push({ x: cur.x, y: cur.y });
        damageEnemy(cur, dmg, { color: BL });
        hitSet.add(cur.id);
        dmg *= 0.82;
        // next nearest unhit within range
        let next = null, bd = (220 * WRANGE) ** 2;
        grid.query(cur.x, cur.y, 240 * WRANGE, _q);
        for (let i = 0; i < _q.length; i++) {
          const e = _q[i];
          if (e.dead || hitSet.has(e.id)) continue;
          const d = dist2(cur.x, cur.y, e.x, e.y);
          if (d < bd) { bd = d; next = e; }
        }
        from = cur; cur = next;
      }
      G.arcs.push({ pts, life: 0.18, max: 0.18, color: BL });
      sfx('zap');
    }
  },

  /* ---- Seeker Swarm : homing missiles ---- */
  missile: {
    name: 'Seeker Swarm', icon: '🚀', color: OR, max: 11,
    info(l) {
      const m = ['Launches homing missiles that explode.',
        '+1 missile.', '+40% damage.', 'Faster launches.',
        '+1 missile &amp; bigger blast.', '+40% damage.', '+2 missiles.',
        'Bigger blast.', '+1 missile &amp; faster.', '+50% damage.', 'Swarm: +2 missiles &amp; huge blast.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.5 - (lv >= 4 ? 0.4 : 0) - (lv >= 9 ? 0.3 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const count = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 2 : 0) + (lv >= 9 ? 1 : 0) + (lv >= 11 ? 2 : 0);
      const dmg = 18 * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 6 ? 0.4 : 0) + (lv >= 10 ? 0.5 : 0)) * S().damageMul;
      const blast = (52 + (lv >= 5 ? 26 : 0) + (lv >= 8 ? 24 : 0) + (lv >= 11 ? 30 : 0)) * S().areaMul;
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        firePlayerProjectile({
          x: player.x, y: player.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
          r: 5, dmg, pierce: 0, life: 2.4 * WRANGE * S().projDurMul, color: OR,
          kind: 'missile', homing: 6.5, blast, hit: new Set(), trail: 1
        });
      }
      sfx('laser');
    }
  },

  /* ---- Lance : piercing beam ---- */
  beam: {
    name: 'Photon Lance', icon: '🔆', color: PK, max: 11,
    info(l) {
      const m = ['Fires a piercing beam of light.',
        'Wider beam.', '+45% damage.', 'Faster firing.',
        '+1 beam &amp; longer.', '+45% damage.', '+1 overcharged lance.',
        'Longer beam.', '+1 lance &amp; faster.', 'Wider beam.', 'Prismatic: +lance &amp; damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.05 - (lv >= 4 ? 0.3 : 0) - (lv >= 9 ? 0.22 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      const beams = 1 + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 1 : 0) + (lv >= 9 ? 1 : 0) + (lv >= 11 ? 1 : 0);
      const target = nearestEnemy(player.x, player.y, 1200 * WRANGE);
      if (!target) { self.t = 0.2; return; }
      self.t = cd;
      const len = (520 + (lv >= 5 ? 180 : 0) + (lv >= 8 ? 160 : 0)) * S().areaMul * WRANGE;
      const wid = (16 + (lv >= 2 ? 8 : 0) + (lv >= 10 ? 8 : 0)) * Math.sqrt(S().areaMul);
      const dmg = 26 * (1 + (lv >= 3 ? 0.45 : 0) + (lv >= 6 ? 0.45 : 0) + (lv >= 7 ? 0.6 : 0) + (lv >= 11 ? 0.6 : 0)) * S().damageMul;
      const baseA = angTo(player.x, player.y, target.x, target.y);
      for (let b = 0; b < beams; b++) {
        const a = baseA + (b - (beams - 1) / 2) * 0.14;
        const ex = player.x + Math.cos(a) * len, ey = player.y + Math.sin(a) * len;
        // damage enemies near the segment
        grid.query((player.x + ex) / 2, (player.y + ey) / 2, len / 2 + 60, _q);
        for (let i = 0; i < _q.length; i++) {
          const e = _q[i]; if (e.dead) continue;
          if (segDist(player.x, player.y, ex, ey, e.x, e.y) < wid / 2 + e.r)
            damageEnemy(e, dmg, { kbx: Math.cos(a), kby: Math.sin(a), kb: 40, color: PK });
        }
        G.beams.push({ x1: player.x, y1: player.y, x2: ex, y2: ey, w: wid, life: 0.16, max: 0.16, color: PK });
      }
      G.shake = Math.min(1, G.shake + 0.08);
      sfx('laser');
    }
  },

  /* ---- Cryo Field : slowing aura ---- */
  frost: {
    name: 'Cryo Field', icon: '❄', color: '#7fe9ff', max: 10,
    info(l) {
      const m = ['Aura slows &amp; chills nearby foes.',
        'Wider field.', 'Stronger slow &amp; damage.',
        'Wider field.', 'Deep freeze damage.', 'Glacial: huge slow field.',
        'Stronger chill &amp; damage.', 'Wider field.', 'Deeper slow.', 'Absolute zero: massive field.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      const radius = (110 + (lv >= 2 ? 35 : 0) + (lv >= 4 ? 45 : 0) + (lv >= 6 ? 70 : 0) + (lv >= 8 ? 45 : 0) + (lv >= 10 ? 60 : 0)) * S().areaMul * WRANGE;
      const slow = 0.42 + (lv >= 3 ? 0.12 : 0) + (lv >= 6 ? 0.12 : 0) + (lv >= 9 ? 0.08 : 0);
      const dps = (FROST_DPS_BASE + (lv >= 3 ? 4 : 0) + (lv >= 5 ? 6 : 0) + (lv >= 7 ? 6 : 0) + (lv >= 10 ? 8 : 0)) * S().damageMul;
      G.frost = { radius, slow, dmg: dps };
      // damage tick handled here
      self.t = (self.t || 0) - dt;
      if (self.t <= 0) {
        self.t = 0.25;
        grid.query(player.x, player.y, radius, _q);
        for (let i = 0; i < _q.length; i++) {
          const e = _q[i]; if (e.dead) continue;
          if (dist2(player.x, player.y, e.x, e.y) < (radius + e.r) ** 2)
            damageEnemy(e, dps * 0.25, { color: '#7fe9ff', silent: true });
        }
      }
    }
  },

  /* ======================================================================
     v1.2 — nine additional weapons (see CHANGELOG). Each owns its self.t
     cooldown and uses S() multipliers. Nested grid.query calls use the
     dedicated _wq / _wq2 buffers so the shared _q is never clobbered.
     ====================================================================== */

  /* ---- Razor Disc : boomerang discs that hit out and back ---- */
  glaive: {
    name: 'Razor Disc', icon: '🔁', color: GR, max: 9,
    info(l) {
      const m = ['Hurls a spinning disc that flies out and returns.',
        '+45% damage.', '+1 disc.', 'Bigger disc &amp; pierce.',
        '+45% damage.', '+1 disc.', 'Bigger disc &amp; pierce.',
        'Faster return &amp; damage.', 'A fourth disc of doom.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.3 - (lv >= 4 ? 0.3 : 0) - (lv >= 8 ? 0.2 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const count = 1 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0) + (lv >= 9 ? 1 : 0);
      const dmg = 14 * (1 + (lv >= 2 ? 0.45 : 0) + (lv >= 5 ? 0.45 : 0) + (lv >= 8 ? 0.5 : 0)) * S().damageMul;
      const pr = 4 + (lv >= 4 ? 2 : 0) + (lv >= 7 ? 3 : 0);
      const rr = (10 + (lv >= 4 ? 3 : 0) + (lv >= 7 ? 4 : 0)) * Math.sqrt(S().areaMul);
      const reach = (320 + (lv >= 6 ? 120 : 0)) * S().areaMul * WRANGE;
      const spd = 470 * S().projSpeedMul;
      const base = nearestEnemy(player.x, player.y, 1400 * WRANGE);
      const baseA = base ? angTo(player.x, player.y, base.x, base.y) : player.aim;
      for (let i = 0; i < count; i++) {
        const a = baseA + (i - (count - 1) / 2) * 0.4;
        firePlayerProjectile({
          x: player.x, y: player.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: rr, dmg, pierce: pr, life: 3.0 * S().projDurMul, color: GR, kind: 'glaive',
          hit: new Set(), spin: rand(0, TAU), returning: false, reach,
          homing: 7 + (lv >= 8 ? 3 : 0), ox: player.x, oy: player.y
        });
      }
      sfx('shoot');
    }
  },

  /* ---- Plasma Mines : proximity mines with optional chaining ---- */
  mines: {
    name: 'Plasma Mines', icon: '◇', color: OR, max: 8,
    info(l) {
      const m = ['Drops proximity mines that blast on contact.',
        '+40% damage.', '+2 mines.', 'Bigger blast.',
        '+45% damage.', 'Chain detonations &amp; +mines.', 'Bigger blast.',
        'Minefield: +mines &amp; damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      if (!self.data) self.data = { mines: [], t: 0 };
      const d = self.data;
      const MINE_TRIGGER = 30, MINE_FUSE = 9, MINE_ARM = 0.3;
      const maxMines = 4 + (lv >= 3 ? 2 : 0) + (lv >= 6 ? 3 : 0) + (lv >= 8 ? 3 : 0);
      const blast = (78 + (lv >= 4 ? 28 : 0) + (lv >= 7 ? 36 : 0)) * S().areaMul;
      const dmg = 30 * (1 + (lv >= 2 ? 0.4 : 0) + (lv >= 5 ? 0.45 : 0) + (lv >= 8 ? 0.5 : 0)) * S().damageMul;
      const chain = lv >= 6;
      d.t -= dt;
      const cd = (1.1 - (lv >= 4 ? 0.25 : 0)) / S().attackSpeedMul;
      if (d.t <= 0 && d.mines.length < maxMines) { d.t = cd; d.mines.push({ x: player.x, y: player.y, t: 0, deton: false }); }
      for (const mn of d.mines) {
        mn.t += dt;
        if (mn.deton) continue;
        if (mn.t >= MINE_FUSE) { mn.deton = true; continue; }
        if (mn.t < MINE_ARM) continue;
        grid.query(mn.x, mn.y, MINE_TRIGGER, _wq);
        for (let j = 0; j < _wq.length; j++) { const e = _wq[j]; if (e.dead) continue; if (dist2(mn.x, mn.y, e.x, e.y) < (MINE_TRIGGER + e.r) ** 2) { mn.deton = true; break; } }
      }
      for (let i = d.mines.length - 1; i >= 0; i--) {
        const mn = d.mines[i];
        if (!mn.deton) continue;
        explodeAt(mn.x, mn.y, blast, OR);
        grid.query(mn.x, mn.y, blast, _wq2);
        for (let j = 0; j < _wq2.length; j++) { const e = _wq2[j]; if (e.dead) continue; if (dist2(mn.x, mn.y, e.x, e.y) < (blast + e.r) ** 2) damageEnemy(e, dmg, { kbx: e.x - mn.x, kby: e.y - mn.y, kb: 120, color: OR }); }
        if (chain) for (const o of d.mines) { if (o !== mn && !o.deton && dist2(mn.x, mn.y, o.x, o.y) < (blast * 0.9) ** 2) o.deton = true; }
        d.mines.splice(i, 1);
      }
    },
    draw(self) {
      if (!self.data) return;
      for (const mn of self.data.mines) {
        const pulse = 0.5 + 0.5 * Math.sin(G.time * 8 + mn.x * 0.1);
        glow(mn.x, mn.y, 9 + pulse * 4, OR, 0.5);
        ctx.strokeStyle = rgba(OR, 0.85); ctx.lineWidth = 2;
        poly(mn.x, mn.y, 7, 4, Math.PI / 4); ctx.stroke();
      }
    }
  },

  /* ---- Singularity : orb that collapses into a pulling well ---- */
  vortex: {
    name: 'Singularity', icon: '🌀', color: PU, max: 8,
    info(l) {
      const m = ['Fires an orb that collapses into a pulling well.',
        'Longer well.', 'Bigger well.', '+damage.',
        '+1 simultaneous well.', 'Stronger pull &amp; well.', '+damage.',
        'Event horizon: +well &amp; pull.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      if (!self.data) self.data = { zones: [] };
      const z = self.data.zones;
      for (let i = z.length - 1; i >= 0; i--) {
        const v = z[i]; v.life -= dt;
        if (v.life <= 0) { z.splice(i, 1); continue; }
        grid.query(v.x, v.y, v.radius, _wq);
        for (let j = 0; j < _wq.length; j++) {
          const e = _wq[j]; if (e.dead || e.boss) continue;
          if (dist2(v.x, v.y, e.x, e.y) < v.radius * v.radius) {
            const a = angTo(e.x, e.y, v.x, v.y), f = v.pull * dt;
            e.vx += Math.cos(a) * f; e.vy += Math.sin(a) * f;
            e.x += Math.cos(a) * f * 0.02; e.y += Math.sin(a) * f * 0.02;
          }
        }
        v.tick -= dt;
        if (v.tick <= 0) {
          v.tick = 0.25;
          grid.query(v.x, v.y, v.radius, _wq);
          for (let j = 0; j < _wq.length; j++) { const e = _wq[j]; if (e.dead) continue; if (dist2(v.x, v.y, e.x, e.y) < (v.radius + e.r) ** 2) damageEnemy(e, v.dmg * 0.25, { color: PU, silent: true }); }
        }
      }
      self.t = (self.t || 0) - dt;
      const cd = (3.2 - (lv >= 4 ? 0.6 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const target = nearestEnemy(player.x, player.y, 1100 * WRANGE);
      const a = target ? angTo(player.x, player.y, target.x, target.y) : player.aim;
      const spd = 185 * S().projSpeedMul;
      firePlayerProjectile({
        x: player.x, y: player.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        r: 10, dmg: 0, pierce: 0, life: 1.5 * WRANGE * S().projDurMul, color: PU, kind: 'vortex',
        _w: self, maxZones: 1 + (lv >= 5 ? 1 : 0) + (lv >= 8 ? 1 : 0),
        zoneR: (120 + (lv >= 3 ? 40 : 0) + (lv >= 7 ? 60 : 0)) * S().areaMul,
        zoneDur: 3.0 + (lv >= 2 ? 1.0 : 0) + (lv >= 6 ? 1.5 : 0),
        zoneDmg: (20 + (lv >= 4 ? 14 : 0)) * S().damageMul,
        zonePull: 220 + (lv >= 6 ? 130 : 0)
      });
      sfx('laser');
    },
    draw(self) {
      if (!self.data) return;
      for (const v of self.data.zones) {
        const a = clamp(v.life / v.max, 0, 1);
        glow(v.x, v.y, v.radius * 0.5, PU, 0.10 * a + 0.04);
        ctx.strokeStyle = rgba(PU, 0.3 * a); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.radius, 0, TAU); ctx.stroke();
        const rot = G.time * 3;
        for (let k = 0; k < 6; k++) { const ang = rot + k / 6 * TAU, r2 = v.radius * (0.35 + 0.3 * Math.sin(G.time * 4 + k)); glow(v.x + Math.cos(ang) * r2, v.y + Math.sin(ang) * r2, 5, PU, 0.5 * a); }
      }
    }
  },

  /* ---- Flak Burst : shell that airbursts into shrapnel ---- */
  flak: {
    name: 'Flak Burst', icon: '✸', color: YE, max: 8,
    info(l) {
      const m = ['Lobs a shell that airbursts into shrapnel.',
        '+2 shrapnel.', '+40% damage.', 'Wider spread.',
        '+3 shrapnel.', '+45% damage.', 'Wider spread.',
        'Flak storm: +4 shrapnel.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.6 - (lv >= 4 ? 0.4 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const target = nearestEnemy(player.x, player.y, 1000 * WRANGE);
      const a = target ? angTo(player.x, player.y, target.x, target.y) : player.aim;
      const spd = 430 * S().projSpeedMul;
      const shr = 5 + (lv >= 2 ? 2 : 0) + (lv >= 5 ? 3 : 0) + (lv >= 8 ? 4 : 0);
      const dmg = FLAK_DMG_BASE * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 6 ? 0.45 : 0)) * S().damageMul;
      const spread = 0.6 + (lv >= 4 ? 0.3 : 0) + (lv >= 7 ? 0.5 : 0);
      const life0 = 0.55 * WRANGE * S().projDurMul;
      firePlayerProjectile({ x: player.x, y: player.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, dmg: 0, pierce: 0, life: life0, life0, color: YE, kind: 'flak', shr, shrDmg: dmg, shrSpread: spread, aimA: a, burst: false });
      sfx('laser');
    }
  },

  /* ---- Arc Whip : melee arc swipe in the aim direction ---- */
  whip: {
    name: 'Arc Whip', icon: '➰', color: MA, max: 9,
    info(l) {
      const m = ['Lashes a melee arc in your facing direction.',
        '+damage.', 'Wider arc.', '+range.',
        '+damage &amp; faster.', 'Wider arc.', '+range.',
        '+damage.', 'Double swipe (front &amp; back).'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (0.9 - (lv >= 5 ? 0.25 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const range = (150 + (lv >= 4 ? 40 : 0) + (lv >= 7 ? 50 : 0)) * Math.sqrt(S().areaMul) * WRANGE;
      const half = 0.7 + (lv >= 3 ? 0.25 : 0) + (lv >= 6 ? 0.3 : 0);
      const dmg = (WHIP_DMG_BASE + (lv >= 2 ? 8 : 0) + (lv >= 5 ? 8 : 0) + (lv >= 8 ? 12 : 0)) * S().damageMul;
      const swipes = 1 + (lv >= 9 ? 1 : 0);
      for (let s = 0; s < swipes; s++) {
        const aim = player.aim + s * Math.PI;
        grid.query(player.x, player.y, range + 40, _wq);
        for (let j = 0; j < _wq.length; j++) {
          const e = _wq[j]; if (e.dead) continue;
          if (dist2(player.x, player.y, e.x, e.y) < (range + e.r) ** 2) {
            let da = angTo(player.x, player.y, e.x, e.y) - aim;
            while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
            if (Math.abs(da) <= half) damageEnemy(e, dmg, { kbx: e.x - player.x, kby: e.y - player.y, kb: 200, color: MA });
          }
        }
        const segs = 10;
        for (let k = 0; k <= segs; k++) {
          const aa = aim - half + (k / segs) * half * 2, r2 = range * 0.92;
          spawnParticle(player.x + Math.cos(aa) * r2, player.y + Math.sin(aa) * r2, Math.cos(aa) * 70, Math.sin(aa) * 70, 0.22, 3, MA, 'spark');
        }
      }
      sfx('shoot');
    }
  },

  /* ---- Sentry Drone : stationary auto-firing drones ---- */
  sentry: {
    name: 'Sentry Drone', icon: '▣', color: CY, max: 8,
    info(l) {
      const m = ['Deploys a drone that auto-fires, then expires.',
        '+damage.', '+1 drone.', 'Longer lifetime.',
        '+damage &amp; pierce.', '+1 drone.', 'Faster fire.',
        'Drone swarm: +1 drone.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      if (!self.data) self.data = { drones: [], t: 0 };
      const d = self.data;
      const maxD = 1 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0) + (lv >= 8 ? 1 : 0);
      const lifeT = SENTRY_LIFE_BASE + (lv >= 4 ? 3 : 0);
      const fireCd = (0.5 - (lv >= 7 ? 0.15 : 0)) / S().attackSpeedMul;
      const dmg = (SENTRY_DMG_BASE + (lv >= 2 ? 4 : 0) + (lv >= 5 ? 6 : 0)) * S().damageMul;
      const pr = lv >= 5 ? 1 : 0;
      for (let i = d.drones.length - 1; i >= 0; i--) {
        const dr = d.drones[i]; dr.t -= dt;
        if (dr.t <= 0) { d.drones.splice(i, 1); continue; }
        dr.fireT -= dt;
        if (dr.fireT <= 0) {
          const tgt = nearestEnemy(dr.x, dr.y, 520 * WRANGE);
          if (tgt) {
            dr.fireT = fireCd;
            const a = angTo(dr.x, dr.y, tgt.x, tgt.y), spd = 600 * S().projSpeedMul;
            firePlayerProjectile({ x: dr.x, y: dr.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5, dmg, pierce: pr, life: 1.1 * WRANGE * S().projDurMul, color: CY, hit: new Set(), trail: 1 });
            if (Math.random() < 0.25) sfx('shoot');
          } else dr.fireT = 0.2;
        }
      }
      d.t -= dt;
      const cd = 2.2 / S().attackSpeedMul;
      if (d.t <= 0 && d.drones.length < maxD) {
        d.t = cd;
        const a = rand(0, TAU), rr = rand(30, 70);
        d.drones.push({ x: player.x + Math.cos(a) * rr, y: player.y + Math.sin(a) * rr, t: lifeT, fireT: rand(0, 0.3) });
      }
    },
    draw(self) {
      if (!self.data) return;
      for (const dr of self.data.drones) {
        glow(dr.x, dr.y, 12, CY, 0.7);
        ctx.strokeStyle = rgba(CY, 0.9); ctx.lineWidth = 2;
        poly(dr.x, dr.y, 7, 4, Math.PI / 4 + G.time * 0.5); ctx.stroke();
      }
    }
  },

  /* ---- Thunderstorm : random lightning strikes ---- */
  storm: {
    name: 'Thunderstorm', icon: '☇', color: BL, max: 8,
    info(l) {
      const m = ['Calls lightning strikes around you.',
        '+1 strike.', '+damage.', 'Faster storm.',
        '+2 strikes.', '+damage &amp; AoE.', 'Faster storm.',
        'Maelstrom: +2 strikes.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.5 - (lv >= 4 ? 0.4 : 0) - (lv >= 7 ? 0.3 : 0)) / S().attackSpeedMul;   // lv7 card says "Faster storm" — now true (was a dead level)
      if (self.t > 0) return;
      self.t = cd;
      const strikes = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 2 : 0) + (lv >= 8 ? 2 : 0);
      const dmg = (26 + (lv >= 3 ? 12 : 0) + (lv >= 6 ? 16 : 0)) * S().damageMul;
      const aoe = (70 + (lv >= 6 ? 40 : 0)) * S().areaMul;
      const reach = viewRadius() * WRANGE;
      const near = (Math.random() < 0.75) ? nearestEnemies(player.x, player.y, 10) : null;
      for (let s = 0; s < strikes; s++) {
        let tx, ty;
        let e = near && near.length ? pick(near) : null;
        if (e && dist2(player.x, player.y, e.x, e.y) > reach * reach) e = null;   // strikes respect reach
        if (e) { tx = e.x + rand(-30, 30); ty = e.y + rand(-30, 30); }
        else { const a = rand(0, TAU), r2 = rand(60, reach); tx = player.x + Math.cos(a) * r2; ty = player.y + Math.sin(a) * r2; }
        grid.query(tx, ty, aoe, _wq);
        for (let j = 0; j < _wq.length; j++) { const en = _wq[j]; if (en.dead) continue; if (dist2(tx, ty, en.x, en.y) < (aoe + en.r) ** 2) { damageEnemy(en, dmg, { color: BL }); en.vx *= 0.5; en.vy *= 0.5; } }
        G.arcs.push({ pts: [{ x: tx, y: ty - Math.min(H, 520) }, { x: tx, y: ty }], life: 0.2, max: 0.2, color: BL });
        G.particles.push({ x: tx, y: ty, vx: 0, vy: 0, r: 6, mr: aoe, life: 0.3, max: 0.3, color: BL, kind: 'ring' });
      }
      sfx('zap');
    }
  },

  /* ---- Prism Ray : beam that splits toward other foes ---- */
  prismbeam: {
    name: 'Prism Ray', icon: '✴', color: CY, max: 8,
    info(l) {
      const m = ['A beam that splits toward other foes.',
        'Wider beam.', '+damage.', 'Faster firing.',
        '+1 split beam.', 'Wider beam.', '+range.',
        'Refraction: +damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.3 - (lv >= 4 ? 0.35 : 0) - (lv >= 8 ? 0.2 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      const first = nearestEnemy(player.x, player.y, 1100 * WRANGE);
      if (!first) { self.t = 0.2; return; }
      self.t = cd;
      const len = (560 + (lv >= 7 ? 180 : 0)) * S().areaMul * WRANGE;
      const wid = (12 + (lv >= 2 ? 5 : 0) + (lv >= 6 ? 6 : 0)) * Math.sqrt(S().areaMul);
      const dmg = (24 + (lv >= 3 ? 12 : 0) + (lv >= 8 ? 16 : 0)) * S().damageMul;
      const subN = 2 + (lv >= 5 ? 1 : 0);
      const hitBeam = (x1, y1, x2, y2, w, dm) => {
        grid.query((x1 + x2) / 2, (y1 + y2) / 2, dist(x1, y1, x2, y2) / 2 + 60, _wq);
        for (let j = 0; j < _wq.length; j++) { const e = _wq[j]; if (e.dead) continue; if (segDist(x1, y1, x2, y2, e.x, e.y) < w / 2 + e.r) damageEnemy(e, dm, { color: CY }); }
        G.beams.push({ x1, y1, x2, y2, w, life: 0.16, max: 0.16, color: CY });
      };
      const a0 = angTo(player.x, player.y, first.x, first.y);
      hitBeam(player.x, player.y, player.x + Math.cos(a0) * len, player.y + Math.sin(a0) * len, wid, dmg);
      const others = nearestEnemies(first.x, first.y, subN + 1).filter(e => e !== first).slice(0, subN);
      for (const t of others) {
        const a = angTo(first.x, first.y, t.x, t.y);
        hitBeam(first.x, first.y, first.x + Math.cos(a) * len * 0.7, first.y + Math.sin(a) * len * 0.7, wid * 0.8, dmg * 0.7);
      }
      G.shake = Math.min(1, G.shake + 0.05);
      sfx('laser');
    }
  },

  /* ---- Pulsar : orbiting orb that emits shockwaves ---- */
  pulsar: {
    name: 'Pulsar', icon: '❂', color: MA, max: 7,
    info(l) {
      const m = ['An orb orbits you, pulsing shockwaves.',
        '+damage.', 'Bigger waves.', '+1 orb.',
        'Faster pulses.', 'Bigger waves &amp; damage.', 'Quasar: +1 orb.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      if (!self.data) self.data = { ang: 0, t: 0, positions: [] };
      const d = self.data;
      const orbs = 1 + (lv >= 4 ? 1 : 0) + (lv >= 7 ? 1 : 0);
      const orbitR = 62 * Math.sqrt(S().areaMul);
      d.ang += dt * 1.6;
      d.positions = [];
      for (let i = 0; i < orbs; i++) { const a = d.ang + i / orbs * TAU; d.positions.push({ x: player.x + Math.cos(a) * orbitR, y: player.y + Math.sin(a) * orbitR }); }
      d.t -= dt;
      const cd = (1.8 - (lv >= 5 ? 0.5 : 0)) / S().attackSpeedMul;
      const waveR = (120 + (lv >= 3 ? 50 : 0) + (lv >= 6 ? 70 : 0)) * S().areaMul * WRANGE;
      const dmg = (22 + (lv >= 2 ? 10 : 0) + (lv >= 6 ? 16 : 0)) * S().damageMul;
      if (d.t <= 0) {
        d.t = cd;
        for (const p of d.positions) {
          G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 8, mr: waveR, life: 0.5, max: 0.5, color: MA, kind: 'ring' });
          grid.query(p.x, p.y, waveR, _wq);
          for (let j = 0; j < _wq.length; j++) { const e = _wq[j]; if (e.dead) continue; if (dist2(p.x, p.y, e.x, e.y) < (waveR + e.r) ** 2) damageEnemy(e, dmg, { kbx: e.x - p.x, kby: e.y - p.y, kb: 160, color: MA }); }
        }
        sfx('nova');
      }
    },
    draw(self) {
      if (!self.data || !self.data.positions) return;
      for (const p of self.data.positions) glow(p.x, p.y, 14, MA, 0.85);
    }
  },
};
function segDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
const WEAPON_IDS = Object.keys(WEAPONS);
// Balance lever: max simultaneous weapons a run can hold. Raised 6 -> 7 so the
// larger weapon pool gives more build variety.
const MAX_WEAPONS = 7;

function addWeapon(id) { player.weapons.push({ id, level: 1, t: 0, data: null }); }
function hasWeapon(id) { return player.weapons.some(w => w.id === id); }

/* ===========================================================================
   8. PASSIVES
   ========================================================================= */
const PASSIVES = {
  vigor:    { name: 'Vigor',     icon: '❤', color: RD, max: 9, desc: '+25 Max HP (and heal).',    apply() { S().maxHpBonus += 25; player.maxHp = 100 + S().maxHpBonus; player.hp += 25; } },
  swift:    { name: 'Swift',     icon: '🪽', color: CY, max: 9, desc: '+9% Move speed.',           apply() { S().moveSpeedMul *= 1.09; } },
  power:    { name: 'Overcharge',icon: '🔺', color: MA, max: 11, desc: '+13% Damage.',              apply() { S().damageMul *= 1.13; } },
  haste:    { name: 'Haste',     icon: '⏱', color: YE, max: 10, desc: '+11% Attack speed.',        apply() { S().attackSpeedMul *= 1.11; } },
  expanse:  { name: 'Expanse',   icon: '🔮', color: PU, max: 9, desc: '+13% Area of effect.',      apply() { S().areaMul *= 1.13; } },
  velocity: { name: 'Velocity',  icon: '➹', color: GR, max: 8, desc: '+16% Projectile speed.',    apply() { S().projSpeedMul *= 1.16; S().projDurMul *= 1.08; } },
  magnet:   { name: 'Magnet',    icon: '🧲', color: BL, max: 8, desc: '+38% Pickup range.',        apply() { S().pickup *= 1.38; } },
  greed:    { name: 'Greed',     icon: '💎', color: GR, max: 9, desc: '+16% XP gain.',             apply() { S().xpGain *= 1.16; } },
  regen:    { name: 'Regen',     icon: '✚', color: GR, max: 9, desc: '+0.7 HP / sec.',            apply() { S().regen += 0.7; } },
  armor:    { name: 'Plating',   icon: '🛡', color: BL, max: 9, desc: '+2 Armor (flat soak).',     apply() { S().armor += 2; } },
  focus:    { name: 'Focus',     icon: '🎯', color: OR, max: 9, desc: '+8% Crit, +0.3 crit mult.', apply() { S().crit += 0.08; S().critMult += 0.3; } },
  luck:     { name: 'Fortune',   icon: '🍀', color: YE, max: 7, desc: 'Extra rerolls &amp; better upgrade choices.', apply() { S().luck += 1; G.rerolls += 1; } },
};
const PASSIVE_IDS = Object.keys(PASSIVES);

function recalc() { player.maxHp = 100 + S().maxHpBonus; }

/* ===========================================================================
   9. UPGRADE CARDS
   ========================================================================= */
const cardsEl = document.getElementById('cards');
const lvlNumEl = document.getElementById('lvlNum');
const rerollCountEl = document.getElementById('rerollCount');
const btnReroll = document.getElementById('btnReroll');

function buildChoices() {
  const pool = [];
  // owned weapon upgrades
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (w.level < def.max) pool.push({ kind: 'weapon-up', id: w.id, weight: 10 });
  }
  // new weapons
  if (player.weapons.length < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) if (!hasWeapon(id))
      pool.push({ kind: 'weapon-new', id, weight: 9 + S().luck * 0.5 });
  }
  // passives
  for (const id of PASSIVE_IDS) {
    const lv = player.passives[id] || 0;
    if (lv < PASSIVES[id].max) pool.push({ kind: 'passive', id, weight: 7 });
  }
  // weighted pick of 3 distinct
  const chosen = [];
  const work = pool.slice();
  for (let n = 0; n < 3 && work.length; n++) {
    let total = 0; for (const o of work) total += o.weight;
    let r = rand(0, total), idx = 0;
    for (let i = 0; i < work.length; i++) { r -= work[i].weight; if (r <= 0) { idx = i; break; } }
    chosen.push(work.splice(idx, 1)[0]);
  }
  // Early-run variety guarantee (Section B): the first several level-ups always
  // offer a real build choice — at least one weapon option AND one passive, and
  // very early also one NEW weapon — so survival never hinges on high-rolling
  // one specific card.
  if (player.level <= CARD_VARIETY_LEVELS && chosen.length === 3) {
    const isWeapon = c => c.kind === 'weapon-new' || c.kind === 'weapon-up';
    const swapIn = (pred, keep) => {
      if (chosen.some(pred)) return;
      const opts = pool.filter(o => pred(o) && !chosen.includes(o));
      if (!opts.length) return;
      for (let i = chosen.length - 1; i >= 0; i--) {
        if (keep(chosen[i])) continue;
        chosen[i] = pick(opts); return;
      }
    };
    swapIn(isWeapon, () => false);
    swapIn(c => c.kind === 'passive', c => isWeapon(c) && chosen.filter(isWeapon).length <= 1);
    if (player.level <= CARD_NEW_WEAPON_LEVELS && player.weapons.length < MAX_WEAPONS) {
      swapIn(c => c.kind === 'weapon-new',
             c => (c.kind === 'passive' && chosen.filter(x => x.kind === 'passive').length <= 1));
    }
  }
  // fallbacks if everything is maxed
  while (chosen.length < 3) chosen.push({ kind: 'bonus', id: 'bonus' });
  return chosen;
}
// Through this level, card offers guarantee a weapon + passive mix; through the
// lower one they also guarantee a NEW weapon offer when one exists.
const CARD_VARIETY_LEVELS = 6;
const CARD_NEW_WEAPON_LEVELS = 4;

function cardData(c) {
  // info() arrays are authored as m[newLevel-1] ("what reaching level N gives"),
  // so pass newLevel-1. v1.x passed newLevel — every weapon card described the
  // NEXT level's bonus (the reported "card claims an extra ball, levels only
  // add area" bug). Fixed in v2.
  if (c.kind === 'weapon-new') { const d = WEAPONS[c.id]; return { icon: d.icon, name: d.name, color: d.color, type: 'New Weapon', desc: d.info(0), level: 0, max: d.max, isNew: true }; }
  if (c.kind === 'weapon-up')  { const d = WEAPONS[c.id]; const w = player.weapons.find(w => w.id === c.id); return { icon: d.icon, name: d.name, color: d.color, type: 'Weapon · Lv ' + (w.level + 1), desc: d.info(w.level), level: w.level, max: d.max }; }
  if (c.kind === 'passive')    { const d = PASSIVES[c.id]; const lv = player.passives[c.id] || 0; return { icon: d.icon, name: d.name, color: d.color, type: 'Passive · Lv ' + (lv + 1), desc: d.desc, level: lv, max: d.max }; }
  return { icon: '✨', name: 'Power Surge', color: WH, type: 'Bonus', desc: '+8% damage &amp; full heal.', level: 0, max: 0 };
}

function renderCards() {
  lvlNumEl.textContent = player.level;
  cardsEl.innerHTML = '';
  G.choices.forEach((c, i) => {
    const d = cardData(c);
    const el = document.createElement('div');
    el.className = 'card';
    el.style.setProperty('--cc', d.color);
    el.dataset.index = i;
    let pips = '';
    if (d.max) { for (let p = 0; p < d.max; p++) pips += `<span class="pip ${p < d.level ? 'on' : ''}"></span>`; }
    el.innerHTML =
      `${d.isNew ? '<span class="newtag">NEW</span>' : ''}` +
      `<span class="keyhint">${i + 1}</span>` +
      `<div class="cicon">${d.icon}</div>` +
      `<div class="ctype">${d.type}</div>` +
      `<div class="cname">${d.name}</div>` +
      `<div class="cdesc">${d.desc}</div>` +
      `<div class="pips">${pips}</div>`;
    cardsEl.appendChild(el);
  });
  G.selIndex = 0; highlightCard();
  rerollCountEl.textContent = G.rerolls;
  btnReroll.disabled = G.rerolls <= 0;
}
function highlightCard() {
  [...cardsEl.children].forEach((el, i) => el.classList.toggle('kbsel', i === G.selIndex));
}
cardsEl.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (card) chooseCard(+card.dataset.index);
});
cardsEl.addEventListener('mousemove', e => {
  const card = e.target.closest('.card');
  if (card) { const i = +card.dataset.index; if (i !== G.selIndex) { G.selIndex = i; highlightCard(); sfx('hover'); } }
});

function applyChoice(c) {
  if (c.kind === 'weapon-new') addWeapon(c.id);
  else if (c.kind === 'weapon-up') { const w = player.weapons.find(w => w.id === c.id); w.level++; }
  else if (c.kind === 'passive') { player.passives[c.id] = (player.passives[c.id] || 0) + 1; PASSIVES[c.id].apply(); }
  else { S().damageMul *= 1.08; player.hp = player.maxHp; }
  recalc();
}
function chooseCard(i) {
  if (G.state !== 'levelup' || !G.choices[i]) return;
  applyChoice(G.choices[i]);
  sfx('select');
  G.pendingLevels--;
  if (G.pendingLevels > 0) openLevelUp();
  else { hideOverlays(); G.state = 'playing'; }
}
function doReroll() {
  if (G.rerolls <= 0) return;
  G.rerolls--;
  G.choices = buildChoices();
  renderCards();
  sfx('select');
}
btnReroll.addEventListener('click', doReroll);

function openLevelUp() {
  G.state = 'levelup';
  G.choices = buildChoices();
  renderCards();
  showOverlay('levelup');
  if (Sound) Sound.setMusicTempo(118);
}

/* ===========================================================================
   10. ENEMIES + SPAWN DIRECTOR
   ========================================================================= */
const ETYPES = {
  grunt:    { hp: 17, speed: 64,  r: 13, dmg: 8,  xp: 1, color: MA, shape: 'diamond' },
  rusher:   { hp: 11, speed: 158, r: 10, dmg: 7,  xp: 1, color: CY, shape: 'tri' },
  orbiter:  { hp: 20, speed: 116, r: 11, dmg: 8,  xp: 2, color: YE, shape: 'circle' },
  splitter: { hp: 30, speed: 66,  r: 17, dmg: 9,  xp: 2, color: GR, shape: 'square' },
  shooter:  { hp: 24, speed: 58,  r: 13, dmg: 10, xp: 3, color: PU, shape: 'penta' },
  tank:     { hp: 95, speed: 44,  r: 25, dmg: 16, xp: 5, color: OR, shape: 'hex' },
  bomber:   { hp: 26, speed: 124, r: 15, dmg: 20, xp: 3, color: RD, shape: 'spiky' },
  mini:     { hp: 8,  speed: 96,  r: 9,  dmg: 6,  xp: 1, color: GR, shape: 'square' },
  // ---- v1.3 enemies (behaviour lives in EBEHAVIOR; shapes already in drawShapeFor) ----
  weaver:     { hp: 15,  speed: 150, r: 11, dmg: 8,  xp: 2,  color: CY, shape: 'tri' },
  shielder:   { hp: 70,  speed: 58,  r: 16, dmg: 12, xp: 4,  color: BL, shape: 'penta' },
  mender:     { hp: 42,  speed: 72,  r: 14, dmg: 8,  xp: 4,  color: GR, shape: 'circle' },
  charger:    { hp: 34,  speed: 70,  r: 14, dmg: 16, xp: 3,  color: OR, shape: 'tri' },
  lancer:     { hp: 30,  speed: 60,  r: 13, dmg: 12, xp: 4,  color: PU, shape: 'penta' },
  hatcher:    { hp: 52,  speed: 50,  r: 18, dmg: 10, xp: 4,  color: GR, shape: 'spiky' },
  phantom:    { hp: 24,  speed: 90,  r: 11, dmg: 10, xp: 3,  color: PU, shape: 'diamond' },
  reflector:  { hp: 44,  speed: 64,  r: 14, dmg: 10, xp: 5,  color: CY, shape: 'hex' },
  detonator:  { hp: 40,  speed: 100, r: 16, dmg: 22, xp: 4,  color: RD, shape: 'spiky' },
  disruptor:  { hp: 35,  speed: 80,  r: 14, dmg: 8,  xp: 4,  color: MA, shape: 'circle' },
  saw:        { hp: 50,  speed: 80,  r: 16, dmg: 14, xp: 4,  color: YE, shape: 'spiky' },
  juggernaut: { hp: 220, speed: 50,  r: 30, dmg: 24, xp: 12, color: OR, shape: 'hex' },
  // ARCHITECT rune node (Section D): destructible orbiting part; stats come
  // from ARCH_NODE_* via spawn opts (fixed difficulty, no time scaling).
  archnode:   { hp: 1000, speed: 0,  r: 20, dmg: 14, xp: 0,  color: PU, shape: 'penta',
                noMercy: true, noLevel: true, noSeparation: true },   // fixed stats, orbit-locked
};

// Late-game difficulty curve. HP ramps hard past ~4 min (cubic term); speed is
// capped; damage is linear. NOTE: these constants will be retuned once
// meta-progression exists.
const DIFF_HP_LIN = 0.7, DIFF_HP_SQ = 0.07, DIFF_HP_CUBE = 0.004;
const DIFF_SPEED_LIN = 0.05, DIFF_SPEED_MAX = 1.95;
const DIFF_DMG_LIN = 0.28;
function diffScale() {
  const m = G.time / 60;
  return {
    hp: 1 + m * DIFF_HP_LIN + m * m * DIFF_HP_SQ + m * m * m * DIFF_HP_CUBE,
    speed: Math.min(DIFF_SPEED_MAX, 1 + m * DIFF_SPEED_LIN),
    dmg: 1 + m * DIFF_DMG_LIN,
  };
}

/* ---- v2 ENEMY LEVELS (Section E): stays 1 through the early game; starts
   rising after the first full boss cycle OR a time threshold, whichever comes
   first. Levels >= 2 show a small badge; level 1 shows nothing. ---- */
const ENEMY_LV_START_TIER = 1;     // unlock after this many completed boss cycles...
const ENEMY_LV_START_TIME = 480;   // ...or after this many seconds, whichever first
const ENEMY_LV_PER_MIN = 0.5;      // levels gained per minute past the unlock point
const ENEMY_LV_MAX = 9;
const ENEMY_LV_HP = 0.35;          // +hp per level above 1
const ENEMY_LV_DMG = 0.18;         // +dmg per level above 1
const ENEMY_LV_SPEED = 0.04;       // +speed per level above 1
const ENEMY_LV_XP = 0.30;          // +xp per level above 1
function currentEnemyLevel() {
  if (G.lvUnlockAt === null) return 1;
  return clamp(1 + Math.floor((G.time - G.lvUnlockAt) / 60 * ENEMY_LV_PER_MIN), 1, ENEMY_LV_MAX);
}

const ENEMY_SPAWNIN_T = 0.35;   // s scale/fade-in when an enemy materializes (Section J)

function spawnEnemy(type, x, y, opts) {
  if (G.enemies.length >= MAX_ENEMIES) return null;
  const base = ETYPES[type];
  const d = diffScale();
  const e = {
    id: enemyId++, type, x, y, vx: 0, vy: 0,
    r: base.r, color: base.color, shape: base.shape,
    hp: base.hp * d.hp, maxHp: base.hp * d.hp,
    speed: base.speed * d.speed, dmg: base.dmg * d.dmg, xp: base.xp,
    flash: 0, dead: false, slow: 1, fireT: rand(0, 1.5),
    rot: rand(0, TAU), elite: false, boss: false, spawn: ENEMY_SPAWNIN_T,
    noSep: !!base.noSeparation,
  };
  if (opts) Object.assign(e, opts);
  // Adaptive mercy: when the hidden director says the player is struggling,
  // fresh normals arrive slightly weaker. Bosses and fixed-stat parts
  // (archnodes) are NEVER softened.
  if (!e.boss && !base.noMercy && G.dirIntensity < 1) {
    const ease = 1 - DIR_STRENGTH_EASE * (1 - G.dirIntensity) / (1 - DIR_INTENSITY_MIN);
    e.hp *= ease; e.maxHp = e.hp; e.dmg *= ease;
  }
  // enemy levels (Section E): late-game normals arrive leveled-up
  if (!e.boss && !base.noLevel) {
    e.lv = currentEnemyLevel();
    if (e.lv > 1) {
      const k = e.lv - 1;
      e.hp *= 1 + k * ENEMY_LV_HP; e.maxHp = e.hp;
      e.dmg *= 1 + k * ENEMY_LV_DMG;
      e.speed *= 1 + k * ENEMY_LV_SPEED;
      e.xp = Math.round(e.xp * (1 + k * ENEMY_LV_XP));
    }
  }
  if (e.elite) { e.r *= 1.5; e.hp *= 4; e.maxHp = e.hp; e.xp *= 6; e.dmg *= 1.3; }
  G.enemies.push(e);
  return e;
}

function spawnRingPosition() {
  const a = rand(0, TAU);
  // stressed players get a touch more breathing room (spawns land further out);
  // camZoom widens the visible area, so the off-screen ring widens with it
  const d = viewRadius() + rand(60, 200) + G.dirStress * DIR_STRESS_SPACE;
  let x = player.x + Math.cos(a) * d;
  let y = player.y + Math.sin(a) * d;
  const lim = ARENA / 2 - 30;
  x = clamp(x, -lim, lim); y = clamp(y, -lim, lim);
  return { x, y };
}

function pickEnemyType(m) {
  const w = [
    ['grunt', 10],
    ['rusher', m > 0.3 ? 5 + m * 1.5 : 0],
    ['orbiter', m > 1 ? m * 1.6 : 0],
    ['splitter', m > 1.5 ? m * 1.1 : 0],
    ['shooter', m > 2 ? m * 0.9 : 0],
    ['tank', m > 2.5 ? m * 0.6 : 0],
    ['bomber', m > 3 ? m * 0.8 : 0],
    // ---- v1.3 enemies, time-gated so they appear as the run escalates ----
    ['weaver', m > 0.5 ? 3 + m * 1.2 : 0],
    ['shielder', m > 1.5 ? m * 0.8 : 0],
    ['charger', m > 1.5 ? m * 0.9 : 0],
    ['mender', m > 2 ? m * 0.5 : 0],
    ['hatcher', m > 2 ? m * 0.5 : 0],
    ['lancer', m > 2.5 ? m * 0.7 : 0],
    ['saw', m > 2.5 ? m * 0.7 : 0],
    ['phantom', m > 3 ? m * 0.6 : 0],
    ['reflector', m > 3 ? m * 0.6 : 0],
    ['detonator', m > 3.5 ? m * 0.55 : 0],
    ['disruptor', m > 3.5 ? m * 0.5 : 0],
    ['juggernaut', m > 4 ? 0.6 + m * 0.15 : 0],
  ];
  let total = 0; for (const e of w) total += e[1];
  let r = rand(0, total);
  for (const e of w) { r -= e[1]; if (r <= 0) return e[0]; }
  return 'grunt';
}

/* ---- v2 ADAPTIVE DIRECTOR (hidden hybrid: RE4 rank + L4D director) ----
   Baseline: a gentle time curve (much calmer early game than v1.5).
   Adaptive layer: a hidden intensity from player power (weapon levels,
   damageMul, rolling clear rate) minus stress (recent damage taken, low HP).
   Weak/struggling -> fewer + slightly weaker spawns, spawned further out;
   strong/safe -> pressure climbs. Governs BETWEEN-boss farming windows only;
   bosses are NEVER softened by it. All weights are named for playtesting. */
const DIR_INTERVAL_BASE  = 1.65;   // s between spawn ticks at t=0 (was 1.05)
const DIR_INTERVAL_SLOPE = 0.09;   // interval shrinks this much per minute
const DIR_INTERVAL_MIN   = 0.30;   // hard floor (was 0.14)
const DIR_BATCH_RATE     = 0.55;   // batch growth per minute (was 1.0)
const DIR_PACK_CHANCE    = 0.08;   // pack-burst chance per tick (was 0.12)
const DIR_PACK_BASE      = 4;      // pack size base (was 6 + minutes)
const DIR_POWER_WLV      = 0.030;  // power per total weapon level
const DIR_POWER_DMG      = 0.25;   // power per damageMul above 1
const DIR_POWER_KPS      = 0.055;  // power per kill/sec (rolling)
const DIR_STRESS_HP      = 0.90;   // stress per missing-HP fraction
const DIR_STRESS_DPS     = 0.05;   // stress per damage-taken/sec (rolling)
const DIR_KPS_HALFLIFE   = 6;      // s half-life of the kill-rate window
const DIR_DPS_HALFLIFE   = 8;      // s half-life of the damage-taken window
const DIR_SIGNAL_LERP    = 0.35;   // per-second smoothing toward the target
const DIR_INTENSITY_MIN  = 0.55;   // throttle floor when struggling
const DIR_INTENSITY_MAX  = 1.65;   // pressure ceiling when thriving
const DIR_STRENGTH_EASE  = 0.30;   // up to -30% spawn hp/dmg at full mercy
const DIR_STRESS_SPACE   = 140;    // extra spawn-ring distance at full stress
const BOMB_RAMP_TIME     = 25;     // s for spawns to re-ramp after a bomb
const ELITE_BASE_CHANCE  = 0.02;
const ELITE_TIME_SCALE   = 0.004;
const ELITE_CHANCE_MAX   = 0.07;
function director(dt) {
  const m = G.time / 60;

  // hidden signals (decay-windowed counters -> rates)
  G.dirKps *= Math.exp(-dt * Math.LN2 / DIR_KPS_HALFLIFE);
  G.dirDps *= Math.exp(-dt * Math.LN2 / DIR_DPS_HALFLIFE);
  let wlv = 0; for (const w of player.weapons) wlv += w.level;
  const kps = G.dirKps * Math.LN2 / DIR_KPS_HALFLIFE;
  const dps = G.dirDps * Math.LN2 / DIR_DPS_HALFLIFE;
  const power  = wlv * DIR_POWER_WLV + Math.max(0, S().damageMul - 1) * DIR_POWER_DMG + kps * DIR_POWER_KPS;
  const stress = (1 - clamp(player.hp / player.maxHp, 0, 1)) * DIR_STRESS_HP + dps * DIR_STRESS_DPS;
  const target = clamp(1 + power - stress, DIR_INTENSITY_MIN, DIR_INTENSITY_MAX);
  G.dirIntensity = lerp(G.dirIntensity, target, Math.min(1, DIR_SIGNAL_LERP * dt));
  G.dirStress = clamp(stress, 0, 1);

  // Normal waves — skipped entirely while a boss is alive (v2: every boss owns
  // the arena; it may still summon its own minions via spawnEnemy).
  if (!G.boss) {
    G.spawnTimer -= dt;
    const interval = clamp(DIR_INTERVAL_BASE - m * DIR_INTERVAL_SLOPE, DIR_INTERVAL_MIN, DIR_INTERVAL_BASE);
    if (G.spawnTimer <= 0) {
      G.spawnTimer = interval;
      const pressure = G.dirIntensity * G.spawnRamp;
      let batch = Math.round((1 + m * DIR_BATCH_RATE) * pressure);
      if (G.spawnRamp > 0.2) batch = Math.max(1, batch);
      if (G.dirIntensity > 1.05 && Math.random() < 0.2) batch += 2;   // spikes only when thriving
      for (let i = 0; i < batch; i++) {
        const p = spawnRingPosition();
        const t = pickEnemyType(m);
        const elite = m > 1.5 && Math.random() < Math.min(ELITE_CHANCE_MAX, ELITE_BASE_CHANCE + m * ELITE_TIME_SCALE);
        spawnEnemy(t, p.x, p.y, elite ? { elite: true } : null);
      }
      // occasional pack burst — only while the player isn't being buried
      if (m > 1 && pressure > 0.9 && Math.random() < DIR_PACK_CHANCE) {
        const p = spawnRingPosition();
        const t = pickEnemyType(m);
        for (let i = 0; i < DIR_PACK_BASE + Math.floor(m * 0.8); i++)
          spawnEnemy(t, p.x + rand(-60, 60), p.y + rand(-60, 60), null);
      }
    }
  }
  // boss cadence: bosses are the main event. The next one is scheduled when
  // the current one dies (killEnemy sets nextBossAt = time + BOSS_FARM_WINDOW).
  // The ARCHITECT ritual owns the arena: no roster boss may interrupt it.
  if (!G.boss && !G.ritual && G.time >= G.nextBossAt) spawnBoss();
}

/* ===========================================================================
   BOSS SYSTEM — registry + spawn + brain (replaces the old inline OVERLORD).
   Every boss: {id,name,color,r,speed,hpMul,drop,phaseThresholds,update(e,dt),
   draw(e),onPhase?(e,phase)}. The boss enemy carries e.bdef/e.data/e.phase.
   v2: bosses come from a shuffled bag (no repeats per cycle); every boss
   suppresses normal spawns and sweeps the arena on arrival; when the bag
   refills, bossTier++ and bosses return stronger.
   ========================================================================= */
const BOSS_IDS = ['overlord', 'prism', 'hive', 'glitch', 'conductor', 'warden'];
// v2 boss-rush: a shuffled bag picks the next boss — no repeats within a cycle
// and OVERLORD has no guaranteed intro slot. Scaling comes from ELAPSED TIME +
// completed cycles (tier), never a per-boss difficulty rank, so a "hard" boss
// drawn early is fair and any boss drawn late is appropriately tougher.
const BOSS_BASE_HP        = 950;   // calibrated: opening duel beatable with the starting weapon
const BOSS_HP_PER_MIN     = 0.55;  // +HP per elapsed minute
const BOSS_HP_PER_TIER    = 0.85;  // +HP per completed bag cycle
const BOSS_DMG_BASE       = 18;
const BOSS_DMG_PER_MIN    = 0.10;
const BOSS_DMG_PER_TIER   = 0.25;
const BOSS_SPEED_PER_TIER = 0.08;
const BOSS_SPEED_PER_MIN  = 0.05;  // restores the v1 time scaling speed had...
const BOSS_SPEED_TIME_CAP = 1.6;   // ...capped so late bosses stay dodgeable
const BOSS_XP_LEVELS      = 5;     // a roster boss pays out ~5 level-ups of XP
const BOSS_GEM_COUNT      = 26;    // ...as a burst of this many gems
const BOSS_BANNER_T       = 2.4;   // s the WARNING banner stays up
const BOSS_SWEEP_HITSTOP  = 0.10, BOSS_SWEEP_SHAKE = 0.9;
const BOSS_PHASE_SHAKE = 0.4;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// attack damage as fractions of the boss's own (already diff-scaled) e.dmg
const B_BULLET = 0.5, B_BEAM = 0.8, B_NOVA = 0.9;

function bossRing(e, n, speed, dmgFrac, rot, color, opts) {
  for (let k = 0; k < n; k++) {
    const a = rot + k / n * TAU;
    spawnEnemyProjectile(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, e.dmg * dmgFrac, color, opts);
  }
}
function countType(t) { let n = 0; for (const e of G.enemies) if (e.type === t && !e.dead) n++; return n; }

// Boss arrival: the existing swarm is DISINTEGRATED in a spectacular shockwave
// — per-enemy bursts, expanding rings, flash, hitstop — never silently deleted.
// Swept enemies yield nothing (no gems/children). Runs BEFORE the boss spawns
// so the enemy cap can never block the boss itself.
function bossSweepArena(x, y, color) {
  let swept = 0;
  const keep = [];
  for (const o of G.enemies) {
    if (o.boss || o.dead) { keep.push(o); continue; }
    o.dead = true; swept++;
    spawnRing(o.x, o.y, 4, o.r * 3, 0.5, o.color);   // budget-capped: a 300-strong sweep must not blow the particle pool
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU), s = rand(80, 380);
      spawnParticle(o.x, o.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), rand(2, 4), o.color, 'spark');
    }
  }
  // remove swept enemies NOW (same array object) so the enemy cap can never
  // block the boss spawn that follows
  G.enemies.length = 0;
  for (const o of keep) G.enemies.push(o);
  G.eProj.length = 0;
  for (let k = 0; k < 3; k++)
    spawnRing(x, y, 40, 900 + k * 350, 0.7 + k * 0.15, k % 2 ? WH : color);
  if (swept) {
    sfx('bigExplode');
    G.hitstop = Math.max(G.hitstop, BOSS_SWEEP_HITSTOP);
    G.shake = Math.min(1, G.shake + BOSS_SWEEP_SHAKE);
    G.flash = Math.max(G.flash, 0.45); G.flashColor = WH;
  }
}

function spawnBoss(forcedId) {
  if (!G.bossBag.length) {
    G.bossBag = shuffle(BOSS_IDS.slice());
    if (G.bossNum > 0) G.bossTier++;          // full cycle completed -> tier up
  }
  const id = forcedId || G.bossBag.pop();
  const def = BOSSES[id];
  const p = spawnRingPosition();
  const mins = G.time / 60;
  bossSweepArena(p.x, p.y, def.color);        // clear the field first (frees cap room)
  const hp = BOSS_BASE_HP * (def.hpMul || 1) * (1 + mins * BOSS_HP_PER_MIN + G.bossTier * BOSS_HP_PER_TIER);
  const e = spawnEnemy('tank', p.x, p.y, {
    boss: true, r: def.r, color: def.color, shape: 'boss',
    hp, maxHp: hp,
    speed: def.speed * Math.min(BOSS_SPEED_TIME_CAP, 1 + mins * BOSS_SPEED_PER_MIN) * (1 + G.bossTier * BOSS_SPEED_PER_TIER),
    dmg: BOSS_DMG_BASE * (1 + mins * BOSS_DMG_PER_MIN + G.bossTier * BOSS_DMG_PER_TIER),
    xp: 60 + G.bossNum * 20,
    name: def.name + (G.bossTier > 0 ? ' ' + romanize(G.bossTier + 1) : ''),
    bdef: def, data: {}, phase: 0,
    entrance: BOSS_ENTRANCE_T, phasePause: 0,
  });
  addTelegraph({ kind: 'zone', x: p.x, y: p.y, r: def.r * 2.2, dur: BOSS_ENTRANCE_T, color: def.color });
  G.boss = e;
  G.bossNum++;
  G.bossBanner = { name: e.name, sub: 'THE SWARM SCATTERS — DUEL BEGINS', life: BOSS_BANNER_T, max: BOSS_BANNER_T };
  sfx('boss');
  G.flash = 0.5; G.flashColor = def.color;
  G.shake = 1;
  if (Sound) { Sound.setIntensity(1); Sound.setMusicTempo(126); }
}

/* ---- THE ARCHITECT: summon ritual + spawn (Section D) ---- */
function activateSigil() {
  if (G.sigil !== 1 || G.state !== 'playing' || G.boss || G.ritual) return;
  G.sigil = 2;
  G.ritual = { t: ARCH_RITUAL };
  addTelegraph({ kind: 'zone', x: 0, y: 0, r: ARCH_R * 2.4, dur: ARCH_RITUAL, color: PU });
  G.bossBanner = { name: 'SOMETHING STIRS BEYOND THE SWARM…', life: 3.0, max: 3.0 };
  sfx('boss');
}

function spawnArchitect() {
  bossSweepArena(0, 0, PU);
  const def = BOSSES.architect;
  const e = spawnEnemy('tank', 0, 0, {
    boss: true, r: ARCH_R, color: PU, shape: 'boss',
    hp: ARCH_HP, maxHp: ARCH_HP, speed: ARCH_SPEED, dmg: ARCH_DMG,
    xp: 400, name: def.name, bdef: def, data: {}, phase: 0,
    entrance: ARCH_ENTRANCE, phasePause: 0,
  });
  G.boss = e;
  G.bossBanner = { name: 'THE ARCHITECT', sub: 'THE SWARM SCATTERS — DUEL BEGINS', life: 3.2, max: 3.2 };
  G.flash = 0.6; G.flashColor = PU; G.shake = 1;
  sfx('boss');
  if (Sound) { Sound.setIntensity(1); Sound.setMusicTempo(132); }
}

// Delayed-detonation zones (GLITCH corrupted sectors, ARCHITECT rewrites).
// Ticked from the boss brain AND from the phase-pause breather — a zone's
// telegraph is already on screen, so its countdown must never freeze while
// the boss poses (the warning would vanish before the blast).
function tickZoneList(list, dt, r, e) {
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i]; z.t -= dt;
    if (z.t <= 0) {
      explodeAt(z.x, z.y, r, YE);
      if (dist(z.x, z.y, player.x, player.y) < r + player.r) hurtPlayer(e.dmg * B_BULLET);
      list.splice(i, 1);
    }
  }
}
function tickBossZones(e, dt) {
  tickZoneList(e.data.corZones, dt, GLITCH_CORRUPT_R, e);
  tickZoneList(e.data.sectors, dt, ARCH_SECTOR_R, e);
}

// Called from EBEHAVIOR.boss (movement is still handled by updateEnemies unless a
// def opts into selfMove). Computes phase, runs the shared transition, then the brain.
function updateBoss(e, dt) {
  const fr = e.hp / e.maxHp;
  let ph = 0;
  for (const t of e.bdef.phaseThresholds) if (fr <= t) ph++;
  if (ph > e.phase) {
    e.phase = ph; e.flash = 1;
    // cinematic transition: bullet wipe (readable reset), multi-ring burst,
    // radial sparks, hitstop, and a short attack pause before the new phase
    G.eProj.length = 0;
    e.phasePause = Math.max(e.phasePause || 0, BOSS_PHASE_PAUSE);
    G.hitstop = Math.max(G.hitstop, BOSS_PHASE_HITSTOP);
    for (let k = 0; k < 3; k++)
      spawnRing(e.x, e.y, e.r, e.r * (3 + k * 2), 0.5 + k * 0.12, k % 2 ? WH : e.color);
    for (let k = 0; k < 26; k++) { const a = k / 26 * TAU; spawnParticle(e.x, e.y, Math.cos(a) * rand(150, 420), Math.sin(a) * rand(150, 420), rand(0.4, 0.8), rand(2, 5), e.color, 'spark'); }
    floater(e.x, e.y - e.r - 26, 'PHASE ' + (e.phase + 1), e.color, 22);
    G.flash = Math.max(G.flash, 0.3); G.flashColor = e.color;
    sfx('boss'); G.shake = Math.min(1, G.shake + BOSS_PHASE_SHAKE);
    if (e.bdef.onPhase) e.bdef.onPhase(e, e.phase);
  }
  e.bdef.update(e, dt);
}

/* ---- per-boss tuning (named so the fight is easy to balance) ---- */
const OVL_FIRE = 2.6, OVL_FIRE2 = 2.1, OVL_RINGN = 16, OVL_BSPD = 200, OVL_SUMMON_CD = 6, OVL_SPIRAL_CD = 5.5, OVL_SPIRAL_DUR = 2.5, OVL_SPIRAL_GAP = 0.06, OVL_SPIRAL_SPD = 220;
const PRISM_BEAM_CD = 3.6, PRISM_BEAM_TELE = 0.9, PRISM_BEAM_FIRE = 1.6, PRISM_BEAM_LEN = 1300, PRISM_BEAM_W = 26, PRISM_BEAM_SWEEP = 0.5, PRISM_SPEC_CD = 4, PRISM_BSPD = 170, PRISM_CLONE_CD = 3.5, PRISM_CLONE_DUR = 4;
const HIVE_DRONE_CD = 3.2, HIVE_DRONE_CAP = 26, HIVE_WALL_CD = 4.5, HIVE_WALL_TELE = 0.6, HIVE_WALL_SPD = 150, HIVE_EGG_CD = 3.8, HIVE_BSPD = 150;
const GLITCH_TP_CD = 2.6, GLITCH_BEAM_CD = 4, GLITCH_BEAM_TELE = 0.8, GLITCH_BEAM_FIRE = 0.7, GLITCH_BEAM_W = 150, GLITCH_WAVE_CD = 6, GLITCH_WAVE_R = 240, GLITCH_RAIN_CD = 3, GLITCH_RAIN_TELE = 0.6, GLITCH_RAIN_SPD = 360, GLITCH_HIC_CD = 9;
const CONDUCTOR_BEAT = 0.476, CONDUCTOR_DROP_BARS = 4, CONDUCTOR_DROP_R = 280, CONDUCTOR_BSPD = 200;
const WARDEN_PULL = 78, WARDEN_PULL_R = 540, WARDEN_SPIRAL_GAP = 0.13, WARDEN_SPIRAL_SPD = 160, WARDEN_IMP_CD = 8, WARDEN_IMP_R = 360, WARDEN_WELL_CD = 7, WARDEN_WELL_DUR = 4, WARDEN_WELL_R = 190, WARDEN_WELL_PULL = 120;

/* ---- v2 epic-ness (Section C2): entrances, phase cinematics, new attacks ---- */
const BOSS_ENTRANCE_T = 1.6;       // s materialization (invulnerable, no attacks)
const BOSS_PHASE_HITSTOP = 0.18;   // s frozen time on a phase transition
const BOSS_PHASE_PAUSE = 0.6;      // s of attack silence after a transition
const OVL_COMET_CD = 4.2, OVL_COMET_N = 5, OVL_COMET_SPD = 240;
const OVL_LASER_CD = 7, OVL_LASER_TELE = 0.9, OVL_LASER_DUR = 2.2, OVL_LASER_N = 3, OVL_LASER_W = 20, OVL_LASER_SWEEP = 0.45, OVL_LASER_LEN = 1200;
const PRISM_RAIN_CD = 4.5, PRISM_RAIN_N = 7, PRISM_RAIN_SPD = 330, PRISM_RAIN_TELE = 0.55;
const HIVE_FRENZY_CD = 6, HIVE_FRENZY_T = 2.5, HIVE_FRENZY_MUL = 1.8, HIVE_EGG_SPREAD = 0.5;
const GLITCH_CORRUPT_CD = 5, GLITCH_CORRUPT_N = 4, GLITCH_CORRUPT_R = 110, GLITCH_CORRUPT_TELE = 0.9;
const COND_GAPRING_SPD = 180, COND_GAPRING_N = 36, COND_GAPRING_GAP = 5;
const WARDEN_LANCE_CD = 5, WARDEN_LANCE_N = 3, WARDEN_LANCE_TELE = 0.7, WARDEN_LANCE_SPD = 520;

/* ---- THE ARCHITECT (Section D): voluntary super-boss. Fixed, brutal stats —
   deliberately NOT touched by the adaptive director or build scaling. ---- */
const ARCH_HP = 24000, ARCH_DMG = 30, ARCH_R = 110, ARCH_SPEED = 26;
const ARCH_ENTRANCE = 2.6, ARCH_RITUAL = 4.0;
const ARCH_NODE_N = 4, ARCH_NODE_HP = 1150, ARCH_NODE_DMG = 14, ARCH_NODE_ORBIT = 230, ARCH_NODE_FIRE = 2.4, ARCH_NODE_SPIN = 0.5;
const ARCH_SHIELD_MUL = 0.35;     // core damage taken while any rune node lives
const ARCH_COMET_CD = 3.6, ARCH_COMET_N = 7, ARCH_COMET_SPD = 250;
const ARCH_BEAM_CD = 7, ARCH_BEAM_TELE = 1.0, ARCH_BEAM_DUR = 2.6, ARCH_BEAM_N = 4, ARCH_BEAM_W = 24, ARCH_BEAM_SWEEP = 0.38, ARCH_BEAM_LEN = 1500;
const ARCH_SUMMON_CD = 7.5, ARCH_SUMMON_N = 6;
const ARCH_RAIN_CD = 4.2, ARCH_RAIN_N = 9, ARCH_RAIN_SPD = 360, ARCH_RAIN_TELE = 0.6;
const ARCH_TP_CD = 3.6;
const ARCH_SECTOR_CD = 6.5, ARCH_SECTOR_N = 6, ARCH_SECTOR_R = 120, ARCH_SECTOR_TELE = 1.0;
const ARCH_GAPRING_CD = 3.4, ARCH_GAPRING_N = 44, ARCH_GAPRING_GAP = 6, ARCH_GAPRING_SPD = 190;
const ARCH_PULL = 60, ARCH_PULL_R = 640;
const ARCH_SPIRAL_GAP = 0.06, ARCH_SPIRAL_SPD = 200;
const ARCH_NOVA_CD = 7, ARCH_NOVA_TELE = 1.4, ARCH_NOVA_R = 420;
const ARCH_ERASE_CD_MUL = 0.7;    // final phase: every cooldown shortened
const ASCENDANT_DMG = 1.25, ASCENDANT_AS = 1.15, ASCENDANT_INVULN = 5;
const META_ARCH_DMG = 1.05;       // permanent head start once the ARCHITECT falls

const BOSSES = {
  /* ---- SLOT 0: OVERLORD (intro) ---- */
  overlord: {
    id: 'overlord', name: 'OVERLORD', color: WH, r: 58, speed: 44, hpMul: 1.0,
    drop: 'heal', phaseThresholds: [0.66, 0.33],
    update(e, dt) {
      const d = e.data, p2 = e.phase >= 1, p3 = e.phase >= 2;
      d.fireT = (d.fireT ?? OVL_FIRE) - dt;
      if (d.fireT <= 0) {
        d.fireT = p2 ? OVL_FIRE2 : OVL_FIRE;
        bossRing(e, OVL_RINGN, OVL_BSPD, B_BULLET, e.rot, p2 ? MA : WH);
        if (p2) bossRing(e, OVL_RINGN, OVL_BSPD, B_BULLET, e.rot + Math.PI / OVL_RINGN, MA); // double ring
        G.shake = Math.min(1, G.shake + 0.05);
      }
      // comet volley: a telegraphed fan of gently-homing comets at the player
      d.cometT = (d.cometT ?? OVL_COMET_CD) - dt;
      if (d.cometT <= 0) {
        d.cometT = OVL_COMET_CD; e.flash = 1;
        const base = angTo(e.x, e.y, player.x, player.y);
        for (let k = 0; k < OVL_COMET_N; k++) {
          const a = base + (k - (OVL_COMET_N - 1) / 2) * 0.16;
          spawnEnemyProjectile(e.x, e.y, Math.cos(a) * OVL_COMET_SPD, Math.sin(a) * OVL_COMET_SPD, e.dmg * B_BULLET, MA, { kind: 'home', turn: 0.9, life: 3.2, r: 8, arm: 0.25 });
        }
      }
      d.summonT = (d.summonT ?? OVL_SUMMON_CD) - dt;
      if (d.summonT <= 0) {
        d.summonT = OVL_SUMMON_CD;
        const n = randi(4, 6);
        for (let k = 0; k < n; k++) { const a = k / n * TAU; spawnEnemy('rusher', e.x + Math.cos(a) * 84, e.y + Math.sin(a) * 84, null); }
      }
      if (p2) {
        d.spiralCD = (d.spiralCD ?? OVL_SPIRAL_CD) - dt;
        if (d.spiralCD <= 0 && !(d.spiral > 0)) { d.spiral = OVL_SPIRAL_DUR; d.spiralCD = OVL_SPIRAL_CD + OVL_SPIRAL_DUR; e.flash = 1; addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: e.r + 50, dur: 0.7, color: MA }); }
        if (d.spiral > 0) {
          d.spiral -= dt;
          d.spEmit = (d.spEmit ?? 0) - dt;
          if (d.spEmit <= 0) { d.spEmit = OVL_SPIRAL_GAP; d.spAng = (d.spAng || 0) + 0.4; spawnEnemyProjectile(e.x, e.y, Math.cos(d.spAng) * OVL_SPIRAL_SPD, Math.sin(d.spAng) * OVL_SPIRAL_SPD, e.dmg * B_BULLET, MA); }
        }
      }
      // phase 3 — CROWN LASERS: a telegraphed rotating tri-beam sweep
      if (p3) {
        if (d.lzState === undefined) { d.lzState = 'idle'; d.lzCD = OVL_LASER_CD * 0.5; }
        if (d.lzState === 'idle') {
          d.lzCD -= dt;
          if (d.lzCD <= 0) {
            d.lzState = 'tele'; d.lzT = OVL_LASER_TELE; d.lzAng = angTo(e.x, e.y, player.x, player.y);
            for (let k = 0; k < OVL_LASER_N; k++)
              addTelegraph({ kind: 'line', x: e.x, y: e.y, a: d.lzAng + k / OVL_LASER_N * TAU, len: OVL_LASER_LEN, w: 9, dur: OVL_LASER_TELE, color: MA });
          }
        } else if (d.lzState === 'tele') {
          d.lzT -= dt; if (d.lzT <= 0) { d.lzState = 'fire'; d.lzT = OVL_LASER_DUR; }
        } else {
          d.lzT -= dt; d.lzAng += OVL_LASER_SWEEP * dt;
          for (let k = 0; k < OVL_LASER_N; k++) {
            const a = d.lzAng + k / OVL_LASER_N * TAU;
            const ex = e.x + Math.cos(a) * OVL_LASER_LEN, ey = e.y + Math.sin(a) * OVL_LASER_LEN;
            G.beams.push({ x1: e.x, y1: e.y, x2: ex, y2: ey, w: OVL_LASER_W, life: 0.05, max: 0.05, color: MA });
            if (segDist(e.x, e.y, ex, ey, player.x, player.y) < OVL_LASER_W / 2 + player.r) hurtPlayer(e.dmg * B_BEAM);
          }
          if (d.lzT <= 0) { d.lzState = 'idle'; d.lzCD = OVL_LASER_CD; }
        }
      }
    },
    draw(e) {
      const c2 = e.phase >= 2 ? MA : e.phase >= 1 ? PK : WH;
      glow(e.x, e.y, e.r * 1.7, c2, 0.7);
      // orbiting crown shards (the lasers fire from these in phase 3)
      for (let k = 0; k < 6; k++) {
        const a = G.time * 0.9 + k / 6 * TAU, rr = e.r * 1.35 + Math.sin(G.time * 3 + k) * 6;
        const sx = e.x + Math.cos(a) * rr, sy = e.y + Math.sin(a) * rr;
        ctx.strokeStyle = rgba(c2, 0.85); ctx.lineWidth = 2;
        poly(sx, sy, 9, 3, a + Math.PI / 2); ctx.stroke();
        glow(sx, sy, 7, c2, 0.5);
      }
      ctx.fillStyle = rgba(c2, 0.16); ctx.strokeStyle = rgba(WH, 0.95); ctx.lineWidth = 4;
      star(e.x, e.y, e.r, 6, e.rot, 0.6); ctx.fill(); ctx.stroke();
      const pulse = 1 + 0.08 * Math.sin(G.time * 5);
      ctx.strokeStyle = rgba(c2, 0.9); ctx.lineWidth = 3;
      poly(e.x, e.y, e.r * 0.45 * pulse, 6, -e.rot * 1.6); ctx.stroke();
      ctx.strokeStyle = rgba(WH, 0.5); ctx.lineWidth = 2;       // counter-rotating hexagram
      star(e.x, e.y, e.r * 0.72, 6, e.rot * 0.5 + 0.5, 0.5); ctx.stroke();
      glow(e.x, e.y, e.r * 0.3 * pulse, WH, 0.9);
    },
  },

  /* ---- SLOT 1: PRISM — The Refractor ---- */
  prism: {
    id: 'prism', name: 'PRISM', color: CY, r: 54, speed: 40, hpMul: 1.05,
    drop: 'prism', phaseThresholds: [0.66, 0.33],
    update(e, dt) {
      const d = e.data, cols = [CY, MA, YE];
      if (d.beamState === undefined) { d.beamState = 'idle'; d.beamCD = PRISM_BEAM_CD; }
      // sweeping refraction beams
      if (d.beamState === 'idle') {
        d.beamCD -= dt;
        if (d.beamCD <= 0) { d.beamState = 'tele'; d.beamT = PRISM_BEAM_TELE; d.beamAng = angTo(e.x, e.y, player.x, player.y); d.nb = e.phase + 1;
          for (let k = 0; k < d.nb; k++) addTelegraph({ kind: 'line', x: e.x, y: e.y, a: d.beamAng + k / d.nb * TAU, len: PRISM_BEAM_LEN, w: 7, dur: PRISM_BEAM_TELE, color: cols[k % 3] }); }
      } else if (d.beamState === 'tele') {
        d.beamT -= dt; if (d.beamT <= 0) { d.beamState = 'fire'; d.beamT = PRISM_BEAM_FIRE; }
      } else {
        d.beamT -= dt; d.beamAng += PRISM_BEAM_SWEEP * dt * (1 + e.phase * 0.4);
        for (let k = 0; k < d.nb; k++) {
          const a = d.beamAng + k / d.nb * TAU, ex = e.x + Math.cos(a) * PRISM_BEAM_LEN, ey = e.y + Math.sin(a) * PRISM_BEAM_LEN;
          G.beams.push({ x1: e.x, y1: e.y, x2: ex, y2: ey, w: PRISM_BEAM_W, life: 0.05, max: 0.05, color: cols[k % 3] });
          if (segDist(e.x, e.y, ex, ey, player.x, player.y) < PRISM_BEAM_W / 2 + player.r) hurtPlayer(e.dmg * B_BEAM);
        }
        if (d.beamT <= 0) { d.beamState = 'idle'; d.beamCD = PRISM_BEAM_CD; }
      }
      // spectrum burst — three gently-homing fans
      d.specCD = (d.specCD ?? PRISM_SPEC_CD) - dt;
      if (d.specCD <= 0) {
        d.specCD = PRISM_SPEC_CD; e.flash = 1;
        for (let f = 0; f < 3; f++) {
          const base = angTo(e.x, e.y, player.x, player.y) + (f - 1) * 0.7;
          for (let k = -2; k <= 2; k++) { const a = base + k * 0.12; spawnEnemyProjectile(e.x, e.y, Math.cos(a) * PRISM_BSPD, Math.sin(a) * PRISM_BSPD, e.dmg * B_BULLET, cols[f], { kind: 'home', turn: 1.1, life: 3 }); }
        }
      }
      // phase 2+ — chromatic shard rain (telegraphed falling squares)
      if (e.phase >= 1) {
        d.rainCD = (d.rainCD ?? PRISM_RAIN_CD) - dt;
        if (d.rainCD <= 0) {
          d.rainCD = PRISM_RAIN_CD;
          for (let k = 0; k < PRISM_RAIN_N; k++) {
            const px = player.x + rand(-360, 360);
            spawnEnemyProjectile(px, player.y - rand(380, 520), 0, PRISM_RAIN_SPD, e.dmg * B_BULLET, cols[k % 3], { kind: 'square', r: 8, arm: PRISM_RAIN_TELE, life: 5 });
          }
        }
      }
      // phase 3 — mirror clones
      if (e.phase >= 2) {
        d.cloneCD = (d.cloneCD ?? PRISM_CLONE_CD) - dt;
        if (d.cloneCD <= 0 && (!d.clones || d.clones.length === 0)) {
          d.cloneCD = PRISM_CLONE_CD + PRISM_CLONE_DUR; d.clones = [];
          for (let k = 0; k < 2; k++) { const a = rand(0, TAU); const cx = e.x + Math.cos(a) * 170, cy = e.y + Math.sin(a) * 170; d.clones.push({ x: cx, y: cy, t: PRISM_CLONE_DUR, fireT: 1 }); addTelegraph({ kind: 'zone', x: cx, y: cy, r: 44, dur: 0.6, color: CY }); }
        }
        if (d.clones) for (let i = d.clones.length - 1; i >= 0; i--) {
          const cl = d.clones[i]; cl.t -= dt; cl.fireT -= dt;
          if (cl.fireT <= 0) { cl.fireT = 1.0; const base = angTo(cl.x, cl.y, player.x, player.y); for (let k = -1; k <= 1; k++) { const a = base + k * 0.25; spawnEnemyProjectile(cl.x, cl.y, Math.cos(a) * PRISM_BSPD, Math.sin(a) * PRISM_BSPD, e.dmg * B_BULLET * 0.6, MA, { kind: 'home', turn: 1.0, life: 2.5 }); } }
          if (cl.t <= 0) d.clones.splice(i, 1);
        }
      }
    },
    onPhase(e) {       // refraction nova punctuates every phase transition
      bossRing(e, 18 + e.phase * 6, 200, B_BULLET, rand(0, TAU), [CY, MA, YE][e.phase % 3]);
    },
    draw(e) {
      glow(e.x, e.y, e.r * 1.5, WH, 0.55);
      ctx.fillStyle = rgba(WH, 0.12); ctx.strokeStyle = rgba(WH, 0.95); ctx.lineWidth = 4;
      poly(e.x, e.y, e.r, 3, e.rot); ctx.fill(); ctx.stroke();
      glow(e.x, e.y, e.r * 0.4, WH, 0.95);
      const cols = [CY, MA, YE];
      for (let k = 0; k < 3; k++) { const a = e.rot + k / 3 * TAU, vx = e.x + Math.cos(a) * e.r * 0.92, vy = e.y + Math.sin(a) * e.r * 0.92, lit = (Math.floor(G.time * 3) % 3) === k; glow(vx, vy, lit ? 13 : 7, cols[k], lit ? 1 : 0.55); }
      // refraction halo: counter-rotating outer triad + colored light nodes
      ctx.strokeStyle = rgba(CY, 0.3); ctx.lineWidth = 2;
      poly(e.x, e.y, e.r * 1.5, 3, -e.rot * 0.7); ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const a = -e.rot * 0.7 + k / 3 * TAU + Math.PI / 2;
        glow(e.x + Math.cos(a) * e.r * 1.5, e.y + Math.sin(a) * e.r * 1.5, 6, cols[k], 0.6);
      }
      if (e.data.clones) for (const cl of e.data.clones) { ctx.fillStyle = rgba(CY, 0.10); ctx.strokeStyle = rgba(WH, 0.5); ctx.lineWidth = 2; poly(cl.x, cl.y, e.r * 0.7, 3, e.rot); ctx.fill(); ctx.stroke(); }
    },
  },

  /* ---- SLOT 2: THE HIVE — Dronemother (the spawner) ---- */
  hive: {
    id: 'hive', name: 'THE HIVE', color: GR, r: 58, speed: 34, hpMul: 1.15,
    drop: 'nectar', phaseThresholds: [0.6, 0.3],
    update(e, dt) {
      const d = e.data, p2 = e.phase >= 1;
      d.droneCD = (d.droneCD ?? HIVE_DRONE_CD) - dt;
      if (d.droneCD <= 0) {
        d.droneCD = p2 ? HIVE_DRONE_CD * 0.6 : HIVE_DRONE_CD;
        const n = randi(3, 5);
        let minis = countType('mini');       // count once, not per spawned drone
        for (let k = 0; k < n && minis < HIVE_DRONE_CAP; k++, minis++) { const a = k / n * TAU + e.rot; spawnEnemy('mini', e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 }); }
      }
      d.wallCD = (d.wallCD ?? HIVE_WALL_CD) - dt;
      if (d.wallCD <= 0) {
        d.wallCD = HIVE_WALL_CD;
        const base = angTo(e.x, e.y, player.x, player.y), perp = base + Math.PI / 2, count = 9, gap = randi(2, 6);
        for (let row = 0; row < 2; row++) for (let k = 0; k < count; k++) {
          if (Math.abs(k - gap) <= 1) continue;
          const off = (k - (count - 1) / 2) * 38 + row * 19, ox = Math.cos(base) * -row * 30;
          spawnEnemyProjectile(e.x + Math.cos(perp) * off + ox, e.y + Math.sin(perp) * off + Math.sin(base) * -row * 30, Math.cos(base) * HIVE_WALL_SPD, Math.sin(base) * HIVE_WALL_SPD, e.dmg * B_BULLET, YE, { arm: HIVE_WALL_TELE, r: 7 });
        }
      }
      d.eggCD = (d.eggCD ?? HIVE_EGG_CD) - dt;
      if (d.eggCD <= 0) {
        d.eggCD = HIVE_EGG_CD;
        const base = angTo(e.x, e.y, player.x, player.y) + rand(-0.4, 0.4);
        const eggs = 1 + (p2 ? 2 : 0);                       // phase 2: a spread of three
        for (let k = 0; k < eggs; k++) {
          const a = base + (k - (eggs - 1) / 2) * HIVE_EGG_SPREAD;
          spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 95, Math.sin(a) * 95, e.dmg * B_BULLET, GR, { kind: 'egg', hatch: 1.5, hatchN: randi(6, 8), r: 11, life: 6 });
        }
      }
      // phase 3 — pheromone frenzy: a pulse that whips every drone into a rush
      if (e.phase >= 2) {
        d.frzCD = (d.frzCD ?? HIVE_FRENZY_CD) - dt;
        if (d.frzCD <= 0) {
          d.frzCD = HIVE_FRENZY_CD; e.flash = 1;
          G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, mr: 700, life: 0.6, max: 0.6, color: YE, kind: 'ring' });
          for (const o of G.enemies) if (!o.dead && o.type === 'mini') { o.frenzy = HIVE_FRENZY_T; o.flash = Math.max(o.flash, 0.5); }
        }
      }
    },
    draw(e) {
      const breathe = 1 + 0.06 * Math.sin(G.time * 3);
      glow(e.x, e.y, e.r * 1.4, GR, 0.5);
      ctx.fillStyle = rgba(GR, 0.10); ctx.strokeStyle = rgba(GR, 0.85); ctx.lineWidth = 3;
      poly(e.x, e.y, e.r * breathe, 6, e.rot * 0.2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(YE, 0.5);
      for (let k = 0; k < 6; k++) { const a = e.rot * 0.2 + k / 6 * TAU, cx = e.x + Math.cos(a) * e.r * 0.5, cy = e.y + Math.sin(a) * e.r * 0.5; poly(cx, cy, e.r * 0.22, 6, e.rot * 0.2); ctx.stroke(); }
      glow(e.x, e.y, e.r * 0.32 * breathe, YE, 0.9);
      // larvae glints pulsing inside the comb cells
      for (let k = 0; k < 6; k++) {
        const a = e.rot * 0.2 + k / 6 * TAU, cx = e.x + Math.cos(a) * e.r * 0.5, cy = e.y + Math.sin(a) * e.r * 0.5;
        glow(cx, cy, 4 + 2 * Math.sin(G.time * 5 + k * 1.7), GR, 0.55);
      }
    },
  },

  /* ---- SLOT 3: GLITCH — The Corrupted ---- */
  glitch: {
    id: 'glitch', name: 'GLITCH', color: CY, r: 50, speed: 40, hpMul: 1.05,
    drop: 'cleansave', phaseThresholds: [0.5],
    update(e, dt) {
      const d = e.data, p2 = e.phase >= 1;
      d.tpCD = (d.tpCD ?? GLITCH_TP_CD) - dt;
      if (d.tpCD <= 0) {
        d.tpCD = p2 ? GLITCH_TP_CD * 0.6 : GLITCH_TP_CD;
        const a = rand(0, TAU), r = rand(140, 320), lim = ARENA / 2 - e.r;
        e.x = clamp(player.x + Math.cos(a) * r, -lim, lim); e.y = clamp(player.y + Math.sin(a) * r, -lim, lim); e.vx = 0; e.vy = 0; e.glitchJump = 0.2;
        for (let k = 0; k < 10; k++) spawnParticle(e.x, e.y, rand(-150, 150), rand(-150, 150), 0.3, 3, pick([CY, MA, YE]), 'spark');
      }
      if (e.glitchJump > 0) e.glitchJump -= dt;
      // pixel-sort beam (band)
      if (d.beamState === undefined) { d.beamState = 'idle'; d.beamCD = GLITCH_BEAM_CD; }
      if (d.beamState === 'idle') { d.beamCD -= dt; if (d.beamCD <= 0) { d.beamState = 'tele'; d.beamT = GLITCH_BEAM_TELE; d.beamVert = Math.random() < 0.5; d.beamPos = d.beamVert ? player.x : player.y; } }
      else if (d.beamState === 'tele') { d.beamT -= dt; if (d.beamT <= 0) { d.beamState = 'fire'; d.beamT = GLITCH_BEAM_FIRE; } }
      else { d.beamT -= dt; const half = GLITCH_BEAM_W / 2 + player.r; if (d.beamVert ? Math.abs(player.x - d.beamPos) < half : Math.abs(player.y - d.beamPos) < half) hurtPlayer(e.dmg * B_BEAM); if (d.beamT <= 0) { d.beamState = 'idle'; d.beamCD = GLITCH_BEAM_CD; } }
      // screen-tear shockwave
      d.waveCD = (d.waveCD ?? GLITCH_WAVE_CD) - dt;
      if (d.waveCD <= 0) { d.waveCD = GLITCH_WAVE_CD; d.wavePending = 0.7; addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: GLITCH_WAVE_R, dur: 0.7, color: MA }); G.glitchFX = Math.max(G.glitchFX, 0.4); }
      if (d.wavePending > 0) { d.wavePending -= dt; if (d.wavePending <= 0) { explodeAt(e.x, e.y, GLITCH_WAVE_R, MA); G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 12, mr: GLITCH_WAVE_R, life: 0.5, max: 0.5, color: CY, kind: 'ring' }); if (dist(e.x, e.y, player.x, player.y) < GLITCH_WAVE_R + player.r) { hurtPlayer(e.dmg * B_BULLET); const a = angTo(e.x, e.y, player.x, player.y); player.vx += Math.cos(a) * 320; player.vy += Math.sin(a) * 320; } } }
      // ERROR rain
      d.rainCD = (d.rainCD ?? GLITCH_RAIN_CD) - dt;
      if (d.rainCD <= 0) { d.rainCD = GLITCH_RAIN_CD; const n = randi(5, 8); for (let k = 0; k < n; k++) { const px = player.x + rand(-320, 320); spawnEnemyProjectile(px, player.y - 440, 0, GLITCH_RAIN_SPD, e.dmg * B_BULLET, CY, { kind: 'square', r: 8, arm: GLITCH_RAIN_TELE, life: 5 }); } }
      // phase 2 — corrupted sectors: telegraphed zones that violently recompile
      if (p2) {
        d.corCD = (d.corCD ?? GLITCH_CORRUPT_CD) - dt;
        if (d.corCD <= 0) {
          d.corCD = GLITCH_CORRUPT_CD; d.corZones = d.corZones || [];
          for (let k = 0; k < GLITCH_CORRUPT_N; k++) {
            const zx = player.x + rand(-300, 300), zy = player.y + rand(-300, 300);
            d.corZones.push({ x: zx, y: zy, t: GLITCH_CORRUPT_TELE });
            addTelegraph({ kind: 'zone', x: zx, y: zy, r: GLITCH_CORRUPT_R, dur: GLITCH_CORRUPT_TELE, color: YE });
          }
        }
      }
      tickZoneList(d.corZones, dt, GLITCH_CORRUPT_R, e);
      // phase 2 — glitch hiccup (mostly visual; brief, telegraphed, rare)
      if (p2) { d.hicCD = (d.hicCD ?? GLITCH_HIC_CD) - dt; if (d.hicCD <= 0) { d.hicCD = GLITCH_HIC_CD; G.glitchFX = 1; G.inputHiccup = 0.3; } }
    },
    draw(e) {
      const j = e.glitchJump > 0 ? rand(-4, 4) : 0, off = 4 + (e.phase >= 1 ? 3 : 0) + (e.glitchJump > 0 ? 5 : 0);
      const d = e.data;
      if (d.beamState === 'tele' || d.beamState === 'fire') {
        const fire = d.beamState === 'fire';
        ctx.fillStyle = rgba(fire ? CY : MA, fire ? 0.28 : 0.12 + 0.1 * Math.sin(G.time * 40));
        if (d.beamVert) ctx.fillRect(d.beamPos - GLITCH_BEAM_W / 2, player.y - 2200, GLITCH_BEAM_W, 4400);
        else ctx.fillRect(player.x - 2200, d.beamPos - GLITCH_BEAM_W / 2, 4400, GLITCH_BEAM_W);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(CY, 0.8); poly(e.x - off + j, e.y, e.r, 4, e.rot); ctx.stroke();
      ctx.strokeStyle = rgba(MA, 0.8); poly(e.x + off, e.y + j, e.r, 4, e.rot); ctx.stroke();
      ctx.strokeStyle = rgba(YE, 0.7); poly(e.x, e.y - off, e.r, 4, e.rot); ctx.stroke();
      ctx.fillStyle = rgba('#05030f', 0.6); poly(e.x, e.y, e.r * 0.8, 4, e.rot); ctx.fill();
      if (Math.random() < 0.2) {              // datamosh slice across the body
        ctx.fillStyle = rgba('#05030f', 0.8);
        ctx.fillRect(e.x - e.r * 1.4, e.y + rand(-e.r, e.r), e.r * 2.8, rand(2, 7));
      }
      glow(e.x, e.y, e.r * 0.6, WH, 0.4);
    },
  },

  /* ---- SLOT 4: THE CONDUCTOR — Synthwave Heart ---- */
  conductor: {
    id: 'conductor', name: 'THE CONDUCTOR', color: MA, r: 50, speed: 38, hpMul: 1.1,
    drop: 'tempo', phaseThresholds: [0.66, 0.33],
    update(e, dt) {
      const d = e.data;
      if (d.beat === undefined) { d.beat = 0; d.beatT = 0; d.bars = 0; }
      if (d.dropPending > 0) {
        d.dropPending -= dt;
        if (d.dropPending <= 0) {
          bossRing(e, 40, 230, B_NOVA, rand(0, TAU), MA);
          // phase 2+: a slower crescendo ring with ONE safe gap to thread
          if (e.phase >= 1) {
            const gap = (Math.random() * COND_GAPRING_N) | 0;
            for (let k = 0; k < COND_GAPRING_N; k++) {
              if ((k - gap + COND_GAPRING_N) % COND_GAPRING_N < COND_GAPRING_GAP) continue;
              const a = k / COND_GAPRING_N * TAU;
              spawnEnemyProjectile(e.x, e.y, Math.cos(a) * COND_GAPRING_SPD, Math.sin(a) * COND_GAPRING_SPD, e.dmg * B_BULLET, YE, { r: 8 });
            }
          }
          G.shake = Math.min(1, G.shake + 0.35);
          if (Sound) Sound.setIntensity(1);
        }
      }
      d.beatT -= dt;
      if (d.beatT <= 0) {
        d.beatT += CONDUCTOR_BEAT / (1 + e.phase * 0.12); d.beat++; e.flash = 0.6;
        if (d.beat % 2 === 0) bossRing(e, 12, CONDUCTOR_BSPD, B_BULLET, e.rot, CY);
        else for (let k = 0; k < 4; k++) { const a = e.rot + k / 4 * TAU; for (let s = -1; s <= 1; s++) spawnEnemyProjectile(e.x, e.y, Math.cos(a + s * 0.12) * (CONDUCTOR_BSPD + 10), Math.sin(a + s * 0.12) * (CONDUCTOR_BSPD + 10), e.dmg * B_BULLET, MA); }
        if (e.phase >= 1 && d.beat % 4 === 0) { const base = rand(0, TAU); for (let k = 0; k < 24; k++) { if (k % 6 === 0) continue; const a = base + k / 24 * TAU; spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, e.dmg * B_BULLET, CY, { kind: 'curve', spin: 0.6, life: 4 }); } }
        if (d.beat % 4 === 0) { d.bars++; if (d.bars % CONDUCTOR_DROP_BARS === 0) { addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: CONDUCTOR_DROP_R, dur: 1.2, color: MA }); d.dropPending = 1.2; e.flash = 1; } }
        if (e.phase >= 2) { d.arp = 8; d.arpAng = e.rot; }
      }
      if (d.arp > 0) { d.arpEmit = (d.arpEmit ?? 0) - dt; if (d.arpEmit <= 0) { d.arpEmit = 0.04; d.arpAng += 0.5; spawnEnemyProjectile(e.x, e.y, Math.cos(d.arpAng) * 230, Math.sin(d.arpAng) * 230, e.dmg * B_BULLET, YE); d.arp--; } }
    },
    draw(e) {
      const beatPhase = 1 - clamp((e.data.beatT || 0) / CONDUCTOR_BEAT, 0, 1);
      glow(e.x, e.y, e.r * 1.3, e.flash > 0.3 ? WH : MA, 0.6);
      ctx.strokeStyle = rgba(CY, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.7, 0, TAU); ctx.stroke();
      const bars = 24;
      for (let k = 0; k < bars; k++) { const a = k / bars * TAU + e.rot * 0.3, h = e.r * 0.5 + e.r * 0.7 * Math.abs(Math.sin(G.time * 6 + k * 0.5)) * (0.5 + beatPhase * 0.5); const x1 = e.x + Math.cos(a) * e.r * 0.8, y1 = e.y + Math.sin(a) * e.r * 0.8, x2 = e.x + Math.cos(a) * (e.r * 0.8 + h), y2 = e.y + Math.sin(a) * (e.r * 0.8 + h); ctx.strokeStyle = rgba(k % 2 ? MA : CY, 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      glow(e.x, e.y, e.r * 0.3 * (1 + 0.25 * beatPhase), MA, 0.95);
      if (beatPhase > 0.82) {                  // beat-synced light rays
        ctx.strokeStyle = rgba(WH, (beatPhase - 0.82) * 3);
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const a = e.rot * 0.3 + k / 4 * TAU + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * e.r * 1.1, e.y + Math.sin(a) * e.r * 1.1);
          ctx.lineTo(e.x + Math.cos(a) * e.r * 2.4, e.y + Math.sin(a) * e.r * 2.4);
          ctx.stroke();
        }
      }
    },
  },

  /* ---- SLOT 5: WARDEN — The Gravity Well ---- */
  warden: {
    id: 'warden', name: 'THE WARDEN', color: PU, r: 54, speed: 40, hpMul: 1.2,
    drop: 'singularity', phaseThresholds: [0.66, 0.33],
    update(e, dt) {
      const d = e.data, lim = ARENA / 2 - player.r;
      // continuous gravity pull (gentle, escapable by moving/dashing)
      const ga = angTo(player.x, player.y, e.x, e.y), gd = dist(player.x, player.y, e.x, e.y);
      if (gd < WARDEN_PULL_R && gd > player.r + e.r) { player.x = clamp(player.x + Math.cos(ga) * WARDEN_PULL * dt, -lim, lim); player.y = clamp(player.y + Math.sin(ga) * WARDEN_PULL * dt, -lim, lim); }
      // spiral bullets
      d.spAng = (d.spAng || 0) + dt * 1.2; d.spEmit = (d.spEmit ?? 0) - dt;
      if (d.spEmit <= 0) { d.spEmit = WARDEN_SPIRAL_GAP; for (let arm = 0; arm < 2; arm++) { const a = d.spAng + arm * Math.PI; spawnEnemyProjectile(e.x, e.y, Math.cos(a) * WARDEN_SPIRAL_SPD, Math.sin(a) * WARDEN_SPIRAL_SPD, e.dmg * B_BULLET, BL, { kind: 'curve', spin: 0.5, life: 4 }); } }
      // implosion -> explosion
      d.impCD = (d.impCD ?? WARDEN_IMP_CD) - dt;
      if (d.impCD <= 0 && !(d.imp > 0)) { d.imp = 1.5; d.impCD = WARDEN_IMP_CD + 1.5; addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: WARDEN_IMP_R, dur: 1.5, color: PU }); }
      if (d.imp > 0) { d.imp -= dt; if (Math.random() < 0.5) { const a = rand(0, TAU); spawnParticle(e.x + Math.cos(a) * WARDEN_IMP_R, e.y + Math.sin(a) * WARDEN_IMP_R, -Math.cos(a) * 220, -Math.sin(a) * 220, 0.45, 3, PU, 'spark'); } if (d.imp <= 0) { bossRing(e, 44, 240, B_NOVA, rand(0, TAU), PU); bossRing(e, 44, 180, B_BULLET, rand(0, TAU), BL); G.shake = Math.min(1, G.shake + 0.3); } }
      // phase 2 — mini singularities
      if (e.phase >= 1) {
        d.wellCD = (d.wellCD ?? WARDEN_WELL_CD) - dt;
        if (d.wellCD <= 0 && (!d.wells || d.wells.length === 0)) { d.wellCD = WARDEN_WELL_CD; d.wells = []; const n = randi(2, 3); for (let k = 0; k < n; k++) { const a = rand(0, TAU), r = rand(160, 300), wlim = ARENA / 2 - 40, wx = clamp(player.x + Math.cos(a) * r, -wlim, wlim), wy = clamp(player.y + Math.sin(a) * r, -wlim, wlim); d.wells.push({ x: wx, y: wy, t: WARDEN_WELL_DUR, fireT: rand(0, 0.5) }); addTelegraph({ kind: 'zone', x: wx, y: wy, r: 80, dur: 0.8, color: PU }); } }
        if (d.wells) for (let i = d.wells.length - 1; i >= 0; i--) { const w = d.wells[i]; w.t -= dt; const wa = angTo(player.x, player.y, w.x, w.y), wd = dist(player.x, player.y, w.x, w.y); if (wd < WARDEN_WELL_R && wd > 30) { player.x = clamp(player.x + Math.cos(wa) * WARDEN_WELL_PULL * dt, -lim, lim); player.y = clamp(player.y + Math.sin(wa) * WARDEN_WELL_PULL * dt, -lim, lim); } w.fireT -= dt; if (w.fireT <= 0) { w.fireT = 0.7; bossRing({ x: w.x, y: w.y, dmg: e.dmg }, 6, 140, B_BULLET, rand(0, TAU), PU); } if (w.t <= 0) d.wells.splice(i, 1); }
      }
      // phase 3 — graviton lances: telegraphed triple piercing shots
      if (e.phase >= 2) {
        if (d.lanceState === undefined) { d.lanceState = 'idle'; d.lanceCD = WARDEN_LANCE_CD; }
        if (d.lanceState === 'idle') {
          d.lanceCD -= dt;
          if (d.lanceCD <= 0) {
            d.lanceState = 'tele'; d.lanceT = WARDEN_LANCE_TELE; d.lanceA = angTo(e.x, e.y, player.x, player.y);
            for (let k = 0; k < WARDEN_LANCE_N; k++)
              addTelegraph({ kind: 'line', x: e.x, y: e.y, a: d.lanceA + (k - 1) * 0.18, len: 1100, w: 8, dur: WARDEN_LANCE_TELE, color: PK });
          }
        } else {
          d.lanceT -= dt;
          if (d.lanceT <= 0) {
            d.lanceState = 'idle'; d.lanceCD = WARDEN_LANCE_CD; e.flash = 1;
            for (let k = 0; k < WARDEN_LANCE_N; k++) {
              const a = d.lanceA + (k - 1) * 0.18;
              spawnEnemyProjectile(e.x, e.y, Math.cos(a) * WARDEN_LANCE_SPD, Math.sin(a) * WARDEN_LANCE_SPD, e.dmg * B_BULLET, PK, { r: 9, life: 3 });
            }
          }
        }
      }
    },
    draw(e) {
      glow(e.x, e.y, e.r * 1.2, PU, 0.5);
      ctx.strokeStyle = rgba(BL, 0.18); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, WARDEN_PULL_R, 0, TAU); ctx.stroke();
      for (let k = 0; k < 3; k++) { const rr = e.r * (0.6 + k * 0.28); ctx.strokeStyle = rgba(k % 2 ? PU : BL, 0.7); ctx.lineWidth = 3; ctx.beginPath(); for (let s = 0; s <= 24; s++) { const a = e.rot * (1 + k * 0.3) + s / 24 * TAU, x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr; if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = rgba('#05030f', 0.92); ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.5, 0, TAU); ctx.fill();
      glow(e.x, e.y, e.r * 0.3, PU, 0.85);
      for (let k = 0; k < 8; k++) {            // orbiting debris shards
        const a = G.time * 1.4 + k / 8 * TAU, rr = e.r * 1.55 + Math.sin(G.time * 2.2 + k) * 8;
        glow(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 5, k % 2 ? BL : PU, 0.6);
      }
      if (e.data.wells) for (const w of e.data.wells) { glow(w.x, w.y, 20, PU, 0.7); ctx.strokeStyle = rgba(BL, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.x, w.y, WARDEN_WELL_R, 0, TAU); ctx.stroke(); ctx.fillStyle = rgba('#05030f', 0.85); ctx.beginPath(); ctx.arc(w.x, w.y, 10, 0, TAU); ctx.fill(); }
    },
  },

  /* ---- THE ARCHITECT — the intelligence behind the swarm (Section D).
     Voluntary super-boss: 5 phases, 4 destructible rune nodes shielding the
     core, evolved versions of every roster boss's signature, fixed brutal
     stats. Summoned only via the forged SIGIL. ---- */
  architect: {
    id: 'architect', name: 'THE ARCHITECT', color: PU, r: ARCH_R, speed: ARCH_SPEED, hpMul: 1,
    drop: 'ascendant', phaseThresholds: [0.8, 0.6, 0.4, 0.2],
    update(e, dt) {
      const d = e.data;
      const F = e.phase >= 4 ? ARCH_ERASE_CD_MUL : 1;        // ERASE: all cooldowns shortened
      if (!d.init) {                                          // deploy the rune nodes once
        d.init = true; d.nodes = [];
        for (let k = 0; k < ARCH_NODE_N; k++) {
          const n = spawnEnemy('archnode', e.x + 10, e.y, {
            hp: ARCH_NODE_HP, maxHp: ARCH_NODE_HP, dmg: ARCH_NODE_DMG,
            arch: e, orbA: k / ARCH_NODE_N * TAU, fireT: rand(0.5, 2),
          });
          if (n) d.nodes.push(n);
        }
      }
      e.shieldMul = (d.nodes && d.nodes.some(n => !n.dead)) ? ARCH_SHIELD_MUL : null;

      // comet fans — constant pressure in every phase
      d.cometT = (d.cometT ?? ARCH_COMET_CD) - dt;
      if (d.cometT <= 0) {
        d.cometT = ARCH_COMET_CD * F;
        const base = angTo(e.x, e.y, player.x, player.y);
        for (let k = 0; k < ARCH_COMET_N; k++) {
          const a = base + (k - (ARCH_COMET_N - 1) / 2) * 0.13;
          spawnEnemyProjectile(e.x, e.y, Math.cos(a) * ARCH_COMET_SPD, Math.sin(a) * ARCH_COMET_SPD, e.dmg * B_BULLET, MA, { kind: 'home', turn: 0.8, life: 3.4, r: 8, arm: 0.25 });
        }
      }
      // SURVEY — quad rune beams, telegraphed rotating sweep (OVERLORD evolved)
      if (d.bmState === undefined) { d.bmState = 'idle'; d.bmCD = ARCH_BEAM_CD * 0.6; }
      if (d.bmState === 'idle') {
        d.bmCD -= dt;
        if (d.bmCD <= 0) {
          d.bmState = 'tele'; d.bmT = ARCH_BEAM_TELE; d.bmA = angTo(e.x, e.y, player.x, player.y);
          for (let k = 0; k < ARCH_BEAM_N; k++)
            addTelegraph({ kind: 'line', x: e.x, y: e.y, a: d.bmA + k / ARCH_BEAM_N * TAU, len: ARCH_BEAM_LEN, w: 10, dur: ARCH_BEAM_TELE, color: MA });
        }
      } else if (d.bmState === 'tele') {
        d.bmT -= dt; if (d.bmT <= 0) { d.bmState = 'fire'; d.bmT = ARCH_BEAM_DUR; }
      } else {
        d.bmT -= dt; d.bmA += ARCH_BEAM_SWEEP * dt * (e.phase >= 2 ? 1.3 : 1);
        for (let k = 0; k < ARCH_BEAM_N; k++) {
          const a = d.bmA + k / ARCH_BEAM_N * TAU;
          const ex = e.x + Math.cos(a) * ARCH_BEAM_LEN, ey = e.y + Math.sin(a) * ARCH_BEAM_LEN;
          G.beams.push({ x1: e.x, y1: e.y, x2: ex, y2: ey, w: ARCH_BEAM_W, life: 0.05, max: 0.05, color: MA });
          if (segDist(e.x, e.y, ex, ey, player.x, player.y) < ARCH_BEAM_W / 2 + player.r) hurtPlayer(e.dmg * B_BEAM);
        }
        if (d.bmT <= 0) { d.bmState = 'idle'; d.bmCD = ARCH_BEAM_CD * F; }
      }
      // REPLICATE (phase 2+): drone broods + chromatic shard rain (HIVE/PRISM evolved)
      if (e.phase >= 1) {
        d.sumT = (d.sumT ?? ARCH_SUMMON_CD) - dt;
        if (d.sumT <= 0) {
          d.sumT = ARCH_SUMMON_CD * F;
          for (let k = 0; k < ARCH_SUMMON_N; k++) {
            const a = k / ARCH_SUMMON_N * TAU;
            spawnEnemy('mini', e.x + Math.cos(a) * (e.r + 30), e.y + Math.sin(a) * (e.r + 30), { vx: Math.cos(a) * 140, vy: Math.sin(a) * 140 });
          }
          G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, mr: e.r * 2.2, life: 0.4, max: 0.4, color: GR, kind: 'ring' });
        }
        d.rainT = (d.rainT ?? ARCH_RAIN_CD) - dt;
        if (d.rainT <= 0) {
          d.rainT = ARCH_RAIN_CD * F;
          for (let k = 0; k < ARCH_RAIN_N; k++)
            spawnEnemyProjectile(player.x + rand(-420, 420), player.y - rand(400, 560), 0, ARCH_RAIN_SPD, e.dmg * B_BULLET, [CY, MA, YE][k % 3], { kind: 'square', r: 8, arm: ARCH_RAIN_TELE, life: 5 });
        }
      }
      // REWRITE (phase 3+): reality blinks + corrupted sectors (GLITCH evolved)
      if (e.phase >= 2) {
        d.tpT = (d.tpT ?? ARCH_TP_CD) - dt;
        if (d.tpT <= 0) {
          d.tpT = ARCH_TP_CD * F;
          const a = rand(0, TAU), rr = rand(260, 460), lim2 = ARENA / 2 - e.r;
          e.x = clamp(player.x + Math.cos(a) * rr, -lim2, lim2);
          e.y = clamp(player.y + Math.sin(a) * rr, -lim2, lim2);
          e.vx = 0; e.vy = 0;
          for (let k = 0; k < 14; k++) spawnParticle(e.x, e.y, rand(-200, 200), rand(-200, 200), 0.35, 3, pick([PU, MA, CY]), 'spark');
        }
        d.secT = (d.secT ?? ARCH_SECTOR_CD) - dt;
        if (d.secT <= 0) {
          d.secT = ARCH_SECTOR_CD * F; d.sectors = d.sectors || [];
          for (let k = 0; k < ARCH_SECTOR_N; k++) {
            const zx = player.x + rand(-340, 340), zy = player.y + rand(-340, 340);
            d.sectors.push({ x: zx, y: zy, t: ARCH_SECTOR_TELE });
            addTelegraph({ kind: 'zone', x: zx, y: zy, r: ARCH_SECTOR_R, dur: ARCH_SECTOR_TELE, color: YE });
          }
        }
      }
      tickZoneList(d.sectors, dt, ARCH_SECTOR_R, e);
      // CONDUCT (phase 4+): gravity grip + gap rings + twin spiral arms
      // (WARDEN/CONDUCTOR evolved)
      if (e.phase >= 3) {
        const ga = angTo(player.x, player.y, e.x, e.y), gd = dist(player.x, player.y, e.x, e.y);
        const lim3 = ARENA / 2 - player.r;
        if (gd < ARCH_PULL_R && gd > player.r + e.r) {
          player.x = clamp(player.x + Math.cos(ga) * ARCH_PULL * dt, -lim3, lim3);
          player.y = clamp(player.y + Math.sin(ga) * ARCH_PULL * dt, -lim3, lim3);
        }
        d.grT = (d.grT ?? ARCH_GAPRING_CD) - dt;
        if (d.grT <= 0) {
          d.grT = ARCH_GAPRING_CD * F;
          const gap = (Math.random() * ARCH_GAPRING_N) | 0;
          for (let k = 0; k < ARCH_GAPRING_N; k++) {
            if ((k - gap + ARCH_GAPRING_N) % ARCH_GAPRING_N < ARCH_GAPRING_GAP) continue;
            const a = k / ARCH_GAPRING_N * TAU;
            spawnEnemyProjectile(e.x, e.y, Math.cos(a) * ARCH_GAPRING_SPD, Math.sin(a) * ARCH_GAPRING_SPD, e.dmg * B_BULLET, YE, { r: 8 });
          }
        }
        d.spA = (d.spA || 0) + dt * 1.1; d.spE = (d.spE ?? 0) - dt;
        if (d.spE <= 0) {
          d.spE = ARCH_SPIRAL_GAP * (e.phase >= 4 ? 0.8 : 1);
          for (let arm = 0; arm < 2; arm++) {
            const a = d.spA + arm * Math.PI;
            spawnEnemyProjectile(e.x, e.y, Math.cos(a) * ARCH_SPIRAL_SPD, Math.sin(a) * ARCH_SPIRAL_SPD, e.dmg * B_BULLET, BL, { kind: 'curve', spin: 0.5, life: 4 });
          }
        }
      }
      // ERASE (final phase): telegraphed implosion novas on top of everything
      if (e.phase >= 4) {
        d.novaT = (d.novaT ?? ARCH_NOVA_CD) - dt;
        if (d.novaT <= 0 && !(d.nova > 0)) {
          d.nova = ARCH_NOVA_TELE; d.novaT = ARCH_NOVA_CD;
          addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: ARCH_NOVA_R, dur: ARCH_NOVA_TELE, color: RD });
        }
        if (d.nova > 0) {
          d.nova -= dt;
          if (Math.random() < 0.6) {
            const a = rand(0, TAU);
            spawnParticle(e.x + Math.cos(a) * ARCH_NOVA_R, e.y + Math.sin(a) * ARCH_NOVA_R, -Math.cos(a) * 300, -Math.sin(a) * 300, 0.4, 3, RD, 'spark');
          }
          if (d.nova <= 0) {
            explodeAt(e.x, e.y, ARCH_NOVA_R, RD);
            if (dist(e.x, e.y, player.x, player.y) < ARCH_NOVA_R + player.r) hurtPlayer(e.dmg * B_NOVA);
            bossRing(e, 48, 230, B_BULLET, rand(0, TAU), RD);
          }
        }
      }
    },
    onPhase(e, ph) {
      const names = ['SURVEY', 'REPLICATE', 'REWRITE', 'CONDUCT', 'ERASE'];
      floater(e.x, e.y - e.r - 48, names[Math.min(ph, 4)], PU, 26);
      bossRing(e, 30 + ph * 8, 210, B_BULLET, rand(0, TAU), [PU, MA, CY, YE, WH][ph % 5]);
    },
    draw(e) {
      const d = e.data, t = G.time;
      const nodesAlive = d.nodes ? d.nodes.some(n => !n.dead) : false;
      // triple counter-rotating rune rings
      const ringCols = [PU, MA, CY];
      for (let ringI = 0; ringI < 3; ringI++) {
        const rr = e.r * (1.25 + ringI * 0.33);
        const base = t * (0.35 + ringI * 0.15) * (ringI % 2 ? -1 : 1);
        ctx.strokeStyle = rgba(ringCols[ringI], 0.35); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, TAU); ctx.stroke();
        const nGlyphs = 10 + ringI * 4;
        for (let k = 0; k < nGlyphs; k++) {
          const a = base + k / nGlyphs * TAU;
          ctx.strokeStyle = rgba(ringCols[ringI], 0.8); ctx.lineWidth = 1.6;
          poly(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 5, 3 + (k % 3), a); ctx.stroke();
        }
      }
      // geometric limbs: four slow-rotating blades
      for (let k = 0; k < 4; k++) {
        const a = t * 0.22 + k / 4 * TAU;
        const x1 = e.x + Math.cos(a) * e.r * 0.7, y1 = e.y + Math.sin(a) * e.r * 0.7;
        const x2 = e.x + Math.cos(a) * e.r * 1.18, y2 = e.y + Math.sin(a) * e.r * 1.18;
        ctx.strokeStyle = rgba(WH, 0.65); ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        glow(x2, y2, 9, PU, 0.7);
      }
      // hexagram frame + inner counter-rotor
      glow(e.x, e.y, e.r * 1.6, PU, 0.55);
      ctx.fillStyle = rgba('#0a0620', 0.85); ctx.strokeStyle = rgba(WH, 0.95); ctx.lineWidth = 5;
      star(e.x, e.y, e.r, 6, e.rot * 0.4, 0.72); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(MA, 0.8); ctx.lineWidth = 2.5;
      poly(e.x, e.y, e.r * 0.62, 6, -e.rot * 0.8); ctx.stroke();
      // the all-seeing eye: sclera + iris that tracks the player + dark pupil
      const ea = angTo(e.x, e.y, player.x, player.y);
      ctx.fillStyle = rgba(WH, 0.92);
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 0.42, e.r * 0.26, 0, 0, TAU); ctx.fill();
      const ix = e.x + Math.cos(ea) * e.r * 0.13, iy = e.y + Math.sin(ea) * e.r * 0.08;
      ctx.fillStyle = PU; ctx.beginPath(); ctx.arc(ix, iy, e.r * 0.13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#05030f'; ctx.beginPath(); ctx.arc(ix, iy, e.r * 0.055, 0, TAU); ctx.fill();
      glow(ix, iy, e.r * 0.2, MA, 0.8);
      // shield shimmer while rune nodes survive
      if (nodesAlive) {
        ctx.strokeStyle = rgba(CY, 0.25 + 0.15 * Math.sin(t * 6)); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.08, 0, TAU); ctx.stroke();
      }
    },
  },
};
function romanize(n) { return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || ('#' + n); }

/* ---- Telegraphs: fading warning shapes drawn ~0.6-1.0s before a hit lands.
   kind 'line' (aimed shots / charges) or 'zone' (AoE circles). ---- */
function addTelegraph(o) {
  o.life = o.dur; o.max = o.dur;
  if (!o.color) o.color = RD;
  G.telegraphs.push(o);
}

// ---- v1.3 enemy tuning. Every magic number lives here so behaviour is easy to retune. ----
const WEAVER_FREQ = 7, WEAVER_AMP = 0.9;
const SHIELDER_ARC = 1.05, SHIELDER_BLOCK = 0.8;          // half-arc (~60deg) and damage soaked
const MENDER_CD = 2.2, MENDER_RANGE = 150, MENDER_HEAL = 14, MENDER_KEEP = 220;
const CHARGER_WIND = 0.7, CHARGER_DASH = 0.45, CHARGER_DASHMUL = 4.0, CHARGER_RANGE = 360, CHARGER_CD = [2.2, 3.6];
const LANCER_WIND = 0.65, LANCER_CD = [2.0, 3.2], LANCER_SHOT = 460, LANCER_KEEP = 240, LANCER_RANGE = 700;
const HATCHER_CD = 3.0, HATCHER_BROOD = 2, HATCHER_DEATH = [4, 6];
const PHANTOM_CD = 2.0, PHANTOM_FADE = 0.3, PHANTOM_POST = 0.5, PHANTOM_NEAR = 0.55, PHANTOM_MIN = 90; // blink ~every 2s, closer to player; intangible through fade + arrival
const REFLECTOR_CHANCE = 0.3, REFLECTOR_SHOT = 300;
const DETO_ARM = 0.7, DETO_STAGGER = 0.28, DETO_R0 = 70, DETO_RSTEP = 50; // bomber: accelerating blink, then 3 staggered rings on contact/death
const DISRUPTOR_RANGE = 200, DISRUPTOR_SLOW = 0.8; // mild (~20%) slow — deliberately not frustrating
const JUG_CD = [4, 6], JUG_WIND = 0.9, JUG_CHARGE_DASH = 0.5, JUG_CHARGE_MUL = 4.5, JUG_CHARGE_RANGE = 480, JUG_SUMMON = 3;

// Arm a detonator (shared by its contact hook and its lethal-damage hook).
function armDetonator(e) {
  if (e.detonating) return;
  e.detonating = true; e.detoPhase = 0; e.detoArm = DETO_ARM; e.blinkT = 0; e.flash = 1;
  addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: DETO_R0, dur: DETO_ARM, color: RD });
}

/* Per-type behaviour registry. Each entry may define move(e,c,dt) (mutates the
   movement context c = {ang,d,ax,ay,sp}, fires, telegraphs) and/or contact(e,c)
   (custom on-touch). No entry => default chase + default contact. Bosses are
   dispatched by the e.boss flag (their type is 'tank'), never by EBEHAVIOR.tank. */
const EBEHAVIOR = {
  orbiter: {
    move(e, c) {
      // spiral: tangential + slight inward
      const tx = -c.ay, ty = c.ax;
      c.ax = c.ax * 0.5 + tx; c.ay = c.ay * 0.5 + ty;
      const l = Math.hypot(c.ax, c.ay); c.ax /= l; c.ay /= l;
    },
  },
  shooter: {
    move(e, c, dt) {
      const prefer = 300;
      if (c.d < prefer - 40) { c.ax = -c.ax; c.ay = -c.ay; }
      else if (c.d < prefer + 40) { c.ax = -c.ay; c.ay = c.ax; } // strafe
      e.fireT -= dt;
      if (e.fireT <= 0 && c.d < 640) {
        e.fireT = 1.8 + rand(0, 0.6);
        const a = angTo(e.x, e.y, player.x, player.y);
        spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 240, Math.sin(a) * 240, e.dmg * 0.7, PU);
      }
    },
  },
  bomber: {
    contact(e) {
      explodeAt(e.x, e.y, 70 * S().areaMul, RD);
      if (dist(e.x, e.y, player.x, player.y) < 70 + player.r) hurtPlayer(e.dmg);
      killEnemy(e, false);
    },
  },
  boss: {
    move(e, c, dt) {
      if (e.entrance > 0) {                  // materialization: hold position, no brain
        e.entrance -= dt; c.sp = 0;
        if (Math.random() < 0.6) {           // particles implode toward the forming body
          const a = rand(0, TAU), rr = e.r * rand(2.0, 3.4);
          spawnParticle(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, -Math.cos(a) * 260, -Math.sin(a) * 260, 0.35, 3, e.color, 'spark');
        }
        if (e.entrance <= 0) {               // arrival slam
          G.shake = Math.min(1, G.shake + 0.5);
          G.flash = Math.max(G.flash, 0.35); G.flashColor = e.color;
          spawnRing(e.x, e.y, e.r, e.r * 5, 0.5, e.color);
          sfx('boss');
        }
        return;
      }
      if (e.phasePause > 0) {                // phase-transition breather
        e.phasePause -= dt; c.sp = 0;
        tickBossZones(e, dt);                // telegraphed zones keep counting down
        return;
      }
      c.sp = (e.bdef && e.bdef.selfMove) ? 0 : e.speed;   // slow chase unless the def drives itself
      updateBoss(e, dt);
    },
  },

  /* ---- v1.3 enemies ---- */
  // Weaver: serpentine approach (perpendicular sine added to the chase vector).
  weaver: {
    move(e, c, dt) {
      e.weaveT = (e.weaveT || 0) + dt;
      const px = -c.ay, py = c.ax;
      const s = Math.sin(e.weaveT * WEAVER_FREQ) * WEAVER_AMP;
      c.ax += px * s; c.ay += py * s;
      const l = Math.hypot(c.ax, c.ay) || 1; c.ax /= l; c.ay /= l;
    },
  },
  // Shielder: chases head-on; its front shield (faces the player) soaks frontal
  // projectile damage — applied in damageEnemy via e.shieldA.
  shielder: { move(e, c) { e.shieldA = c.ang; } },
  // Mender: hangs back and periodically heals wounded nearby allies.
  mender: {
    move(e, c, dt) {
      if (c.d < MENDER_KEEP) { c.ax = -c.ax; c.ay = -c.ay; }
      e.healT = (e.healT ?? rand(0, MENDER_CD)) - dt;
      if (e.healT <= 0) {
        e.healT = MENDER_CD;
        grid.query(e.x, e.y, MENDER_RANGE, _wq);
        let healed = false;
        const amt = MENDER_HEAL * diffScale().hp;
        for (let j = 0; j < _wq.length; j++) {
          const o = _wq[j];
          if (o.dead || o === e || o.boss) continue;
          if (o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + amt); o.flash = Math.max(o.flash, 0.2); healed = true; }
        }
        if (healed) G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 8, mr: MENDER_RANGE, life: 0.5, max: 0.5, color: GR, kind: 'ring' });
      }
    },
  },
  // Charger: telegraphs a line, then dashes along it.
  charger: {
    move(e, c, dt) {
      if (e.state === 'dash') {
        e.dashT -= dt;
        c.ax = Math.cos(e.dashA); c.ay = Math.sin(e.dashA); c.sp = e.speed * CHARGER_DASHMUL;
        if (e.dashT <= 0) { e.state = null; e.chT = rand(CHARGER_CD[0], CHARGER_CD[1]); }
        return;
      }
      if (e.state === 'wind') {
        c.sp *= 0.25; e.windT -= dt;
        if (e.windT <= 0) { e.state = 'dash'; e.dashT = CHARGER_DASH; }
        return;
      }
      e.chT = (e.chT ?? rand(CHARGER_CD[0], CHARGER_CD[1])) - dt;
      if (e.chT <= 0 && c.d < CHARGER_RANGE) {
        e.state = 'wind'; e.windT = CHARGER_WIND; e.dashA = c.ang; c.sp *= 0.25;
        addTelegraph({ kind: 'line', x: e.x, y: e.y, a: e.dashA, len: CHARGER_RANGE, w: 14, dur: CHARGER_WIND, color: OR });
      }
    },
  },
  // Lancer: telegraphs an aimed line, then fires a fast precise shot.
  lancer: {
    move(e, c, dt) {
      if (e.state === 'wind') {
        c.sp *= 0.2; e.windT -= dt;
        if (e.windT <= 0) {
          e.state = null; e.fireT = rand(LANCER_CD[0], LANCER_CD[1]);
          spawnEnemyProjectile(e.x, e.y, Math.cos(e.aimA) * LANCER_SHOT, Math.sin(e.aimA) * LANCER_SHOT, e.dmg * 0.9, PU);
        }
        return;
      }
      if (c.d < LANCER_KEEP) { c.ax = -c.ax; c.ay = -c.ay; }
      e.fireT -= dt;
      if (e.fireT <= 0 && c.d < LANCER_RANGE) {
        e.state = 'wind'; e.windT = LANCER_WIND; e.aimA = c.ang;
        addTelegraph({ kind: 'line', x: e.x, y: e.y, a: e.aimA, len: LANCER_RANGE, w: 7, dur: LANCER_WIND, color: PU });
      }
    },
  },
  // Hatcher: periodically releases a small brood of minis (also bursts on death).
  hatcher: {
    move(e, c, dt) {
      e.hatchT = (e.hatchT ?? HATCHER_CD) - dt;
      if (e.hatchT <= 0) {
        e.hatchT = HATCHER_CD;
        for (let k = 0; k < HATCHER_BROOD; k++) {
          const a = rand(0, TAU);
          spawnEnemy('mini', e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6), { vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 });
        }
        G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 6, mr: e.r + 30, life: 0.4, max: 0.4, color: GR, kind: 'ring' });
      }
    },
  },
  // Phantom: blinks ~every 2s closer to the player. A fade-out telegraphs the
  // blink, and it is intangible (takes NO damage) through the fade + ~0.5s after.
  phantom: {
    move(e, c, dt) {
      if (e.intangible > 0) e.intangible -= dt;
      if (e.phState === 'fade') {
        c.sp *= 0.3; e.fadeT -= dt;
        e.ghostA = clamp(e.fadeT / PHANTOM_FADE, 0, 1);          // 1 -> 0: visibly fading out (the telegraph)
        if (e.fadeT <= 0) {
          const nd = Math.max(PHANTOM_MIN, c.d * PHANTOM_NEAR), a = rand(0, TAU), lim = ARENA / 2 - e.r;
          e.x = clamp(player.x + Math.cos(a) * nd, -lim, lim);
          e.y = clamp(player.y + Math.sin(a) * nd, -lim, lim);
          e.vx = 0; e.vy = 0; e.ghostA = 0;
          e.intangible = PHANTOM_POST;                           // lingering invulnerability after arrival
          e.phState = null; e.phaseT = PHANTOM_CD + rand(-0.3, 0.3);
          spawnParticle(e.x, e.y, 0, 0, 0.4, e.r, PU, 'spark');
        }
        return;
      }
      e.phaseT = (e.phaseT ?? (PHANTOM_CD + rand(-0.3, 0.3))) - dt;
      if (e.phaseT <= 0) {
        e.phState = 'fade'; e.fadeT = PHANTOM_FADE;
        e.intangible = PHANTOM_FADE + PHANTOM_POST;              // immune the instant it starts fading
      }
    },
    contact(e, c) { if (e.intangible > 0) return; hurtPlayer(e.dmg, e.x, e.y); e.vx -= c.ax * 60; e.vy -= c.ay * 60; },
  },
  // Detonator: a heavy bomber. Chases like a bomber; on contact or on death it
  // arms (accelerating blink telegraph) then erupts in 3 staggered rings.
  detonator: {
    move(e, c, dt) {
      if (!e.detonating) return;                                // unarmed -> default chase
      c.sp = 0;                                                 // freeze once committed
      if (e.detoPhase === 0) {                                  // accelerating-blink windup
        e.detoArm -= dt;
        e.blinkT -= dt;
        if (e.blinkT <= 0) { e.flash = 1; e.blinkT = 0.04 + 0.2 * Math.max(0, e.detoArm) / DETO_ARM; }
        if (e.detoArm <= 0) { e.detoPhase = 1; e.detoT = 0; }
        return;
      }
      e.detoT -= dt;                                            // fire the rings, staggered outward
      if (e.detoT <= 0) {
        const R = DETO_R0 + (e.detoPhase - 1) * DETO_RSTEP;
        explodeAt(e.x, e.y, R, RD); e.flash = 1;
        if (dist(e.x, e.y, player.x, player.y) < R + player.r) hurtPlayer(e.dmg);
        e.detoPhase++;
        if (e.detoPhase > 3) { killEnemy(e, true); return; }
        e.detoT = DETO_STAGGER;
        addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: DETO_R0 + (e.detoPhase - 1) * DETO_RSTEP, dur: DETO_STAGGER, color: RD });
      }
    },
    contact(e) { armDetonator(e); },                            // touching the player sets it off
  },
  // Disruptor: emits a field that mildly slows the player while it's nearby.
  disruptor: {
    move(e, c) {
      if (c.d < DISRUPTOR_RANGE) {
        G.playerSlow = Math.min(G.playerSlow, DISRUPTOR_SLOW);
        if (Math.random() < 0.3) spawnParticle(player.x + rand(-12, 12), player.y + rand(-12, 12), 0, 0, 0.3, 2, MA, 'spark');
      }
    },
  },
  // Juggernaut: rare mini-boss. Telegraphs, then either charges along a line or
  // summons a few minions. Its health bar is always shown (render loop).
  juggernaut: {
    move(e, c, dt) {
      if (e.jugState === 'charge') {
        c.ax = Math.cos(e.jugA); c.ay = Math.sin(e.jugA); c.sp = e.speed * JUG_CHARGE_MUL;
        e.jugT -= dt;
        if (e.jugT <= 0) { e.jugState = null; e.jugCD = rand(JUG_CD[0], JUG_CD[1]); }
        return;
      }
      if (e.jugState === 'wind') {
        c.sp *= 0.2; e.jugT -= dt;
        if (e.jugT <= 0) {
          if (e.jugAct === 'charge') { e.jugState = 'charge'; e.jugT = JUG_CHARGE_DASH; }
          else {
            for (let k = 0; k < JUG_SUMMON; k++) { const a = rand(0, TAU); spawnEnemy(pick(['rusher', 'grunt']), e.x + Math.cos(a) * (e.r + 12), e.y + Math.sin(a) * (e.r + 12), null); }
            G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 8, mr: e.r + 50, life: 0.5, max: 0.5, color: OR, kind: 'ring' });
            e.jugState = null; e.jugCD = rand(JUG_CD[0], JUG_CD[1]);
          }
        }
        return;
      }
      e.jugCD = (e.jugCD ?? rand(JUG_CD[0], JUG_CD[1])) - dt;
      if (e.jugCD <= 0 && c.d < 760) {
        e.jugAct = Math.random() < 0.5 ? 'charge' : 'summon';
        e.jugState = 'wind'; e.jugT = JUG_WIND;
        if (e.jugAct === 'charge') { e.jugA = c.ang; addTelegraph({ kind: 'line', x: e.x, y: e.y, a: e.jugA, len: JUG_CHARGE_RANGE, w: 20, dur: JUG_WIND, color: OR }); }
        else addTelegraph({ kind: 'zone', x: e.x, y: e.y, r: e.r + 60, dur: JUG_WIND, color: OR });
      }
    },
  },
  // ARCHITECT rune node: locked in orbit around the super-boss; fires aimed
  // triples. While any node lives the ARCHITECT's core is heavily shielded.
  archnode: {
    move(e, c, dt) {
      const b = e.arch;
      if (!b || b.dead) { killEnemy(e, false); return; }
      e.orbA += dt * ARCH_NODE_SPIN;
      e.x = b.x + Math.cos(e.orbA) * ARCH_NODE_ORBIT;
      e.y = b.y + Math.sin(e.orbA) * ARCH_NODE_ORBIT;
      e.vx = 0; e.vy = 0; c.sp = 0;
      e.fireT -= dt;
      if (e.fireT <= 0 && c.d < 900) {
        e.fireT = ARCH_NODE_FIRE;
        const a = angTo(e.x, e.y, player.x, player.y);
        for (let s = -1; s <= 1; s++)
          spawnEnemyProjectile(e.x, e.y, Math.cos(a + s * 0.14) * 260, Math.sin(a + s * 0.14) * 260, e.dmg, PU);
      }
    },
  },
  // Saw: a fast buzzsaw that flies in a straight line, bouncing off the arena
  // walls. High contact damage; spins rapidly (rot handled in updateEnemies).
  saw: {
    move(e, c) {
      const lim = ARENA / 2 - e.r;
      if (e.sawA === undefined) e.sawA = angTo(e.x, e.y, player.x, player.y);
      let vx = Math.cos(e.sawA), vy = Math.sin(e.sawA);
      if ((e.x <= -lim && vx < 0) || (e.x >= lim && vx > 0)) vx = -vx;
      if ((e.y <= -lim && vy < 0) || (e.y >= lim && vy > 0)) vy = -vy;
      e.sawA = Math.atan2(vy, vx);
      c.ax = vx; c.ay = vy;                                      // straight heading; c.sp keeps frost slow
    },
  },
};

function updateEnemies(dt) {
  const arr = G.enemies;
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i];
    if (e.dead) { arr.splice(i, 1); if (e === G.boss) G.boss = null; continue; }
    e.flash = Math.max(0, e.flash - dt * 6);
    if (e.spawn > 0) e.spawn -= dt;          // materialization timer (Section J)
    e.rot += dt * (e.type === 'orbiter' ? 4 : e.type === 'saw' ? 7 : 1);

    // frost slow
    e.slow = 1;
    if (G.frost && dist2(player.x, player.y, e.x, e.y) < (G.frost.radius + e.r) ** 2)
      e.slow = 1 - G.frost.slow;

    const ang = angTo(e.x, e.y, player.x, player.y);
    const d = dist(e.x, e.y, player.x, player.y);
    const c = { ang, d, ax: Math.cos(ang), ay: Math.sin(ang), sp: e.speed * e.slow };

    // per-type behaviour (default = chase). Boss dispatched by its flag.
    const beh = e.boss ? EBEHAVIOR.boss : EBEHAVIOR[e.type];
    if (beh && beh.move) beh.move(e, c, dt);
    if (e.frenzy > 0) { e.frenzy -= dt; c.sp *= HIVE_FRENZY_MUL; }   // HIVE pheromone rush

    e.vx = lerp(e.vx, c.ax * c.sp, 0.12);
    e.vy = lerp(e.vy, c.ay * c.sp, 0.12);

    // light separation so they don't fully stack (noSep types are orbit-locked)
    if (!e.boss && !e.noSep) {
      grid.query(e.x, e.y, e.r + 18, _q);
      let px = 0, py = 0, cnt = 0;
      for (let j = 0; j < _q.length; j++) {
        const o = _q[j];
        if (o === e || o.dead) continue;
        const dd = dist2(e.x, e.y, o.x, o.y);
        const min = (e.r + o.r) * 0.9;
        if (dd < min * min && dd > 0.01) {
          const dl = Math.sqrt(dd);
          px += (e.x - o.x) / dl; py += (e.y - o.y) / dl; cnt++;
        }
      }
      if (cnt) { e.vx += px * 26; e.vy += py * 26; }
    }

    e.x += e.vx * dt; e.y += e.vy * dt;
    const lim = ARENA / 2 - e.r;
    e.x = clamp(e.x, -lim, lim); e.y = clamp(e.y, -lim, lim);

    // contact with player — never while still materializing (spawn-in fade /
    // boss entrance): the body renders tiny and faint, so the hit would feel invisible
    if (c.d < e.r + player.r && !(e.spawn > 0) && !(e.boss && e.entrance > 0)) {
      if (beh && beh.contact) beh.contact(e, c);
      else { hurtPlayer(e.dmg, e.x, e.y); e.vx -= c.ax * 60; e.vy -= c.ay * 60; } // default knockback
    }
  }
}

function spawnEnemyProjectile(x, y, vx, vy, dmg, color, opts) {
  if (G.eProj.length >= MAX_EPROJ) G.eProj.shift();   // bound the bullet pool
  const p = { x, y, vx, vy, r: 7, dmg, color, life: 4 };
  if (opts) Object.assign(p, opts);                   // kind/r/life/arm/hatch/turn/spin...
  G.eProj.push(p);
  return p;
}
const EBULLET_CULL = 1600;
function updateEnemyProjectiles(dt) {
  const arr = G.eProj;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    if (p.arm > 0) { p.arm -= dt; continue; }          // telegraphing: faint, stationary, harmless
    if (p.kind === 'home') {                            // gentle seeker
      const a = angTo(p.x, p.y, player.x, player.y), ca = Math.atan2(p.vy, p.vx);
      let da = a - ca; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      const turn = (p.turn || 2) * dt, na = ca + clamp(da, -turn, turn), sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    } else if (p.kind === 'curve') {                   // spiral
      const a = Math.atan2(p.vy, p.vx) + (p.spin || 0) * dt, sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    } else if (p.kind === 'egg') {                      // hatches into a burst
      p.hatch -= dt;
      if (p.hatch <= 0) {
        const n = p.hatchN || 6;
        for (let k = 0; k < n; k++) { const aa = k / n * TAU; spawnEnemyProjectile(p.x, p.y, Math.cos(aa) * 210, Math.sin(aa) * 210, p.dmg, p.color, { kind: 'home', turn: 1.4, life: 2.4, r: 6 }); }
        arr.splice(i, 1); continue;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.kind === 'home' && Math.random() < 0.35 * PERF.fxLevel)   // comet tail (Section J)
      spawnParticle(p.x, p.y, 0, 0, 0.15, 3, p.color, 'spark');
    if (p.life <= 0 || dist2(p.x, p.y, player.x, player.y) > EBULLET_CULL * EBULLET_CULL) { arr.splice(i, 1); continue; }
    if (dist2(p.x, p.y, player.x, player.y) < (p.r + player.r) ** 2) {
      hurtPlayer(p.dmg, p.x - p.vx * 0.1, p.y - p.vy * 0.1);   // indicator points up the bullet's path
      arr.splice(i, 1);
    }
  }
}

/* ===========================================================================
   11. COMBAT RESOLUTION / PARTICLES / PICKUPS / XP
   ========================================================================= */
function spawnParticle(x, y, vx, vy, life, r, color, kind) {
  if (G.particles.length >= PERF.particleBudget) G.particles.shift();
  G.particles.push({ x, y, vx, vy, life, max: life, r, color, kind: kind || 'spark', drag: 0.92 });
}
// Expanding ring shockwave — same budget enforcement as spawnParticle (rings
// pushed straight into G.particles would be exempt from PERF.particleBudget).
function spawnRing(x, y, r, mr, life, color) {
  if (G.particles.length >= PERF.particleBudget) G.particles.shift();
  G.particles.push({ x, y, vx: 0, vy: 0, r, mr, life, max: life, color, kind: 'ring' });
}
function floater(x, y, text, color, size) {
  if (G.floaters.length >= 90) G.floaters.shift();
  G.floaters.push({ x, y, vy: -42, life: 0.8, max: 0.8, text, color, size: size || 14 });
}
function explodeAt(x, y, radius, color) {
  spawnRing(x, y, 8, radius, 0.4, color);
  for (let i = 0, n = Math.max(6, Math.round(16 * PERF.fxLevel)); i < n; i++) {
    const a = rand(0, TAU), s = rand(60, 320);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.55), rand(2, 5), color, 'spark');
  }
  sfx('explode');
  // Keep the screen readable during bullet-hell: damp explosion shake when a boss
  // fight has a lot of bullets on screen.
  G.shake = Math.min(1, G.shake + 0.22 * (G.boss && G.eProj.length > 150 ? 0.4 : 1));
}

function damageEnemy(e, dmg, opts) {
  if (e.dead) return;
  if (e.intangible > 0) return;            // intangible (phantom blink) = takes no damage
  if (e.detonating) return;                // detonator mid-sequence is immune until it bursts
  if (e.boss && e.entrance > 0) return;    // bosses are untouchable while materializing
  opts = opts || {};
  // Shielder: a frontal shield (faces the player) soaks most incoming projectile damage.
  if (e.type === 'shielder' && opts.proj && (opts.kbx || opts.kby)) {
    const from = Math.atan2(-opts.kby, -opts.kbx);   // direction the shot came from
    let da = from - (e.shieldA ?? angTo(e.x, e.y, player.x, player.y));
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    if (Math.abs(da) < SHIELDER_ARC) {
      dmg *= (1 - SHIELDER_BLOCK);
      spawnParticle(e.x + Math.cos(from) * e.r, e.y + Math.sin(from) * e.r, 0, 0, 0.2, 3, BL, 'spark');
    }
  }
  if (e.shieldMul) dmg *= e.shieldMul;     // ARCHITECT core shield while nodes live
  let crit = false;
  if (Math.random() < S().crit) { crit = true; dmg *= S().critMult; }
  dmg = Math.round(dmg);
  e.hp -= dmg;
  e.flash = 1;
  if (e.type === 'detonator' && e.hp <= 0) { armDetonator(e); e.hp = 1; return; } // bomber bursts instead of dying
  if (opts.kb) { const l = Math.hypot(opts.kbx, opts.kby) || 1; e.x += opts.kbx / l * opts.kb * 0.02; e.y += opts.kby / l * opts.kb * 0.02; e.vx += opts.kbx / l * opts.kb; e.vy += opts.kby / l * opts.kb; }
  if (!opts.silent) {
    floater(e.x, e.y - e.r, crit ? dmg + '!' : '' + dmg, crit ? YE : (opts.color || WH), crit ? 20 : 13);
    sfx('hit');
    spawnParticle(e.x, e.y, rand(-60, 60), rand(-60, 60), 0.25, 2.5, opts.color || e.color, 'spark');
  }
  if (e.hp <= 0) killEnemy(e, true);
}

// Normal-enemy utility drop chances (cumulative roll thresholds; intentionally
// rare so pickups feel earned). NOTE: retune once meta-progression exists.
const DROP_HEAL_CHANCE   = 0.004;
const DROP_MAGNET_CHANCE = 0.007;
const DROP_BOMB_CHANCE   = 0.009;
function killEnemy(e, reward) {
  if (e.dead) return;
  e.dead = true;
  if (G.focusTarget === e) G.focusTarget = null;
  explodeAt(e.x, e.y, e.boss ? 200 : (e.elite ? 90 : 40), e.color);
  if (e.boss) {
    sfx('bigExplode'); G.hitstop = 0.12; G.flash = 0.5; G.flashColor = e.color;
    G.nextBossAt = G.time + BOSS_FARM_WINDOW;   // open the next farming window
    if (Sound) { Sound.setIntensity(0.5); Sound.setMusicTempo(116); }
    if (e.bdef && e.bdef.id === 'architect') {
      // THE achievement: cinematic death, legendary drop, permanent meta unlock
      G.hitstop = 0.3; G.flash = 0.9; G.flashColor = WH; G.shake = 1;
      for (let k = 0; k < 5; k++)
        G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, mr: 300 + k * 260, life: 0.7 + k * 0.12, max: 0.7 + k * 0.12, color: [WH, PU, MA, CY, YE][k], kind: 'ring' });
      spawnPickup(e.x, e.y, 'ascendant');
      for (const o of G.enemies) if (o.type === 'archnode' && !o.dead) killEnemy(o, false);
      if (!META.architectSlain) { META.architectSlain = true; saveMeta(META); }
      floater(e.x, e.y - e.r, 'THE ARCHITECT FALLS', WH, 26);
    } else if (e.bdef) {
      spawnPickup(e.x, e.y, e.bdef.drop); spawnPickup(e.x + 44, e.y, 'heal'); // exclusive drop + heal
      // unique Glyph Fragment (one per boss per run) — fuel for the SIGIL
      if (BOSS_IDS.includes(e.bdef.id) && !G.glyphs[e.bdef.id])
        spawnPickup(e.x, e.y + 44, 'glyph', { glyphId: e.bdef.id });
    }
  }

  if (reward !== false) {
    G.kills++;
    G.dirKps += 1;                        // feeds the hidden clear-rate signal
    G.combo++; G.comboTimer = 2.6;
    const mult = 1 + Math.min(G.combo, 60) * 0.02;
    G.score += Math.floor((e.xp * 6 + e.r) * mult);

    // gems — a roster boss pays out ~BOSS_XP_LEVELS level-ups of XP (fixes the
    // v1.5 ~20-levels-at-once dump); normals/elites are unchanged
    if (e.boss) {
      const eff = Math.max(0.25, S().xpGain * (player.buffT.nectar > 0 ? 2 : 1));
      const gemV = Math.max(1, Math.round(xpForLevels(BOSS_XP_LEVELS) / eff / BOSS_GEM_COUNT));
      for (let i = 0; i < BOSS_GEM_COUNT; i++)
        spawnGem(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), gemV);
    } else {
      const gemN = e.elite ? 6 : 1;
      for (let i = 0; i < gemN; i++)
        spawnGem(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), Math.max(1, Math.round(e.xp)));
    }

    // pickups (boss drops handled in the boss branch above)
    if (e.elite) spawnPickup(e.x, e.y, pick(['heal', 'magnet', 'bomb']));
    else {
      const roll = Math.random();
      if (roll < DROP_HEAL_CHANCE) spawnPickup(e.x, e.y, 'heal');
      else if (roll < DROP_MAGNET_CHANCE) spawnPickup(e.x, e.y, 'magnet');
      else if (roll < DROP_BOMB_CHANCE) spawnPickup(e.x, e.y, 'bomb');
    }

    // splitter children
    if (e.type === 'splitter') {
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        spawnEnemy('mini', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, { vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 });
      }
    }
    // hatcher final brood (4-6 minis, a bigger splitter)
    if (e.type === 'hatcher') {
      const brood = randi(HATCHER_DEATH[0], HATCHER_DEATH[1]);
      for (let i = 0; i < brood; i++) {
        const a = rand(0, TAU);
        spawnEnemy('mini', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, { vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 });
      }
    }
  }
  if (e === G.boss) G.boss = null;
}

function spawnGem(x, y, value) {
  if (G.gems.length >= 500) { // auto-collect oldest to bound count
    const g = G.gems.shift(); addXp(g.value);
  }
  G.gems.push({ x, y, value, vx: rand(-40, 40), vy: rand(-40, 40), mag: false, t: 0 });
}
const PICKUP_COLOR = { heal: GR, magnet: BL, bomb: OR, prism: CY, nectar: GR, cleansave: MA, tempo: CY, singularity: PU, glyph: YE, ascendant: WH };
function spawnPickup(x, y, type, opts) {
  const p = { x, y, type, t: 0, vy: 0 };
  if (opts) Object.assign(p, opts);
  G.pickups.push(p);
}

// magnetize every gem currently on screen (magnet/singularity pickups; the
// nectar buff does the same continuously inside updateGems' main loop)
function magnetizeVisibleGems() {
  const os = viewRadius();
  for (const g of G.gems) if (dist(g.x, g.y, player.x, player.y) <= os) g.mag = true;
}
function updateGems(dt) {
  const arr = G.gems;
  const pr = S().pickup;
  // Queen's Nectar: continuously magnetize every on-screen gem while active
  // (folded into the main loop — it already computes each gem's distance).
  const nectarR = player.buffT.nectar > 0 ? viewRadius() : 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const g = arr[i];
    g.t += dt;
    g.vx *= 0.9; g.vy *= 0.9;
    const d = dist(g.x, g.y, player.x, player.y);
    if (nectarR && d <= nectarR) g.mag = true;
    if (g.mag || d < pr) {
      const a = angTo(g.x, g.y, player.x, player.y);
      const pull = g.mag ? 720 : lerp(180, 620, 1 - d / pr);
      g.vx = Math.cos(a) * pull; g.vy = Math.sin(a) * pull;
    }
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (d < player.r + 10) { addXp(g.value); sfx('pickup'); spawnParticle(player.x, player.y, rand(-40, 40), rand(-80, -20), 0.3, 2, GR, 'spark'); arr.splice(i, 1); }
  }
}
function updatePickups(dt) {
  const arr = G.pickups;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.t += dt;
    if (dist(p.x, p.y, player.x, player.y) < player.r + 18) {
      applyPickup(p.type, p);
      arr.splice(i, 1);
    }
  }
}

// Timed boss buffs. triple/nectar are hooked centrally (firePlayerProjectile,
// updateGems, addXp); aura damages around the player on a tick.
const AURA_RADIUS = 130, AURA_DMG = 26, AURA_TICK = 0.25;
function updateBuffs(dt) {
  const b = player.buffT;
  if (b.triple > 0) b.triple -= dt;
  if (b.nectar > 0) b.nectar -= dt;
  if (b.aura > 0) {
    b.aura -= dt;
    b.auraTick -= dt;
    if (b.auraTick <= 0) {
      b.auraTick = AURA_TICK;
      const R = AURA_RADIUS * Math.sqrt(S().areaMul);
      grid.query(player.x, player.y, R, _wq);
      for (let j = 0; j < _wq.length; j++) { const e = _wq[j]; if (e.dead) continue; if (dist2(player.x, player.y, e.x, e.y) < (R + e.r) ** 2) damageEnemy(e, AURA_DMG * S().damageMul, { color: PU, silent: true }); }
    }
  }
}
const BUFF_TRIPLE_T = 12, BUFF_NECTAR_T = 12, BUFF_AURA_T = 10, CLEANSAVE_INVULN = 2.5, TEMPO_MUL = 1.08;
function applyPickup(type, p) {
  if (type === 'heal') {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
    floater(player.x, player.y - 24, '+HP', GR, 18); sfx('coin');
    for (let i = 0; i < 16; i++) spawnParticle(player.x, player.y, rand(-120, 120), rand(-120, 120), 0.5, 3, GR, 'spark');
  } else if (type === 'magnet') {
    magnetizeVisibleGems();                  // on-screen gems only; off-screen are left alone
    floater(player.x, player.y - 24, 'MAGNET', BL, 18); sfx('coin');
  } else if (type === 'bomb') {
    sfx('bigExplode'); G.shake = 1; G.flash = 0.6; G.flashColor = OR; G.hitstop = 0.08;
    G.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 12, mr: 900, life: 0.6, max: 0.6, color: OR, kind: 'ring' });
    // Clears the field but never touches bosses; killed enemies yield nothing
    // (no gems, no pickups, no splitter children) via killEnemy(e, false).
    for (const e of G.enemies.slice()) { if (e.boss) continue; killEnemy(e, false); }
    G.eProj.length = 0;
    G.spawnRamp = 0;                      // director re-ramps over BOMB_RAMP_TIME, no snap-back
    floater(player.x, player.y - 24, 'BOOM', OR, 22);
  } else if (type === 'prism') {            // Prism Shard — triple-fire
    player.buffT.triple = BUFF_TRIPLE_T;
    floater(player.x, player.y - 24, 'PRISM SHARD', CY, 18); sfx('coin');
    for (let i = 0; i < 14; i++) spawnParticle(player.x, player.y, rand(-120, 120), rand(-120, 120), 0.5, 3, CY, 'spark');
  } else if (type === 'nectar') {           // Queen's Nectar — magnet + x2 XP
    player.buffT.nectar = BUFF_NECTAR_T;
    floater(player.x, player.y - 24, "QUEEN'S NECTAR", GR, 18); sfx('coin');
    for (let i = 0; i < 14; i++) spawnParticle(player.x, player.y, rand(-120, 120), rand(-120, 120), 0.5, 3, YE, 'spark');
  } else if (type === 'cleansave') {        // Clean Save — full heal + invuln
    player.hp = player.maxHp; player.invuln = Math.max(player.invuln, CLEANSAVE_INVULN);
    floater(player.x, player.y - 24, 'CLEAN SAVE', MA, 18); sfx('coin');
    for (let i = 0; i < 18; i++) spawnParticle(player.x, player.y, rand(-150, 150), rand(-150, 150), 0.6, 3, MA, 'spark');
  } else if (type === 'tempo') {            // Tempo Core — permanent attack-speed stack
    player.stats.attackSpeedMul *= TEMPO_MUL;
    floater(player.x, player.y - 24, 'TEMPO+', CY, 18); sfx('coin');
    for (let i = 0; i < 12; i++) spawnParticle(player.x, player.y, rand(-110, 110), rand(-110, 110), 0.45, 3, CY, 'spark');
  } else if (type === 'singularity') {      // Singularity Fragment — magnetize all + damage aura
    magnetizeVisibleGems();
    player.buffT.aura = BUFF_AURA_T; player.buffT.auraTick = 0;
    floater(player.x, player.y - 24, 'SINGULARITY', PU, 18); sfx('coin');
    for (let i = 0; i < 16; i++) spawnParticle(player.x, player.y, rand(-130, 130), rand(-130, 130), 0.6, 3, PU, 'spark');
  } else if (type === 'glyph') {            // ARCHITECT Glyph Fragment (Section D)
    if (p && p.glyphId) G.glyphs[p.glyphId] = true;
    const n = Object.keys(G.glyphs).length;
    G.glyphCount = n;                        // cached for the per-frame HUD draw
    floater(player.x, player.y - 24, 'GLYPH ' + n + '/' + BOSS_IDS.length, YE, 18); sfx('coin');
    for (let i = 0; i < 14; i++) spawnParticle(player.x, player.y, rand(-120, 120), rand(-120, 120), 0.5, 3, YE, 'spark');
    if (n >= BOSS_IDS.length && G.sigil === 0) {
      G.sigil = 1;
      G.bossBanner = { name: 'THE SIGIL IS FORGED', life: 3.0, max: 3.0 };
      floater(player.x, player.y - 48, IS_TOUCH ? 'TAP THE SIGIL TO SUMMON' : 'PRESS G TO SUMMON', WH, 14);
      sfx('levelup');
    }
  } else if (type === 'ascendant') {        // legendary: the Ascendant Core
    player.stats.damageMul *= ASCENDANT_DMG;
    player.stats.attackSpeedMul *= ASCENDANT_AS;
    player.hp = player.maxHp;
    player.invuln = Math.max(player.invuln, ASCENDANT_INVULN);
    floater(player.x, player.y - 24, 'ASCENDANT CORE', WH, 22); sfx('levelup');
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU);
      spawnParticle(player.x, player.y, Math.cos(a) * rand(80, 380), Math.sin(a) * rand(80, 380), rand(0.5, 1.0), rand(2, 5), pick([WH, PU, CY, MA]), 'spark');
    }
  }
}

// Total XP needed to carry the player through their next n level-ups (mirrors
// the xpNext curve in addXp). Used to size boss XP payouts.
function xpForLevels(n) {
  let total = Math.max(0, player.xpNext - player.xp), lvl = player.level;
  for (let i = 1; i < n; i++) { lvl++; total += Math.floor(6 + lvl * 4 + Math.pow(lvl, 1.55)); }
  return Math.max(1, total);
}

function addXp(v) {
  player.xp += v * S().xpGain * (player.buffT.nectar > 0 ? 2 : 1);   // Queen's Nectar doubles XP
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level++;
    player.xpNext = Math.floor(6 + player.level * 4 + Math.pow(player.level, 1.55));
    G.pendingLevels++;
    sfx('levelup');
    player.hp = Math.min(player.maxHp, player.hp + 8);
    // level-up flourish (Section J): golden double ring + floater
    G.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: player.r, mr: 130, life: 0.5, max: 0.5, color: YE, kind: 'ring' });
    G.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: player.r, mr: 200, life: 0.65, max: 0.65, color: WH, kind: 'ring' });
    floater(player.x, player.y - 30, 'LEVEL UP', YE, 18);
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU); spawnParticle(player.x, player.y, Math.cos(a) * rand(60, 260), Math.sin(a) * rand(60, 260), rand(0.4, 0.8), rand(2, 4), YE, 'spark'); }
  }
}

function updateProjectiles(dt) {
  const arr = G.pProj;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) {
      // a Singularity orb collapses into a pulling well where it expires
      if (p.kind === 'vortex' && p._w) {
        const zs = p._w.data.zones;
        if (zs.length >= p.maxZones) zs.shift();
        zs.push({ x: p.x, y: p.y, radius: p.zoneR, life: p.zoneDur, max: p.zoneDur, dmg: p.zoneDmg, pull: p.zonePull, tick: 0 });
      }
      arr.splice(i, 1); continue;
    }

    if (p.kind === 'missile') {
      if (!p.target || p.target.dead) p.target = nearestEnemy(p.x, p.y, 600);
      if (p.target) {
        const a = angTo(p.x, p.y, p.target.x, p.target.y);
        const ca = Math.atan2(p.vy, p.vx);
        let da = a - ca; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const na = ca + clamp(da, -p.homing * dt, p.homing * dt);
        const sp = Math.min(560, Math.hypot(p.vx, p.vy) + 900 * dt);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
    }

    if (p.kind === 'glaive') {
      // fly out to its reach, then home back to the player; re-hits on the way back
      p.spin = (p.spin || 0) + dt * 22;
      if (!p.returning) {
        if (dist2(p.x, p.y, p.ox, p.oy) > p.reach * p.reach) { p.returning = true; if (p.hit) p.hit.clear(); }
      } else {
        const a = angTo(p.x, p.y, player.x, player.y);
        const ca = Math.atan2(p.vy, p.vx);
        let da = a - ca; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const na = ca + clamp(da, -p.homing * dt, p.homing * dt);
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        if (dist2(p.x, p.y, player.x, player.y) < (player.r + p.r) ** 2) p.life = 0;
      }
    } else if (p.kind === 'flak') {
      // airburst at mid-life into a cone of shrapnel bolts
      if (!p.burst && p.life <= p.life0 * 0.5) {
        p.burst = true;
        const n = p.shr, ss = 360 * S().projSpeedMul;
        for (let k = 0; k < n; k++) {
          const aa = p.aimA + (n > 1 ? (k - (n - 1) / 2) * (p.shrSpread / (n - 1)) : 0);
          firePlayerProjectile({ x: p.x, y: p.y, vx: Math.cos(aa) * ss, vy: Math.sin(aa) * ss, r: 5, dmg: p.shrDmg, pierce: 0, life: 0.5 * S().projDurMul, color: YE, hit: new Set() });
        }
        p.life = 0; sfx('explode');
      }
    }

    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.trail && Math.random() < 0.6 * PERF.fxLevel) spawnParticle(p.x, p.y, 0, 0, 0.18, p.r * 0.7, p.color, 'spark');

    // flak shells & vortex orbs deal no contact damage; their effect is on a timer
    if (p.kind !== 'flak' && p.kind !== 'vortex') {
      grid.query(p.x, p.y, p.r + 30, _q);
      for (let j = 0; j < _q.length; j++) {
        const e = _q[j];
        if (e.dead) continue;
        if (e.intangible > 0) continue;   // phantoms phase through projectiles
        if (p.hit && p.hit.has(e.id)) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) ** 2) {
          // Reflector: a chance to bounce the shot back at the player as a hostile bolt.
          if (e.type === 'reflector' && p.kind !== 'missile' && Math.random() < REFLECTOR_CHANCE) {
            const a = angTo(e.x, e.y, player.x, player.y);
            spawnEnemyProjectile(e.x, e.y, Math.cos(a) * REFLECTOR_SHOT, Math.sin(a) * REFLECTOR_SHOT, p.dmg * 0.6, CY);
            spawnParticle(e.x, e.y, 0, 0, 0.25, 4, CY, 'spark');
            p.life = 0; break;
          }
          if (p.kind === 'missile') {
            explodeAt(p.x, p.y, p.blast, OR);
            grid.query(p.x, p.y, p.blast, _q);
            for (let k = 0; k < _q.length; k++) { const e2 = _q[k]; if (!e2.dead && dist2(p.x, p.y, e2.x, e2.y) < (p.blast + e2.r) ** 2) damageEnemy(e2, p.dmg, { color: OR, kbx: e2.x - p.x, kby: e2.y - p.y, kb: 90 }); }
            p.life = 0; break;
          } else if (p.kind === 'glaive') {
            damageEnemy(e, p.dmg, { kbx: p.vx, kby: p.vy, kb: 50, color: GR, proj: true });
            if (p.hit) p.hit.add(e.id);   // hit-set lets it re-hit after clearing on the return pass
          } else {
            damageEnemy(e, p.dmg, { kbx: p.vx, kby: p.vy, kb: 60, color: p.color, proj: true });
            if (p.hit) p.hit.add(e.id);
            if (p.pierce > 0) p.pierce--;
            else { p.life = 0; break; }
          }
        }
      }
    }
    if (p.life <= 0) arr.splice(i, 1);
  }
}

function updateParticles(dt) {
  const arr = G.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) { arr.splice(i, 1); continue; }
    if (p.kind === 'ring') { p.r = lerp(p.r, p.mr, 1 - p.life / p.max); }
    else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= p.drag; p.vy *= p.drag; }
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) { const f = G.floaters[i]; f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94; if (f.life <= 0) G.floaters.splice(i, 1); }
  for (let i = G.beams.length - 1; i >= 0; i--) { if ((G.beams[i].life -= dt) <= 0) G.beams.splice(i, 1); }
  for (let i = G.arcs.length - 1; i >= 0; i--) { if ((G.arcs[i].life -= dt) <= 0) G.arcs.splice(i, 1); }
  for (let i = G.telegraphs.length - 1; i >= 0; i--) { if ((G.telegraphs[i].life -= dt) <= 0) G.telegraphs.splice(i, 1); }
  for (let i = G.trail.length - 1; i >= 0; i--) { if ((G.trail[i].life -= dt) <= 0) G.trail.splice(i, 1); }
}

/* ===========================================================================
   12. UPDATE
   ========================================================================= */
function update(dt) {
  if (G.state !== 'playing') { updateAmbient(dt); return; }

  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.12; }

  G.time += dt;
  G.frost = null;

  // enemy-level unlock marker (Section E)
  if (G.lvUnlockAt === null && (G.bossTier >= ENEMY_LV_START_TIER || G.time >= ENEMY_LV_START_TIME))
    G.lvUnlockAt = G.time;

  // bomb aftermath: spawn pressure climbs back progressively, never snaps
  if (G.spawnRamp < 1) G.spawnRamp = Math.min(1, G.spawnRamp + dt / BOMB_RAMP_TIME);

  // ARCHITECT summoning ritual: rumble + matter streaming into the portal
  if (G.ritual) {
    G.ritual.t -= dt;
    G.shake = Math.min(1, G.shake + dt * 0.25);
    if (Math.random() < 0.7) {
      const a = rand(0, TAU), rr = rand(200, 480);
      spawnParticle(Math.cos(a) * rr, Math.sin(a) * rr, -Math.cos(a) * 320, -Math.sin(a) * 320, 0.5, 3, pick([PU, MA, CY]), 'spark');
    }
    if (G.ritual.t <= 0) { G.ritual = null; spawnArchitect(); }
  }

  // spawn waves / bosses
  director(dt);

  // rebuild spatial hash
  grid.clear();
  for (let i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead) grid.insert(G.enemies[i]);

  // input → movement
  const mv = moveVector();
  if (G.inputHiccup > 0) { G.inputHiccup -= dt; mv.x = 0; mv.y = 0; mv.mag = 0; }   // GLITCH boss hiccup
  const speed = BASE_SPEED * S().moveSpeedMul;
  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vx = player.dashDir.x * speed * DASH_SPEED_MUL;
    player.vy = player.dashDir.y * speed * DASH_SPEED_MUL;
    if (Math.random() < 0.8) spawnParticle(player.x, player.y, rand(-30, 30), rand(-30, 30), 0.25, 3, CY, 'spark');
    G.trail.push({ x: player.x, y: player.y, aim: player.aim, life: DASH_TRAIL_LIFE, max: DASH_TRAIL_LIFE });
    if (player.dashTime <= 0) {                 // momentum carries out of the dash
      player.vx = player.dashDir.x * speed * DASH_SPEED_MUL * DASH_VEL_CARRY;
      player.vy = player.dashDir.y * speed * DASH_SPEED_MUL * DASH_VEL_CARRY;
    }
  } else {
    const ms = speed * G.playerSlow;            // disruptor fields drag this below 1
    // quick turn-response (Section F): steer harder the more the input opposes
    // current velocity — direction changes feel snappy, never ice-skating
    let resp = MOVE_LERP;
    const cv = Math.hypot(player.vx, player.vy);
    if (cv > 40 && mv.mag > 0) {
      const dot = (player.vx * mv.x + player.vy * mv.y) / cv;
      if (dot < 0.5) resp = Math.min(1, MOVE_LERP * (1 + TURN_ASSIST * (0.5 - dot)));
    }
    player.vx = lerp(player.vx, mv.x * ms * mv.mag, resp);
    player.vy = lerp(player.vy, mv.y * ms * mv.mag, resp);
  }
  player.x += player.vx * dt; player.y += player.vy * dt;
  const lim = ARENA / 2 - player.r;
  player.x = clamp(player.x, -lim, lim); player.y = clamp(player.y, -lim, lim);
  G.playerSlow = 1;                             // reset; disruptors re-apply during updateEnemies
  const spd = Math.hypot(player.vx, player.vy);

  // aim toward movement or nearest enemy
  if (spd > 30) player.aim = Math.atan2(player.vy, player.vx);
  else { const t = nearestEnemy(player.x, player.y); if (t) player.aim = angTo(player.x, player.y, t.x, t.y); }

  // thruster particles (budget-aware)
  if (spd > 40 && Math.random() < 0.7 * PERF.fxLevel) {
    const a = Math.atan2(player.vy, player.vx) + Math.PI;
    spawnParticle(player.x + Math.cos(a) * 10, player.y + Math.sin(a) * 10, Math.cos(a) * rand(30, 90) + rand(-20, 20), Math.sin(a) * rand(30, 90) + rand(-20, 20), rand(0.2, 0.4), rand(1.5, 3), CY, 'spark');
  }

  // timers
  if (player.invuln > 0) player.invuln -= dt;
  if (player.dashCD > 0) player.dashCD -= dt;
  if (S().regen > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + S().regen * dt);
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }

  // weapons
  for (const w of player.weapons) WEAPONS[w.id].update(w, dt);
  updateBuffs(dt);

  // entities
  updateProjectiles(dt);
  updateEnemies(dt);
  updateEnemyProjectiles(dt);
  updateGems(dt);
  updatePickups(dt);
  updateParticles(dt);

  // camera + shake decay (smooth lerp, dash punch-in)
  G.cam.x = lerp(G.cam.x, player.x, CAM_LERP);
  G.cam.y = lerp(G.cam.y, player.y, CAM_LERP);
  G.dashZoom = lerp(G.dashZoom, player.dashTime > 0 ? DASH_ZOOM : 0, Math.min(1, 12 * dt));
  G.shake = Math.max(0, G.shake - dt * 1.6);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.4);
  if (G.glitchFX > 0) G.glitchFX = Math.max(0, G.glitchFX - dt * 1.5);
  if (G.bossBanner && (G.bossBanner.life -= dt) <= 0) G.bossBanner = null;
  if (G.dmgDir && (G.dmgDir.t -= dt) <= 0) G.dmgDir = null;
  if (!META.firstRunDone && G.time >= FIRST_RUN_HINT_T) { META.firstRunDone = true; saveMeta(META); }

  // music intensity ramps with on-screen pressure + time
  if (Sound) Sound.setIntensity(clamp(G.enemies.length / 120 + G.time / 600 + (G.boss ? 0.5 : 0), 0, 1));

  // level up?
  if (G.pendingLevels > 0) openLevelUp();
}

// ambient drifting glows for the title / game over backdrop
let ambientT = 0;
function updateAmbient(dt) {
  ambientT += dt;
  G.cam.x = Math.sin(ambientT * 0.1) * 120;
  G.cam.y = Math.cos(ambientT * 0.08) * 120;
  if (Math.random() < 0.5 && G.particles.length < 160) {
    const a = rand(0, TAU), d = rand(200, 700);
    spawnParticle(G.cam.x + Math.cos(a) * d, G.cam.y + Math.sin(a) * d, rand(-20, 20), rand(-20, 20), rand(2, 4), rand(2, 5), pick([CY, MA, PU, YE, GR]), 'spark');
  }
  updateParticles(dt);
}

/* ===========================================================================
   13. RENDER
   ========================================================================= */
let starLayer = null;
function makeStars() {
  starLayer = [];
  for (let i = 0; i < 160; i++)
    starLayer.push({ x: rand(0, 2000), y: rand(0, 2000), z: rand(0.2, 1), s: rand(0.5, 1.8), c: pick([WH, CY, PU, '#bcd', MA]) });
}
makeStars();

function drawBackground() {
  // base gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0726'); g.addColorStop(0.6, '#070418'); g.addColorStop(1, '#04020e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // parallax stars (screen space)
  ctx.globalCompositeOperation = 'lighter';
  for (const st of starLayer) {
    const px = ((st.x - G.cam.x * st.z * 0.5) % 2000 + 2000) % 2000 / 2000 * (W + 40) - 20;
    const py = ((st.y - G.cam.y * st.z * 0.5) % 2000 + 2000) % 2000 / 2000 * (H + 40) - 20;
    const tw = 0.5 + 0.5 * Math.sin(G.time * 2 + st.x);
    glow(px, py, st.s * (2 + st.z * 2), st.c, 0.5 * st.z * tw + 0.2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function worldTransform() {
  let sx = 0, sy = 0;
  if (G.shake > 0) { const t = G.shake * G.shake * 16; sx = rand(-t, t); sy = rand(-t, t); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.translate(W / 2, H / 2);
  const z = effZoom();                    // dash punch-in × mobile zoom-out
  ctx.scale(z, z);
  ctx.translate(-G.cam.x + sx, -G.cam.y + sy);
}

function drawGrid() {
  const step = 80;
  const vw = W / camZoom, vh = H / camZoom;   // zoomed-out view sees more world
  const x0 = G.cam.x - vw / 2 - step, x1 = G.cam.x + vw / 2 + step;
  const y0 = G.cam.y - vh / 2 - step, y1 = G.cam.y + vh / 2 + step;
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(CY, 0.05);
  ctx.beginPath();
  for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();

  // arena border glow
  const a = ARENA / 2;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(MA, 0.5);
  ctx.lineWidth = 4;
  ctx.shadowColor = MA; ctx.shadowBlur = 24;
  ctx.strokeRect(-a, -a, ARENA, ARENA);
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-over';
}

function drawShapeFor(e, rs) {
  const r = e.r * (rs || 1);
  switch (e.shape) {
    case 'diamond': poly(e.x, e.y, r, 4, e.rot); break;
    case 'tri':     poly(e.x, e.y, r, 3, e.rot); break;
    case 'square':  poly(e.x, e.y, r, 4, e.rot + 0.785); break;
    case 'penta':   poly(e.x, e.y, r, 5, e.rot); break;
    case 'hex':     poly(e.x, e.y, r, 6, e.rot); break;
    case 'circle':  ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); break;
    case 'spiky':   star(e.x, e.y, r, 7, e.rot, 0.55); break;
    case 'boss':    star(e.x, e.y, r, 6, e.rot, 0.6); break;
    default:        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU);
  }
}

function render() {
  drawBackground();
  worldTransform();
  drawGrid();

  // frost field visual
  if (G.frost) {
    ctx.globalCompositeOperation = 'lighter';
    glow(player.x, player.y, G.frost.radius, '#7fe9ff', 0.10);
    ctx.strokeStyle = rgba('#7fe9ff', 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, G.frost.radius, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  // ARCHITECT summoning portal at the arena center (Section D)
  if (G.ritual) {
    const k = 1 - G.ritual.t / ARCH_RITUAL;            // 0 -> 1 as it tears open
    const R = 60 + 200 * k;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba([PU, MA, CY][i], 0.5); ctx.lineWidth = 3;
      const a0 = G.time * (2 + i);
      ctx.beginPath(); ctx.arc(0, 0, R * (0.6 + i * 0.25), a0, a0 + 4.2); ctx.stroke();
    }
    glow(0, 0, R, PU, 0.35 + 0.25 * Math.sin(G.time * 7));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba('#05030f', 0.5 + 0.4 * k);    // the void behind the swarm
    ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, TAU); ctx.fill();
  }

  /* ---- additive GLOW pass ---- */
  ctx.globalCompositeOperation = 'lighter';

  // gems (glow pass thins out on weak devices; the crisp body pass never does)
  for (let i = 0; i < G.gems.length; i++) {
    if (PERF.fxLevel < 0.6 && (i & 1)) continue;
    const g = G.gems[i];
    glow(g.x, g.y, 7, GR, 0.8);
  }
  // pickups (gentle bob + pulsing glow)
  for (const p of G.pickups) { const c = PICKUP_COLOR[p.type] || WH; glow(p.x, p.y + Math.sin(p.t * 3) * 3, 16 + Math.sin(p.t * 6) * 3, c, 0.9); }
  // enemy projectiles
  for (const p of G.eProj) glow(p.x, p.y, p.r * 2.2, p.color, p.arm > 0 ? 0.3 : 0.9);
  // enemy glows (spawn-in: glow swells with the materializing body)
  for (const e of G.enemies) {
    const sk = e.spawn > 0 ? 1 - clamp(e.spawn / ENEMY_SPAWNIN_T, 0, 1) : 1;
    glow(e.x, e.y, e.r * (e.boss ? 2.2 : 1.9) * (0.5 + 0.5 * sk), e.flash > 0.3 ? WH : e.color, (e.boss ? 0.8 : 0.6) * (0.3 + 0.7 * sk));
  }
  // player projectiles
  for (const p of G.pProj) glow(p.x, p.y, p.r * 2.6, p.color, 0.95);
  // weapon-specific glows (orbital blades)
  for (const w of player.weapons) { const def = WEAPONS[w.id]; if (def.draw) def.draw(w); }
  // beams
  for (const b of G.beams) {
    const a = b.life / b.max;
    ctx.strokeStyle = rgba(b.color, a); ctx.lineWidth = b.w * a;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.strokeStyle = rgba(WH, a * 0.8); ctx.lineWidth = b.w * a * 0.4;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
  }
  // arcs (lightning)
  for (const arc of G.arcs) {
    const a = arc.life / arc.max;
    ctx.strokeStyle = rgba(arc.color, a); ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < arc.pts.length - 1; i++) {
      const p0 = arc.pts[i], p1 = arc.pts[i + 1];
      ctx.moveTo(p0.x, p0.y);
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const jx = (Math.random() - 0.5) * 18 * (1 - Math.abs(t - 0.5) * 2);
        const jy = (Math.random() - 0.5) * 18 * (1 - Math.abs(t - 0.5) * 2);
        ctx.lineTo(lerp(p0.x, p1.x, t) + jx, lerp(p0.y, p1.y, t) + jy);
      }
    }
    ctx.stroke();
  }
  // enemy attack telegraphs — warning shapes that pulse + intensify before the hit lands
  for (const tg of G.telegraphs) {
    const k = 1 - tg.life / tg.max;                                   // 0 -> 1 as the hit nears
    const a = Math.max(0, (0.12 + 0.5 * k) * (0.65 + 0.35 * Math.sin(G.time * 20)));
    if (tg.kind === 'line') {
      const ex = tg.x + Math.cos(tg.a) * tg.len, ey = tg.y + Math.sin(tg.a) * tg.len;
      ctx.strokeStyle = rgba(tg.color, a); ctx.lineWidth = tg.w * (0.4 + 0.8 * k);
      ctx.beginPath(); ctx.moveTo(tg.x, tg.y); ctx.lineTo(ex, ey); ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(tg.color, a); ctx.lineWidth = 2 + 3 * k;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(tg.color, a * 0.16); ctx.fill();
    }
  }
  // particles (sparks + rings)
  for (const p of G.particles) {
    const a = p.life / p.max;
    if (p.kind === 'ring') {
      ctx.strokeStyle = rgba(p.color, a * 0.7); ctx.lineWidth = 3 + 5 * a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    } else {
      glow(p.x, p.y, p.r * 2.4, p.color, a * 0.9);
    }
  }
  // player glow
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'levelup') {
    const blink = player.invuln > 0 && Math.floor(G.time * 20) % 2 === 0;
    if (!blink) glow(player.x, player.y, 26, CY, 0.9);
  }

  /* ---- crisp BODY pass ---- */
  ctx.globalCompositeOperation = 'source-over';

  // pickups: hex badge + vector glyph (no fonts -> crisp everywhere)
  for (const p of G.pickups) {
    const c = PICKUP_COLOR[p.type] || WH;
    const bobY = p.y + Math.sin(p.t * 3) * 3;
    ctx.fillStyle = rgba(c, 0.18); ctx.strokeStyle = c; ctx.lineWidth = 2;
    poly(p.x, bobY, 13, 6, p.t * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(p.x, bobY); ctx.strokeStyle = WH; ctx.fillStyle = WH; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    if (p.type === 'heal') {                 // plus
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
    } else if (p.type === 'magnet') {        // horseshoe magnet
      ctx.beginPath(); ctx.arc(0, -1, 5, Math.PI, 0); ctx.moveTo(-5, -1); ctx.lineTo(-5, 4); ctx.moveTo(5, -1); ctx.lineTo(5, 4); ctx.stroke();
    } else if (p.type === 'bomb') {          // starburst
      star(0, 0, 6, 4, p.t * 3, 0.4); ctx.fill();
    } else if (p.type === 'prism') {         // triangle (refraction)
      poly(0, 0, 6, 3, p.t * 2); ctx.stroke();
    } else if (p.type === 'nectar') {        // honeycomb cell
      poly(0, 0, 6, 6, 0); ctx.stroke();
    } else if (p.type === 'cleansave') {     // refresh loop
      ctx.beginPath(); ctx.arc(0, 0, 5, 0.5, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(6, 0); ctx.lineTo(1, -1); ctx.stroke();
    } else if (p.type === 'tempo') {         // fast-forward >>
      ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(0, 0); ctx.lineTo(-5, 4); ctx.moveTo(0, -4); ctx.lineTo(5, 0); ctx.lineTo(0, 4); ctx.stroke();
    } else if (p.type === 'singularity') {   // ring + core
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    } else if (p.type === 'glyph') {         // rune shard (diamond + dot)
      poly(0, 0, 6, 4, Math.PI / 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
    } else if (p.type === 'ascendant') {     // radiant core
      star(0, 0, 7, 5, p.t * 2, 0.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // gems
  for (const g of G.gems) { ctx.fillStyle = GR; poly(g.x, g.y, 4.5, 4, G.time * 3); ctx.fill(); }
  // enemies
  for (const e of G.enemies) {
    if (e.boss && e.bdef) {                                // bosses render their own procedural body
      if (e.entrance > 0) {                                // materialization: scale + fade in
        const k = clamp(1 - e.entrance / BOSS_ENTRANCE_T, 0, 1);
        const s = 0.25 + 0.75 * (1 - (1 - k) * (1 - k));   // ease-out
        ctx.save(); ctx.globalAlpha = 0.15 + 0.85 * k;
        ctx.translate(e.x, e.y); ctx.scale(s, s); ctx.translate(-e.x, -e.y);
        e.bdef.draw(e); ctx.restore();
        ctx.strokeStyle = rgba(e.color, 0.18 + 0.5 * (1 - k));   // summoning sigil
        ctx.lineWidth = 2;
        poly(e.x, e.y, e.r * (2.6 - 1.2 * k), 6, G.time * 1.7); ctx.stroke();
        poly(e.x, e.y, e.r * (2.0 - 0.8 * k), 3, -G.time * 2.3); ctx.stroke();
        continue;
      }
      e.bdef.draw(e); continue;
    }
    const phasing = e.type === 'phantom' && e.intangible > 0;
    // spawn-in (Section J): bodies scale and fade in instead of popping
    const spawnK = e.spawn > 0 ? 1 - clamp(e.spawn / ENEMY_SPAWNIN_T, 0, 1) : 1;
    const scaleK = spawnK < 1 ? 0.3 + 0.7 * spawnK : 1;
    let alpha = 1;
    if (phasing) alpha = (e.phState === 'fade') ? clamp(0.25 + 0.7 * (e.ghostA ?? 1), 0.25, 1) : 0.3; // fade-out telegraph, then ghostly
    if (spawnK < 1) alpha *= 0.25 + 0.75 * spawnK;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.lineWidth = e.boss ? 4 : (e.type === 'juggernaut' ? 3.2 : 2.2);
    ctx.strokeStyle = e.flash > 0.3 ? WH : e.color;
    ctx.fillStyle = e.flash > 0.5 ? rgba(WH, 0.8) : rgba(e.color, e.slow < 1 ? 0.45 : 0.22);
    drawShapeFor(e, scaleK); ctx.fill(); ctx.stroke();
    if (e.slow < 1) { ctx.strokeStyle = rgba('#bff', 0.6); ctx.lineWidth = 1; drawShapeFor(e, scaleK); ctx.stroke(); }
    // shielder: bright frontal shield arc facing the player
    if (e.type === 'shielder') {
      const sa = e.shieldA ?? angTo(e.x, e.y, player.x, player.y);
      ctx.strokeStyle = rgba(BL, 0.9); ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, sa - SHIELDER_ARC, sa + SHIELDER_ARC); ctx.stroke();
    }
    if (alpha < 1) ctx.globalAlpha = 1;
    // boss / elite / juggernaut health bar
    if (e.boss) { /* drawn in HUD */ }
    else if (e.elite || e.type === 'juggernaut' || (e.maxHp > 60 && e.hp < e.maxHp)) {
      const w = e.r * 2;
      ctx.fillStyle = rgba('#000', 0.5); ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
      ctx.fillStyle = e.color; ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    // focus reticle (Section H): four rotating arcs around the focused creature
    if (G.focusTarget === e) {
      const rr = e.r + 10 + 2 * Math.sin(G.time * 6);
      ctx.strokeStyle = rgba(WH, 0.75); ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        const a = G.time * 1.5 + k / 4 * TAU;
        ctx.beginPath(); ctx.arc(e.x, e.y, rr, a, a + 0.7); ctx.stroke();
      }
    }
    // level badge (Section E): only when meaningfully leveled
    if (e.lv > 1) {
      ctx.font = LV_BADGE_FONT;            // counter-scaled so it's readable under camZoom
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(YE, 0.85);
      ctx.fillText('Lv ' + e.lv, e.x, e.y - e.r - 12);
    }
  }
  // enemy projectiles core
  for (const p of G.eProj) {
    if (p.arm > 0) { ctx.fillStyle = rgba(p.color, 0.4); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.4, 0, TAU); ctx.fill(); continue; } // telegraphing
    ctx.fillStyle = WH;
    if (p.kind === 'square') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(G.time * 6); ctx.fillRect(-p.r * 0.5, -p.r * 0.5, p.r, p.r); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.5, 0, TAU); ctx.fill(); }
  }
  // player projectile cores
  for (const p of G.pProj) {
    ctx.fillStyle = WH;
    if (p.kind === 'missile') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillStyle = OR; poly(0, 0, p.r + 2, 3, 0); ctx.fill(); ctx.restore(); }
    else if (p.kind === 'glaive') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin || 0); ctx.strokeStyle = GR; ctx.lineWidth = 2.5; poly(0, 0, p.r, 3, 0); ctx.stroke(); ctx.strokeStyle = WH; ctx.lineWidth = 1.2; poly(0, 0, p.r * 0.5, 3, Math.PI); ctx.stroke(); ctx.restore(); }
    else if (p.kind === 'vortex') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(G.time * 6); ctx.strokeStyle = PU; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 1.5); ctx.stroke(); ctx.restore(); }
    else if (p.kind === 'flak') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(G.time * 8); ctx.fillStyle = YE; star(0, 0, p.r, 4, 0, 0.5); ctx.fill(); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU); ctx.fill(); }
  }
  // dash motion trail (Section F): ghost ships fading behind the dash
  if (G.trail.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const g of G.trail) {
      const a = clamp(g.life / g.max, 0, 1) * 0.5;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.aim); ctx.globalAlpha = a;
      ctx.fillStyle = rgba(CY, 0.8);
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-11, 10); ctx.lineTo(-6, 0); ctx.lineTo(-11, -10);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // player ship
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'levelup') drawPlayer();

  // floating damage numbers
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of G.floaters) {
    const a = clamp(f.life / f.max, 0, 1);
    ctx.font = `800 ${f.size}px Segoe UI, sans-serif`;
    ctx.fillStyle = rgba('#000', a * 0.5); ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = rgba(f.color, a); ctx.fillText(f.text, f.x, f.y);
  }

  // ---- HUD ----
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'levelup') drawHUD();
  if (IS_TOUCH && G.state === 'playing') drawTouch();
  drawOverlayFX();
}

function drawPlayer() {
  const blink = player.invuln > 0 && Math.floor(G.time * 20) % 2 === 0;
  if (blink) return;
  const spd = Math.hypot(player.vx, player.vy);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aim);
  // animated thruster flame (Section J): grows with speed, white-hot in a dash
  const flame = clamp(spd / (BASE_SPEED * 2), 0, 1);
  if (flame > 0.05) {
    const fl = 8 + 18 * flame + Math.sin(G.time * 40) * 3;
    ctx.fillStyle = rgba(player.dashTime > 0 ? WH : OR, 0.85);
    ctx.beginPath(); ctx.moveTo(-8, 4.5); ctx.lineTo(-8 - fl, 0); ctx.lineTo(-8, -4.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(YE, 0.9);
    ctx.beginPath(); ctx.moveTo(-8, 2.5); ctx.lineTo(-8 - fl * 0.55, 0); ctx.lineTo(-8, -2.5); ctx.closePath(); ctx.fill();
  }
  ctx.shadowColor = CY; ctx.shadowBlur = 18;
  ctx.fillStyle = rgba(CY, 0.9); ctx.strokeStyle = WH; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(-11, 10); ctx.lineTo(-6, 0); ctx.lineTo(-11, -10);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  // idle shimmer (Section J): a soft rotating tri-halo while hovering
  if (spd < 30) {
    const sh = 0.5 + 0.5 * Math.sin(G.time * 2.4);
    ctx.strokeStyle = rgba(CY, 0.2 + 0.25 * sh); ctx.lineWidth = 1.5;
    poly(player.x, player.y, player.r + 5 + sh * 2, 3, player.aim + G.time * 0.8); ctx.stroke();
  }
  // dash cooldown ring
  if (player.dashCD > 0) {
    ctx.strokeStyle = rgba(CY, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 8, -Math.PI / 2, -Math.PI / 2 + (1 - player.dashCD / DASH_CD) * TAU); ctx.stroke();
  } else {
    ctx.strokeStyle = rgba(YE, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 8, 0, TAU); ctx.stroke();
  }
}

function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; }

function drawHUD() {
  const pad = 12;
  // XP bar (top, full width)
  const xpFrac = clamp(player.xp / player.xpNext, 0, 1);
  ctx.fillStyle = rgba('#000', 0.4); ctx.fillRect(0, 0, W, 7);
  const xpg = ctx.createLinearGradient(0, 0, W, 0); xpg.addColorStop(0, CY); xpg.addColorStop(1, MA);
  ctx.fillStyle = xpg; ctx.fillRect(0, 0, W * xpFrac, 7);

  // level badge
  ctx.font = '800 15px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = YE; ctx.fillText('LV ' + player.level, pad, 14);

  // timer (center)
  ctx.textAlign = 'center'; ctx.font = '800 26px Segoe UI, sans-serif';
  ctx.fillStyle = rgba('#000', 0.5); ctx.fillText(fmtTime(G.time), W / 2 + 1, 15);
  ctx.fillStyle = WH; ctx.fillText(fmtTime(G.time), W / 2, 14);

  // kills + score (just under timer, centered)
  ctx.font = '700 13px Segoe UI, sans-serif'; ctx.fillStyle = rgba(CY, 0.95);
  ctx.fillText('☠ ' + G.kills + '   ◆ ' + G.score.toLocaleString(), W / 2, 46);

  // combo
  if (G.combo >= 3) {
    const a = clamp(G.comboTimer / 2.6, 0, 1);
    ctx.font = '900 22px Segoe UI, sans-serif';
    ctx.fillStyle = rgba(YE, 0.5 + 0.5 * a);
    ctx.fillText(G.combo + '× COMBO', W / 2, 66);
  }

  // health bar (bottom-left)
  const hw = Math.min(280, W - 24), hh = 16, hx = pad, hy = H - hh - pad - (IS_TOUCH ? 10 : 0);
  ctx.fillStyle = rgba('#000', 0.5); ctx.fillRect(hx, hy, hw, hh);
  const hf = clamp(player.hp / player.maxHp, 0, 1);
  const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
  hg.addColorStop(0, hf < 0.3 ? RD : GR); hg.addColorStop(1, hf < 0.3 ? OR : CY);
  ctx.fillStyle = hg; ctx.fillRect(hx, hy, hw * hf, hh);
  ctx.strokeStyle = rgba(WH, 0.3); ctx.lineWidth = 1; ctx.strokeRect(hx, hy, hw, hh);
  ctx.fillStyle = WH; ctx.font = '700 11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.ceil(player.hp) + ' / ' + player.maxHp, hx + 8, hy + hh / 2 + 1);

  // weapon loadout: colored disc + level pips (font-free, crisp everywhere)
  let wx = pad;
  const wy = hy - 21;
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    ctx.beginPath(); ctx.arc(wx + 7, wy, 7, 0, TAU);
    ctx.fillStyle = rgba(def.color, 0.9); ctx.fill();
    ctx.strokeStyle = rgba(WH, 0.6); ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < def.max; i++) {
      ctx.fillStyle = i < w.level ? def.color : rgba(WH, 0.15);
      ctx.fillRect(wx + 19 + i * 5, wy - 3, 3, 6);
    }
    wx += 19 + def.max * 5 + 12;
    if (wx > W - 80) break;
  }

  // active boss buffs: small icon + shrinking time bar
  {
    const buffs = [];
    if (player.buffT.triple > 0) buffs.push(['T', CY, player.buffT.triple / BUFF_TRIPLE_T]);
    if (player.buffT.nectar > 0) buffs.push(['N', GR, player.buffT.nectar / BUFF_NECTAR_T]);
    if (player.buffT.aura > 0) buffs.push(['A', PU, player.buffT.aura / BUFF_AURA_T]);
    let bxp = pad; const byp = wy - 22;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const bf of buffs) {
      ctx.fillStyle = rgba(bf[1], 0.9); ctx.beginPath(); ctx.arc(bxp + 7, byp, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#05030f', 0.95); ctx.font = '800 9px Segoe UI, sans-serif'; ctx.fillText(bf[0], bxp + 7, byp + 0.5);
      ctx.fillStyle = rgba('#000', 0.5); ctx.fillRect(bxp, byp + 9, 28, 3);
      ctx.fillStyle = bf[1]; ctx.fillRect(bxp, byp + 9, 28 * clamp(bf[2], 0, 1), 3);
      bxp += 36;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // boss incoming banner (high-contrast warning, slides in + pulses)
  if (G.bossBanner) {
    const bb = G.bossBanner, a = clamp(bb.life / bb.max, 0, 1);
    const slide = Math.min(1, (bb.max - bb.life) * 5);
    ctx.fillStyle = rgba('#000', 0.5 * a * slide);
    ctx.fillRect(0, H * 0.30 - 34, W, 68);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 34px Segoe UI, sans-serif';
    ctx.fillStyle = rgba(RD, (0.7 + 0.3 * Math.sin(G.time * 12)) * a * slide);
    ctx.fillText('⚠ ' + bb.name + ' ⚠', W / 2, H * 0.30 - 8);
    if (bb.sub) {   // only duel banners carry the subtitle (not SIGIL/ritual events)
      ctx.font = '700 13px Segoe UI, sans-serif';
      ctx.fillStyle = rgba(WH, 0.85 * a * slide);
      ctx.fillText(bb.sub, W / 2, H * 0.30 + 22);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // boss bar + phase pips
  if (G.boss) {
    const b = G.boss, bw = Math.min(560, W - 40), bx = (W - bw) / 2, by = 78, bh = 14;
    ctx.fillStyle = rgba('#000', 0.5); ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = b.color || MA; ctx.fillRect(bx, by, bw * clamp(b.hp / b.maxHp, 0, 1), bh);
    ctx.strokeStyle = rgba(WH, 0.5); ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = WH; ctx.font = '800 12px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('☣ ' + (b.name || 'BOSS'), W / 2, by - 9);
    const nph = b.bdef ? b.bdef.phaseThresholds.length : 0;
    for (let i = 0; i < nph; i++) { const px = bx + bw - 8 - i * 16, py = by + bh + 8; ctx.fillStyle = (i < b.phase) ? (b.color || MA) : rgba(WH, 0.2); ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill(); }
  }

  // directional damage indicator (Section L): a red arc toward the hit source
  if (G.dmgDir) {
    const k = clamp(G.dmgDir.t / DMG_IND_T, 0, 1);
    const rr = Math.min(W, H) * 0.32;
    ctx.strokeStyle = rgba(RD, 0.7 * k); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, G.dmgDir.a - 0.35, G.dmgDir.a + 0.35); ctx.stroke();
  }

  // first-run hint (Section L): one line, fades after the opening seconds
  if (!META.firstRunDone && G.time < FIRST_RUN_HINT_T) {
    const a2 = clamp(Math.min(G.time, FIRST_RUN_HINT_T - G.time), 0, 1);
    ctx.font = '700 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(WH, 0.75 * a2);
    ctx.fillText(IS_TOUCH
      ? 'Drag to move · double-tap or » to dash · dodge the bright telegraphs'
      : 'WASD to move · Space to dash · dodge the bright telegraphs', W / 2, H - 86);
  }

  // low HP vignette
  if (player.hp / player.maxHp < 0.3) {
    const pulse = 0.25 + 0.15 * Math.sin(G.time * 6);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(255,40,60,0)'); v.addColorStop(1, `rgba(255,30,50,${pulse})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  // SIGIL inventory slot (Section D) — appears once the first glyph drops
  {
    const glyphN = G.glyphCount;
    if (glyphN > 0 && G.sigil < 2) {
      const sx = W - 56, sy = H - (IS_TOUCH ? 148 : 72);
      if (G.sigilUI) { G.sigilUI.x = sx; G.sigilUI.y = sy; }
      else G.sigilUI = { x: sx, y: sy, r: 26 };
      const forged = G.sigil === 1;
      const pulse = forged ? 0.75 + 0.25 * Math.sin(G.time * 5) : 0.45;
      ctx.fillStyle = rgba(PU, forged ? 0.30 : 0.10);
      ctx.strokeStyle = rgba(forged ? PU : WH, pulse); ctx.lineWidth = 2;
      poly(sx, sy, 24, 6, forged ? G.time * 1.2 : 0.2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = forged ? WH : rgba(WH, 0.6); ctx.lineWidth = 2;
      star(sx, sy, 9, 4, G.time * 0.4, 0.5); ctx.stroke();
      for (let i = 0; i < BOSS_IDS.length; i++) {       // glyph progress pips
        const a = -Math.PI / 2 + i / BOSS_IDS.length * TAU;
        ctx.fillStyle = i < glyphN ? YE : rgba(WH, 0.18);
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 31, sy + Math.sin(a) * 31, 3, 0, TAU); ctx.fill();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(WH, forged ? 0.8 : 0.5);
      ctx.font = '700 10px Segoe UI, sans-serif';
      ctx.fillText(forged ? (IS_TOUCH ? 'SUMMON' : 'G — SUMMON') : glyphN + '/' + BOSS_IDS.length, sx, sy + 42);
      ctx.textBaseline = 'alphabetic';
    } else G.sigilUI = null;
  }

  // GLITCH boss screen overlay (cheap channel-split scanlines)
  if (G.glitchFX > 0) {
    const a = G.glitchFX;
    for (let i = 0; i < 6; i++) { const yy = Math.random() * H; ctx.fillStyle = rgba(pick([CY, MA, YE]), 0.12 * a); ctx.fillRect(0, yy, W, rand(2, 14)); }
    ctx.fillStyle = rgba(MA, 0.05 * a); ctx.fillRect(0, 0, W, H);
  }
}

function drawTouch() {
  // dynamic virtual joystick (Section G): anchored where the thumb landed
  const t = joyId !== null ? touches.get(joyId) : null;
  if (t) {
    ctx.globalCompositeOperation = 'lighter';
    glow(t.sx, t.sy, 60, CY, 0.15);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(WH, 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.sx, t.sy, JOY_MAX, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(WH, 0.12);
    ctx.beginPath(); ctx.arc(t.sx, t.sy, JOY_DEAD, 0, TAU); ctx.stroke();
    let jx = t.x - t.sx, jy = t.y - t.sy;
    const l = Math.hypot(jx, jy); if (l > JOY_MAX) { jx = jx / l * JOY_MAX; jy = jy / l * JOY_MAX; }
    ctx.fillStyle = rgba(CY, 0.7);
    ctx.beginPath(); ctx.arc(t.sx + jx, t.sy + jy, 26, 0, TAU); ctx.fill();
  }
  // dash button
  const bx = W - 56, by = H - 56;
  ctx.fillStyle = player.dashCD > 0 ? rgba('#fff', 0.06) : rgba(CY, 0.18);
  ctx.strokeStyle = player.dashCD > 0 ? rgba('#fff', 0.2) : CY; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, by, 34, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = WH; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('»', bx, by);
}

function drawOverlayFX() {
  if (G.flash > 0) {
    ctx.fillStyle = rgba(G.flashColor, G.flash * 0.5);
    ctx.fillRect(0, 0, W, H);
  }
  // subtle vignette always
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

/* ===========================================================================
   14. STATE MACHINE + UI WIRING
   ========================================================================= */
const overlays = {
  title: document.getElementById('title'),
  levelup: document.getElementById('levelup'),
  pause: document.getElementById('pause'),
  gameover: document.getElementById('gameover'),
};
function hideOverlays() { for (const k in overlays) overlays[k].classList.remove('show'); }
function showOverlay(id) { hideOverlays(); overlays[id].classList.add('show'); }

// Q1: dying while mashing dash must never skip the death report — keyboard
// restart is ENTER-only, and taps/clicks are ignored briefly after death so a
// mobile double-tap dash can't tap-through into "Run it back".
const GAMEOVER_GRACE_MS = 700;
let goShownAt = 0;

function startGame() {
  unlockAudio();
  // reset
  Object.assign(G, {
    state: 'playing', time: 0, shake: 0, hitstop: 0, flash: 0,
    enemies: [], eProj: [], pProj: [], gems: [], pickups: [],
    particles: [], floaters: [], beams: [], arcs: [], telegraphs: [],
    kills: 0, score: 0, combo: 0, comboTimer: 0,
    pendingLevels: 0, rerolls: 1, spawnTimer: 0, nextBossAt: FIRST_BOSS_AT, bossNum: 0, bossBag: [], bossBanner: null, bossTier: 0,
    dirIntensity: 1, dirStress: 0, dirKps: 0, dirDps: 0, spawnRamp: 1,
    glyphs: {}, glyphCount: 0, sigil: 0, ritual: null, sigilUI: null, lvUnlockAt: null,
    dashZoom: 0, trail: [], focusTarget: null, dmgDir: null,
    inputHiccup: 0, glitchFX: 0, boss: null, frost: null, playerSlow: 1,
  });
  enemyId = 1;
  touches.clear(); joyId = null;          // never carry touch state across runs
  player.x = player.y = 0; player.vx = player.vy = 0;
  player.buffT = { triple: 0, nectar: 0, aura: 0, auraTick: 0 };
  player.level = 1; player.xp = 0; player.xpNext = 6;
  player.invuln = 0; player.dashCD = 0; player.dashTime = 0;
  player.weapons = []; player.passives = {};
  player.stats = freshStats();
  recalc(); player.hp = player.maxHp;
  addWeapon('pulse');
  // permanent meta unlock: slaying THE ARCHITECT grants a head start every run
  if (META.architectSlain) { G.rerolls += 1; player.stats.damageMul *= META_ARCH_DMG; }
  G.cam.x = 0; G.cam.y = 0;
  hideOverlays();
  if (Sound) { Sound.startMusic(); Sound.setIntensity(0); Sound.setMusicTempo(112); }
}

function gameOver() {
  G.state = 'gameover';
  goShownAt = performance.now();
  sfx('gameover');
  if (Sound) Sound.stopMusic();
  const cur = { score: G.score, time: Math.floor(G.time), kills: G.kills, level: player.level };
  const prevBest = G.best.score || 0;
  const isBest = cur.score > prevBest;
  if (isBest) { G.best = cur; saveBest(cur); }
  document.getElementById('newBest').classList.toggle('show', isBest);
  // "how close was this run" (Section L): score as a % of the previous best
  const vsBest = isBest ? 'NEW BEST' : (prevBest ? Math.round(cur.score / prevBest * 100) + '% of best' : '—');
  document.getElementById('overStats').innerHTML = statGrid([
    ['Survived', fmtTime(cur.time)], ['Level', cur.level],
    ['Kills', cur.kills], ['Score', cur.score.toLocaleString()],
    ['Best Score', (G.best.score || 0).toLocaleString()], ['This Run', vsBest],
  ]);
  showOverlay('gameover');
}
function statGrid(rows) {
  return rows.map(r => `<div class="stat"><div class="k">${r[0]}</div><div class="v">${r[1]}</div></div>`).join('');
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    document.getElementById('pauseStats').innerHTML = statGrid([
      ['Time', fmtTime(G.time)], ['Level', player.level],
      ['Kills', G.kills], ['Score', G.score.toLocaleString()],
    ]);
    showOverlay('pause');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    hideOverlays();
  }
}
function toTitle() {
  G.state = 'title';
  if (Sound) Sound.stopMusic();
  G.enemies.length = 0; G.particles.length = 0;
  showTitle();
}

function showTitle() {
  const b = G.best;
  document.getElementById('titleHi').textContent =
    (b.score ? `Best: ${b.score.toLocaleString()} pts · ${fmtTime(b.time)} survived` : 'No record yet — set one.') +
    (META.architectSlain ? '  ·  ◆ ARCHITECT SLAIN' : '');
  showOverlay('title');
}

/* ---- audio controls ---- */
let muted = false;
const SVG_SND_ON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a4 4 0 0 1 0 7"/><path d="M18.5 6a8 8 0 0 1 0 12"/></svg>';
const SVG_SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';
function unlockAudio() { if (Sound) Sound.unlock(); }
function toggleMute() {
  if (!Sound) return;
  muted = Sound.toggleMute();
  document.getElementById('btnMute').innerHTML = muted ? SVG_SND_OFF : SVG_SND_ON;
}
function sfx(name) { if (Sound && Sound.sfx[name]) Sound.sfx[name](); }

function toggleFull() {
  const el = document.documentElement;
  if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
  else (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
}

// (the dash button is handled inside onPointerDown as an independent touch —
// the old capture-phase listener is gone with the v2 multi-touch rewrite)

// buttons
document.getElementById('btnPlay').addEventListener('click', startGame);
document.getElementById('btnAgain').addEventListener('click', () => {
  if (performance.now() - goShownAt >= GAMEOVER_GRACE_MS) startGame();
});
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnQuit').addEventListener('click', toTitle);
document.getElementById('btnPause').addEventListener('click', () => { if (G.state === 'playing' || G.state === 'paused') togglePause(); });
document.getElementById('btnMute').addEventListener('click', () => { unlockAudio(); toggleMute(); });
document.getElementById('btnFull').addEventListener('click', toggleFull);

/* ===========================================================================
   15. MAIN LOOP
   ========================================================================= */
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt < 0.5) perfSample(dt);      // rolling FPS sample (ignore tab-switch gaps)
  if (dt > 0.05) dt = 0.05;          // clamp big gaps (tab switches)
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// boot
boot.style.display = 'none';
const verEl = document.getElementById('verTag');
if (verEl) verEl.textContent = 'v' + VERSION;
showTitle();
requestAnimationFrame(frame);

// expose a tiny debug hook
window.NEON = { G, player };

})();
