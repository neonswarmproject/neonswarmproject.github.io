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

/* ===========================================================================
   1. BOOT / CANVAS / PALETTE / MATH
   ========================================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const boot = document.getElementById('boot');

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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

/* ===========================================================================
   4. GAME STATE
   ========================================================================= */
const MAX_ENEMIES = 380;
const MAX_PARTICLES = 1400;

const G = {
  state: 'title',                 // title | playing | levelup | paused | gameover
  time: 0,                        // seconds survived
  cam: { x: 0, y: 0 },
  shake: 0,                       // trauma 0..1
  hitstop: 0,                     // seconds of frozen time
  flash: 0,                       // white/red screen flash 0..1
  flashColor: WH,
  enemies: [], eProj: [], pProj: [], gems: [], pickups: [],
  particles: [], floaters: [], beams: [], arcs: [],
  kills: 0, score: 0,
  combo: 0, comboTimer: 0,
  pendingLevels: 0,
  rerolls: 1,
  spawnTimer: 0,
  nextBossAt: 75,
  bossNum: 0,
  boss: null,
  frost: null,                    // {radius, slow, dmg} computed each frame
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

/* ===========================================================================
   5. INPUT
   ========================================================================= */
const keys = new Set();
const pointer = { down: false, type: 'mouse', sx: 0, sy: 0, x: 0, y: 0 };
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const JOY_MAX = 70;
let lastTapTime = 0;

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
      if (k === 'Enter' || k === ' ') startGame();
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
  pointer.down = true;
  pointer.type = e.pointerType || 'mouse';
  const r = canvas.getBoundingClientRect();
  pointer.sx = pointer.x = e.clientX - r.left;
  pointer.sy = pointer.y = e.clientY - r.top;

  if (G.state === 'playing' && pointer.type === 'touch') {
    const now = performance.now();
    if (now - lastTapTime < 280) tryDash();
    lastTapTime = now;
  }
  if (G.state === 'title') startGame();
}
function onPointerMove(e) {
  if (!pointer.down) return;
  const r = canvas.getBoundingClientRect();
  pointer.x = e.clientX - r.left;
  pointer.y = e.clientY - r.top;
}
function onPointerUp() { pointer.down = false; }
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

  if (pointer.down) {
    if (pointer.type === 'touch') {
      let jx = pointer.x - pointer.sx, jy = pointer.y - pointer.sy;
      const l = Math.hypot(jx, jy);
      if (l < 8) return { x: 0, y: 0, mag: 0, src: 'touch' };
      const mag = Math.min(l / JOY_MAX, 1);
      return { x: jx / l, y: jy / l, mag, src: 'touch' };
    } else {
      const jx = pointer.x - W / 2, jy = pointer.y - H / 2;
      const l = Math.hypot(jx, jy);
      if (l < 14) return { x: 0, y: 0, mag: 0, src: 'mouse' };
      return { x: jx / l, y: jy / l, mag: 1, src: 'mouse' };
    }
  }
  return { x: 0, y: 0, mag: 0, src: 'none' };
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
  player.dashTime = 0.16;
  player.dashCD = 1.5;
  player.invuln = Math.max(player.invuln, 0.28);
  sfx('dash');
  for (let i = 0; i < 14; i++)
    spawnParticle(player.x, player.y, -d.x * rand(40, 160) + rand(-40, 40), -d.y * rand(40, 160) + rand(-40, 40), rand(0.2, 0.4), rand(2, 4), CY, 'spark');
}

function hurtPlayer(dmg) {
  if (player.invuln > 0 || player.dashTime > 0 || G.state !== 'playing') return;
  const real = Math.max(1, dmg - player.stats.armor);
  player.hp -= real;
  player.invuln = 0.75;
  G.shake = Math.min(1, G.shake + 0.5);
  G.flash = 0.6; G.flashColor = RD;
  G.hitstop = Math.max(G.hitstop, 0.06);
  sfx('hurt');
  G.combo = 0;
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
  for (let i = 0; i < Math.min(n, list.length); i++) out.push(list[i][1]);
  return out;
}

function firePlayerProjectile(o) {
  G.pProj.push(Object.assign({
    x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 10, pierce: 0, life: 1.2,
    color: CY, hit: null, homing: 0, target: null, kind: 'bolt', trail: 0
  }, o));
}

const WEAPONS = {
  /* ---- Pulse Cannon : auto-targeting bolts ---- */
  pulse: {
    name: 'Pulse Cannon', icon: '✦', color: CY, max: 8,
    info(l) {
      const m = ['Auto-fires a bolt at the nearest foe.',
        '+1 bolt per volley.', '+45% damage.', 'Faster fire rate.',
        '+1 bolt &amp; pierces 1 enemy.', '+45% damage.', '+1 bolt.', 'Pierces +2, big damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      self.t -= dt;
      const lv = self.level;
      const cd = 0.6 / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const count = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 1 : 0);
      let dmg = 11 * (1 + (lv >= 3 ? 0.45 : 0) + (lv >= 6 ? 0.45 : 0) + (lv >= 8 ? 0.6 : 0)) * S().damageMul;
      const pierce = (lv >= 5 ? 1 : 0) + (lv >= 8 ? 2 : 0);
      const targets = nearestEnemies(player.x, player.y, count);
      if (!targets.length) return;
      const spd = 560 * S().projSpeedMul;
      for (let i = 0; i < count; i++) {
        const t = targets[i % targets.length];
        let a = t ? angTo(player.x, player.y, t.x, t.y) : player.aim;
        a += (i - (count - 1) / 2) * 0.12;
        firePlayerProjectile({
          x: player.x, y: player.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: 6, dmg, pierce, life: 1.4 * S().projDurMul, color: CY, hit: new Set(), trail: 1
        });
      }
      sfx('shoot');
    }
  },

  /* ---- Halo Blades : orbiting blades ---- */
  orbit: {
    name: 'Halo Blades', icon: '🌀', color: PU, max: 7,
    info(l) {
      const m = ['Blades orbit you, shredding contact.',
        '+1 blade.', '+40% damage.', '+1 blade &amp; wider orbit.',
        'Faster spin, +damage.', '+1 blade.', 'Huge orbit &amp; damage.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      if (!self.data) self.data = { ang: 0, hits: new Map() };
      const count = 2 + (lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0) + (lv >= 6 ? 1 : 0);
      const radius = (78 + (lv >= 4 ? 26 : 0) + (lv >= 7 ? 40 : 0)) * Math.sqrt(S().areaMul);
      const spin = (2.0 + (lv >= 5 ? 1.1 : 0)) * S().attackSpeedMul;
      const dmg = 9 * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 5 ? 0.4 : 0) + (lv >= 7 ? 0.7 : 0)) * S().damageMul * dt * 6;
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
    name: 'Shock Pulse', icon: '💥', color: YE, max: 7,
    info(l) {
      const m = ['Emits a damaging shockwave around you.',
        'Bigger radius.', '+45% damage.', 'Faster pulses.',
        'Bigger radius &amp; knockback.', '+45% damage.', 'Massive blast.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (2.4 - (lv >= 4 ? 0.6 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const radius = (120 + (lv >= 2 ? 40 : 0) + (lv >= 5 ? 60 : 0) + (lv >= 7 ? 90 : 0)) * S().areaMul;
      const dmg = 16 * (1 + (lv >= 3 ? 0.45 : 0) + (lv >= 6 ? 0.45 : 0) + (lv >= 7 ? 0.6 : 0)) * S().damageMul;
      grid.query(player.x, player.y, radius, _q);
      for (let i = 0; i < _q.length; i++) {
        const e = _q[i]; if (e.dead) continue;
        if (dist2(player.x, player.y, e.x, e.y) < (radius + e.r) ** 2)
          damageEnemy(e, dmg, { kbx: e.x - player.x, kby: e.y - player.y, kb: 140 + (lv >= 5 ? 120 : 0), color: YE });
      }
      G.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 10, mr: radius, life: 0.45, max: 0.45, color: YE, kind: 'ring' });
      G.shake = Math.min(1, G.shake + 0.18);
      sfx('nova');
    }
  },

  /* ---- Arc Lightning : chaining bolts ---- */
  chain: {
    name: 'Arc Lightning', icon: '⚡', color: BL, max: 7,
    info(l) {
      const m = ['Lightning leaps between nearby foes.',
        '+1 chain jump.', '+40% damage.', 'Faster strikes.',
        '+2 chain jumps.', '+40% damage.', 'Storm: +damage &amp; jumps.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.4 - (lv >= 4 ? 0.45 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      const first = nearestEnemy(player.x, player.y, 460);
      if (!first) { self.t = 0.2; return; }
      self.t = cd;
      const jumps = 3 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 2 : 0) + (lv >= 7 ? 2 : 0);
      let dmg = 13 * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 6 ? 0.4 : 0) + (lv >= 7 ? 0.6 : 0)) * S().damageMul;
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
        let next = null, bd = 220 ** 2;
        grid.query(cur.x, cur.y, 240, _q);
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
    name: 'Seeker Swarm', icon: '🚀', color: OR, max: 7,
    info(l) {
      const m = ['Launches homing missiles that explode.',
        '+1 missile.', '+40% damage.', 'Faster launches.',
        '+1 missile &amp; bigger blast.', '+40% damage.', '+2 missiles.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.5 - (lv >= 4 ? 0.4 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      self.t = cd;
      const count = 1 + (lv >= 2 ? 1 : 0) + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 2 : 0);
      const dmg = 18 * (1 + (lv >= 3 ? 0.4 : 0) + (lv >= 6 ? 0.4 : 0)) * S().damageMul;
      const blast = (52 + (lv >= 5 ? 26 : 0)) * S().areaMul;
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        firePlayerProjectile({
          x: player.x, y: player.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
          r: 5, dmg, pierce: 0, life: 2.4 * S().projDurMul, color: OR,
          kind: 'missile', homing: 6.5, blast, hit: new Set(), trail: 1
        });
      }
      sfx('laser');
    }
  },

  /* ---- Lance : piercing beam ---- */
  beam: {
    name: 'Photon Lance', icon: '🔆', color: PK, max: 7,
    info(l) {
      const m = ['Fires a piercing beam of light.',
        'Wider beam.', '+45% damage.', 'Faster firing.',
        '+1 beam &amp; longer.', '+45% damage.', 'Twin overcharged lances.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      self.t = (self.t || 0) - dt;
      const cd = (1.05 - (lv >= 4 ? 0.3 : 0)) / S().attackSpeedMul;
      if (self.t > 0) return;
      const beams = 1 + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 1 : 0);
      const target = nearestEnemy(player.x, player.y, 1200);
      if (!target) { self.t = 0.2; return; }
      self.t = cd;
      const len = (520 + (lv >= 5 ? 180 : 0)) * S().areaMul;
      const wid = (16 + (lv >= 2 ? 8 : 0)) * Math.sqrt(S().areaMul);
      const dmg = 26 * (1 + (lv >= 3 ? 0.45 : 0) + (lv >= 6 ? 0.45 : 0) + (lv >= 7 ? 0.6 : 0)) * S().damageMul;
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
    name: 'Cryo Field', icon: '❄', color: '#7fe9ff', max: 6,
    info(l) {
      const m = ['Aura slows &amp; chills nearby foes.',
        'Wider field.', 'Stronger slow &amp; damage.',
        'Wider field.', 'Deep freeze damage.', 'Glacial: huge slow field.'];
      return m[Math.min(l, m.length - 1)];
    },
    update(self, dt) {
      const lv = self.level;
      const radius = (110 + (lv >= 2 ? 35 : 0) + (lv >= 4 ? 45 : 0) + (lv >= 6 ? 70 : 0)) * S().areaMul;
      const slow = 0.42 + (lv >= 3 ? 0.12 : 0) + (lv >= 6 ? 0.12 : 0);
      const dps = (5 + (lv >= 3 ? 4 : 0) + (lv >= 5 ? 6 : 0)) * S().damageMul;
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
};
function segDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
const WEAPON_IDS = Object.keys(WEAPONS);
const MAX_WEAPONS = 6;

function addWeapon(id) { player.weapons.push({ id, level: 1, t: 0, data: null }); }
function hasWeapon(id) { return player.weapons.some(w => w.id === id); }

/* ===========================================================================
   8. PASSIVES
   ========================================================================= */
const PASSIVES = {
  vigor:    { name: 'Vigor',     icon: '❤', color: RD, max: 6, desc: '+25 Max HP (and heal).',    apply() { S().maxHpBonus += 25; player.maxHp = 100 + S().maxHpBonus; player.hp += 25; } },
  swift:    { name: 'Swift',     icon: '🪽', color: CY, max: 6, desc: '+9% Move speed.',           apply() { S().moveSpeedMul *= 1.09; } },
  power:    { name: 'Overcharge',icon: '🔺', color: MA, max: 8, desc: '+13% Damage.',              apply() { S().damageMul *= 1.13; } },
  haste:    { name: 'Haste',     icon: '⏱', color: YE, max: 7, desc: '+11% Attack speed.',        apply() { S().attackSpeedMul *= 1.11; } },
  expanse:  { name: 'Expanse',   icon: '🔮', color: PU, max: 6, desc: '+13% Area of effect.',      apply() { S().areaMul *= 1.13; } },
  velocity: { name: 'Velocity',  icon: '➹', color: GR, max: 5, desc: '+16% Projectile speed.',    apply() { S().projSpeedMul *= 1.16; S().projDurMul *= 1.08; } },
  magnet:   { name: 'Magnet',    icon: '🧲', color: BL, max: 5, desc: '+38% Pickup range.',        apply() { S().pickup *= 1.38; } },
  greed:    { name: 'Greed',     icon: '💎', color: GR, max: 6, desc: '+16% XP gain.',             apply() { S().xpGain *= 1.16; } },
  regen:    { name: 'Regen',     icon: '✚', color: GR, max: 6, desc: '+0.7 HP / sec.',            apply() { S().regen += 0.7; } },
  armor:    { name: 'Plating',   icon: '🛡', color: BL, max: 6, desc: '+2 Armor (flat soak).',     apply() { S().armor += 2; } },
  focus:    { name: 'Focus',     icon: '🎯', color: OR, max: 6, desc: '+8% Crit, +0.3 crit mult.', apply() { S().crit += 0.08; S().critMult += 0.3; } },
  luck:     { name: 'Fortune',   icon: '🍀', color: YE, max: 5, desc: 'Better drops &amp; rerolls.',  apply() { S().luck += 1; G.rerolls += 1; } },
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
      pool.push({ kind: 'weapon-new', id, weight: 9 + S().luck });
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
  // fallbacks if everything is maxed
  while (chosen.length < 3) chosen.push({ kind: 'bonus', id: 'bonus' });
  return chosen;
}

function cardData(c) {
  if (c.kind === 'weapon-new') { const d = WEAPONS[c.id]; return { icon: d.icon, name: d.name, color: d.color, type: 'New Weapon', desc: d.info(1), level: 0, max: d.max, isNew: true }; }
  if (c.kind === 'weapon-up')  { const d = WEAPONS[c.id]; const w = player.weapons.find(w => w.id === c.id); return { icon: d.icon, name: d.name, color: d.color, type: 'Weapon · Lv ' + (w.level + 1), desc: d.info(w.level + 1), level: w.level, max: d.max }; }
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
};

function diffScale() {
  const m = G.time / 60;
  return {
    hp: 1 + m * 0.6 + m * m * 0.045,
    speed: Math.min(1.7, 1 + m * 0.045),
    dmg: 1 + m * 0.22,
  };
}

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
    rot: rand(0, TAU), elite: false, boss: false, spawn: 0.0,
  };
  if (opts) Object.assign(e, opts);
  if (e.elite) { e.r *= 1.5; e.hp *= 4; e.maxHp = e.hp; e.xp *= 6; e.dmg *= 1.3; }
  G.enemies.push(e);
  return e;
}

function spawnRingPosition() {
  const a = rand(0, TAU);
  const d = Math.hypot(W, H) / 2 + rand(60, 200);
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
  ];
  let total = 0; for (const e of w) total += e[1];
  let r = rand(0, total);
  for (const e of w) { r -= e[1]; if (r <= 0) return e[0]; }
  return 'grunt';
}

function director(dt) {
  const m = G.time / 60;
  // spawn cadence
  G.spawnTimer -= dt;
  const interval = clamp(1.05 - m * 0.08, 0.16, 1.05);
  if (G.spawnTimer <= 0) {
    G.spawnTimer = interval;
    const batch = 1 + Math.floor(m * 0.8) + (Math.random() < 0.2 ? 2 : 0);
    for (let i = 0; i < batch; i++) {
      const p = spawnRingPosition();
      const t = pickEnemyType(m);
      const elite = m > 1.5 && Math.random() < 0.02 + S().luck * 0.005;
      spawnEnemy(t, p.x, p.y, elite ? { elite: true } : null);
    }
    // occasional pack burst
    if (m > 1 && Math.random() < 0.12) {
      const p = spawnRingPosition();
      const t = pickEnemyType(m);
      for (let i = 0; i < 6 + (m | 0); i++)
        spawnEnemy(t, p.x + rand(-60, 60), p.y + rand(-60, 60), null);
    }
  }
  // boss
  if (!G.boss && G.time >= G.nextBossAt) {
    spawnBoss();
    G.bossNum++;
    G.nextBossAt += 150;
  }
}

function spawnBoss() {
  const p = spawnRingPosition();
  const d = diffScale();
  const n = G.bossNum;
  const hp = (900 + n * 700) * (0.6 + d.hp * 0.6);
  const e = spawnEnemy('tank', p.x, p.y, {
    boss: true, r: 58, hp, maxHp: hp, color: WH, shape: 'boss',
    speed: 42 * d.speed, dmg: 24 * d.dmg, xp: 60 + n * 20,
    fireT: 2, summonT: 5, name: 'OVERLORD ' + romanize(n + 1),
  });
  G.boss = e;
  sfx('boss');
  G.flash = 0.5; G.flashColor = MA;
  G.shake = 1;
  if (Sound) { Sound.setIntensity(1); Sound.setMusicTempo(126); }
}
function romanize(n) { return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || ('#' + n); }

function updateEnemies(dt) {
  const arr = G.enemies;
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i];
    if (e.dead) { arr.splice(i, 1); if (e === G.boss) G.boss = null; continue; }
    e.flash = Math.max(0, e.flash - dt * 6);
    e.rot += dt * (e.type === 'orbiter' ? 4 : 1);

    // frost slow
    e.slow = 1;
    if (G.frost && dist2(player.x, player.y, e.x, e.y) < (G.frost.radius + e.r) ** 2)
      e.slow = 1 - G.frost.slow;

    const ang = angTo(e.x, e.y, player.x, player.y);
    const d = dist(e.x, e.y, player.x, player.y);
    let ax = Math.cos(ang), ay = Math.sin(ang);
    let sp = e.speed * e.slow;

    // behaviours
    if (e.type === 'orbiter') {
      // spiral: tangential + slight inward
      const tx = -ay, ty = ax;
      ax = ax * 0.5 + tx; ay = ay * 0.5 + ty;
      const l = Math.hypot(ax, ay); ax /= l; ay /= l;
    } else if (e.type === 'shooter') {
      const prefer = 300;
      if (d < prefer - 40) { ax = -ax; ay = -ay; }
      else if (d < prefer + 40) { ax = -ay; ay = ax; } // strafe
      e.fireT -= dt;
      if (e.fireT <= 0 && d < 640) {
        e.fireT = 1.8 + rand(0, 0.6);
        const a = angTo(e.x, e.y, player.x, player.y);
        spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 240, Math.sin(a) * 240, e.dmg * 0.7, PU);
      }
    } else if (e.boss) {
      sp = e.speed;
      e.fireT -= dt; e.summonT -= dt;
      if (e.fireT <= 0) {
        e.fireT = 2.6;
        const n = 14 + G.bossNum * 2;
        for (let k = 0; k < n; k++) {
          const a = e.rot + k / n * TAU;
          spawnEnemyProjectile(e.x, e.y, Math.cos(a) * 200, Math.sin(a) * 200, e.dmg * 0.6, MA);
        }
        G.shake = Math.min(1, G.shake + 0.2);
      }
      if (e.summonT <= 0) {
        e.summonT = 6;
        for (let k = 0; k < 4 + G.bossNum; k++) {
          const a = rand(0, TAU);
          spawnEnemy('rusher', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, null);
        }
      }
    }

    e.vx = lerp(e.vx, ax * sp, 0.12);
    e.vy = lerp(e.vy, ay * sp, 0.12);

    // light separation so they don't fully stack
    if (!e.boss) {
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

    // contact with player
    if (d < e.r + player.r) {
      if (e.type === 'bomber') {
        explodeAt(e.x, e.y, 70 * S().areaMul, RD);
        if (dist(e.x, e.y, player.x, player.y) < 70 + player.r) hurtPlayer(e.dmg);
        killEnemy(e, false);
      } else {
        hurtPlayer(e.dmg);
        // knock the enemy back a touch
        e.vx -= ax * 60; e.vy -= ay * 60;
      }
    }
  }
}

function spawnEnemyProjectile(x, y, vx, vy, dmg, color) {
  G.eProj.push({ x, y, vx, vy, r: 7, dmg, color, life: 4 });
}
function updateEnemyProjectiles(dt) {
  const arr = G.eProj;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0 || dist2(p.x, p.y, player.x, player.y) > 1600 * 1600) { arr.splice(i, 1); continue; }
    if (dist2(p.x, p.y, player.x, player.y) < (p.r + player.r) ** 2) {
      hurtPlayer(p.dmg);
      arr.splice(i, 1);
    }
  }
}

/* ===========================================================================
   11. COMBAT RESOLUTION / PARTICLES / PICKUPS / XP
   ========================================================================= */
function spawnParticle(x, y, vx, vy, life, r, color, kind) {
  if (G.particles.length >= MAX_PARTICLES) G.particles.shift();
  G.particles.push({ x, y, vx, vy, life, max: life, r, color, kind: kind || 'spark', drag: 0.92 });
}
function floater(x, y, text, color, size) {
  if (G.floaters.length >= 90) G.floaters.shift();
  G.floaters.push({ x, y, vy: -42, life: 0.8, max: 0.8, text, color, size: size || 14 });
}
function explodeAt(x, y, radius, color) {
  G.particles.push({ x, y, vx: 0, vy: 0, r: 8, mr: radius, life: 0.4, max: 0.4, color, kind: 'ring' });
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU), s = rand(60, 320);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.55), rand(2, 5), color, 'spark');
  }
  sfx('explode');
  G.shake = Math.min(1, G.shake + 0.22);
}

function damageEnemy(e, dmg, opts) {
  if (e.dead) return;
  opts = opts || {};
  let crit = false;
  if (Math.random() < S().crit) { crit = true; dmg *= S().critMult; }
  dmg = Math.round(dmg);
  e.hp -= dmg;
  e.flash = 1;
  if (opts.kb) { const l = Math.hypot(opts.kbx, opts.kby) || 1; e.x += opts.kbx / l * opts.kb * 0.02; e.y += opts.kby / l * opts.kb * 0.02; e.vx += opts.kbx / l * opts.kb; e.vy += opts.kby / l * opts.kb; }
  if (!opts.silent) {
    floater(e.x, e.y - e.r, crit ? dmg + '!' : '' + dmg, crit ? YE : (opts.color || WH), crit ? 20 : 13);
    sfx('hit');
    spawnParticle(e.x, e.y, rand(-60, 60), rand(-60, 60), 0.25, 2.5, opts.color || e.color, 'spark');
  }
  if (e.hp <= 0) killEnemy(e, true);
}

function killEnemy(e, reward) {
  if (e.dead) return;
  e.dead = true;
  explodeAt(e.x, e.y, e.boss ? 200 : (e.elite ? 90 : 40), e.color);
  if (e.boss) { sfx('bigExplode'); G.hitstop = 0.12; G.flash = 0.5; G.flashColor = e.color; if (Sound) { Sound.setIntensity(0.5); Sound.setMusicTempo(116); } }

  if (reward !== false) {
    G.kills++;
    G.combo++; G.comboTimer = 2.6;
    const mult = 1 + Math.min(G.combo, 60) * 0.02;
    G.score += Math.floor((e.xp * 6 + e.r) * mult);

    // gems
    const gemN = e.boss ? 30 : (e.elite ? 6 : 1);
    for (let i = 0; i < gemN; i++)
      spawnGem(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), Math.max(1, Math.round(e.xp / (e.boss ? 1 : 1))));

    // pickups
    if (e.boss) { spawnPickup(e.x, e.y, 'heal'); spawnPickup(e.x + 40, e.y, 'bomb'); spawnPickup(e.x - 40, e.y, 'magnet'); }
    else if (e.elite) spawnPickup(e.x, e.y, pick(['heal', 'magnet', 'bomb']));
    else {
      const roll = Math.random();
      const luck = S().luck * 0.004;
      if (roll < 0.008 + luck) spawnPickup(e.x, e.y, 'heal');
      else if (roll < 0.014 + luck) spawnPickup(e.x, e.y, 'magnet');
      else if (roll < 0.018 + luck) spawnPickup(e.x, e.y, 'bomb');
    }

    // splitter children
    if (e.type === 'splitter') {
      for (let i = 0; i < 3; i++) {
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
function spawnPickup(x, y, type) {
  G.pickups.push({ x, y, type, t: 0, vy: 0 });
}

function updateGems(dt) {
  const arr = G.gems;
  const pr = S().pickup;
  for (let i = arr.length - 1; i >= 0; i--) {
    const g = arr[i];
    g.t += dt;
    g.vx *= 0.9; g.vy *= 0.9;
    const d = dist(g.x, g.y, player.x, player.y);
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
      applyPickup(p.type);
      arr.splice(i, 1);
    }
  }
}
function applyPickup(type) {
  if (type === 'heal') {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
    floater(player.x, player.y - 24, '+HP', GR, 18); sfx('coin');
    for (let i = 0; i < 16; i++) spawnParticle(player.x, player.y, rand(-120, 120), rand(-120, 120), 0.5, 3, GR, 'spark');
  } else if (type === 'magnet') {
    for (const g of G.gems) g.mag = true;
    floater(player.x, player.y - 24, 'MAGNET', BL, 18); sfx('coin');
  } else if (type === 'bomb') {
    sfx('bigExplode'); G.shake = 1; G.flash = 0.6; G.flashColor = OR; G.hitstop = 0.08;
    G.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 12, mr: 900, life: 0.6, max: 0.6, color: OR, kind: 'ring' });
    for (const e of G.enemies.slice()) if (!e.boss) damageEnemy(e, 9999, { color: OR }); else damageEnemy(e, 400, { color: OR });
    G.eProj.length = 0;
    floater(player.x, player.y - 24, 'BOOM', OR, 22);
  }
}

function addXp(v) {
  player.xp += v * S().xpGain;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level++;
    player.xpNext = Math.floor(6 + player.level * 4 + Math.pow(player.level, 1.55));
    G.pendingLevels++;
    sfx('levelup');
    player.hp = Math.min(player.maxHp, player.hp + 8);
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU); spawnParticle(player.x, player.y, Math.cos(a) * rand(60, 260), Math.sin(a) * rand(60, 260), rand(0.4, 0.8), rand(2, 4), YE, 'spark'); }
  }
}

function updateProjectiles(dt) {
  const arr = G.pProj;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) { arr.splice(i, 1); continue; }

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

    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.trail && Math.random() < 0.6) spawnParticle(p.x, p.y, 0, 0, 0.18, p.r * 0.7, p.color, 'spark');

    grid.query(p.x, p.y, p.r + 30, _q);
    for (let j = 0; j < _q.length; j++) {
      const e = _q[j];
      if (e.dead) continue;
      if (p.hit && p.hit.has(e.id)) continue;
      if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) ** 2) {
        if (p.kind === 'missile') {
          explodeAt(p.x, p.y, p.blast, OR);
          grid.query(p.x, p.y, p.blast, _q);
          for (let k = 0; k < _q.length; k++) { const e2 = _q[k]; if (!e2.dead && dist2(p.x, p.y, e2.x, e2.y) < (p.blast + e2.r) ** 2) damageEnemy(e2, p.dmg, { color: OR, kbx: e2.x - p.x, kby: e2.y - p.y, kb: 90 }); }
          p.life = 0; break;
        } else {
          damageEnemy(e, p.dmg, { kbx: p.vx, kby: p.vy, kb: 60, color: p.color });
          if (p.hit) p.hit.add(e.id);
          if (p.pierce > 0) p.pierce--;
          else { p.life = 0; break; }
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
}

/* ===========================================================================
   12. UPDATE
   ========================================================================= */
function update(dt) {
  if (G.state !== 'playing') { updateAmbient(dt); return; }

  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.12; }

  G.time += dt;
  G.frost = null;

  // spawn waves / bosses
  director(dt);

  // rebuild spatial hash
  grid.clear();
  for (let i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead) grid.insert(G.enemies[i]);

  // input → movement
  const mv = moveVector();
  const speed = BASE_SPEED * S().moveSpeedMul;
  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vx = player.dashDir.x * speed * 4.2;
    player.vy = player.dashDir.y * speed * 4.2;
    if (Math.random() < 0.8) spawnParticle(player.x, player.y, rand(-30, 30), rand(-30, 30), 0.25, 3, CY, 'spark');
  } else {
    player.vx = lerp(player.vx, mv.x * speed * mv.mag, 0.2);
    player.vy = lerp(player.vy, mv.y * speed * mv.mag, 0.2);
  }
  player.x += player.vx * dt; player.y += player.vy * dt;
  const lim = ARENA / 2 - player.r;
  player.x = clamp(player.x, -lim, lim); player.y = clamp(player.y, -lim, lim);

  // aim toward movement or nearest enemy
  if (Math.hypot(player.vx, player.vy) > 30) player.aim = Math.atan2(player.vy, player.vx);
  else { const t = nearestEnemy(player.x, player.y); if (t) player.aim = angTo(player.x, player.y, t.x, t.y); }

  // thruster particles
  if (Math.hypot(player.vx, player.vy) > 40 && Math.random() < 0.7) {
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

  // entities
  updateProjectiles(dt);
  updateEnemies(dt);
  updateEnemyProjectiles(dt);
  updateGems(dt);
  updatePickups(dt);
  updateParticles(dt);

  // camera + shake decay
  G.cam.x = lerp(G.cam.x, player.x, 0.12);
  G.cam.y = lerp(G.cam.y, player.y, 0.12);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.4);

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
  ctx.translate(W / 2 - G.cam.x + sx, H / 2 - G.cam.y + sy);
}

function drawGrid() {
  const step = 80;
  const x0 = G.cam.x - W / 2 - step, x1 = G.cam.x + W / 2 + step;
  const y0 = G.cam.y - H / 2 - step, y1 = G.cam.y + H / 2 + step;
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

function drawShapeFor(e) {
  const r = e.r;
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

  /* ---- additive GLOW pass ---- */
  ctx.globalCompositeOperation = 'lighter';

  // gems
  for (const g of G.gems) glow(g.x, g.y, 7, GR, 0.8);
  // pickups
  for (const p of G.pickups) { const c = p.type === 'heal' ? GR : p.type === 'magnet' ? BL : OR; glow(p.x, p.y, 16 + Math.sin(p.t * 6) * 3, c, 0.9); }
  // enemy projectiles
  for (const p of G.eProj) glow(p.x, p.y, p.r * 2.2, p.color, 0.9);
  // enemy glows
  for (const e of G.enemies) glow(e.x, e.y, e.r * (e.boss ? 2.2 : 1.9), e.flash > 0.3 ? WH : e.color, e.boss ? 0.8 : 0.6);
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
    const c = p.type === 'heal' ? GR : p.type === 'magnet' ? BL : OR;
    ctx.fillStyle = rgba(c, 0.18); ctx.strokeStyle = c; ctx.lineWidth = 2;
    poly(p.x, p.y, 13, 6, p.t * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(p.x, p.y); ctx.strokeStyle = WH; ctx.fillStyle = WH; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    if (p.type === 'heal') {            // plus
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
    } else if (p.type === 'magnet') {   // horseshoe magnet
      ctx.beginPath(); ctx.arc(0, -1, 5, Math.PI, 0); ctx.moveTo(-5, -1); ctx.lineTo(-5, 4); ctx.moveTo(5, -1); ctx.lineTo(5, 4); ctx.stroke();
    } else {                            // bomb -> starburst
      star(0, 0, 6, 4, p.t * 3, 0.4); ctx.fill();
    }
    ctx.restore();
  }
  // gems
  for (const g of G.gems) { ctx.fillStyle = GR; poly(g.x, g.y, 4.5, 4, G.time * 3); ctx.fill(); }
  // enemies
  for (const e of G.enemies) {
    ctx.lineWidth = e.boss ? 4 : 2.2;
    ctx.strokeStyle = e.flash > 0.3 ? WH : e.color;
    ctx.fillStyle = e.flash > 0.5 ? rgba(WH, 0.8) : rgba(e.color, e.slow < 1 ? 0.45 : 0.22);
    drawShapeFor(e); ctx.fill(); ctx.stroke();
    if (e.slow < 1) { ctx.strokeStyle = rgba('#bff', 0.6); ctx.lineWidth = 1; drawShapeFor(e); ctx.stroke(); }
    // boss / elite health ring
    if (e.boss) { /* drawn in HUD */ }
    else if (e.elite || (e.maxHp > 60 && e.hp < e.maxHp)) {
      const w = e.r * 2;
      ctx.fillStyle = rgba('#000', 0.5); ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
      ctx.fillStyle = e.color; ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * (e.hp / e.maxHp), 3);
    }
  }
  // enemy projectiles core
  for (const p of G.eProj) { ctx.fillStyle = WH; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.5, 0, TAU); ctx.fill(); }
  // player projectile cores
  for (const p of G.pProj) {
    ctx.fillStyle = WH;
    if (p.kind === 'missile') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillStyle = OR; poly(0, 0, p.r + 2, 3, 0); ctx.fill(); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU); ctx.fill(); }
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
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aim);
  ctx.shadowColor = CY; ctx.shadowBlur = 18;
  ctx.fillStyle = rgba(CY, 0.9); ctx.strokeStyle = WH; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(-11, 10); ctx.lineTo(-6, 0); ctx.lineTo(-11, -10);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  // dash cooldown ring
  if (player.dashCD > 0) {
    ctx.strokeStyle = rgba(CY, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 8, -Math.PI / 2, -Math.PI / 2 + (1 - player.dashCD / 1.5) * TAU); ctx.stroke();
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

  // boss bar
  if (G.boss) {
    const bw = Math.min(560, W - 40), bx = (W - bw) / 2, by = 78, bh = 14;
    ctx.fillStyle = rgba('#000', 0.5); ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = MA; ctx.fillRect(bx, by, bw * clamp(G.boss.hp / G.boss.maxHp, 0, 1), bh);
    ctx.strokeStyle = rgba(WH, 0.5); ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = WH; ctx.font = '800 12px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('☣ ' + (G.boss.name || 'BOSS'), W / 2, by - 9);
  }

  // low HP vignette
  if (player.hp / player.maxHp < 0.3) {
    const pulse = 0.25 + 0.15 * Math.sin(G.time * 6);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(255,40,60,0)'); v.addColorStop(1, `rgba(255,30,50,${pulse})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
}

function drawTouch() {
  // virtual joystick
  if (pointer.down && pointer.type === 'touch') {
    ctx.globalCompositeOperation = 'lighter';
    glow(pointer.sx, pointer.sy, 60, CY, 0.15);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(WH, 0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pointer.sx, pointer.sy, JOY_MAX, 0, TAU); ctx.stroke();
    let jx = pointer.x - pointer.sx, jy = pointer.y - pointer.sy;
    const l = Math.hypot(jx, jy); if (l > JOY_MAX) { jx = jx / l * JOY_MAX; jy = jy / l * JOY_MAX; }
    ctx.fillStyle = rgba(CY, 0.7);
    ctx.beginPath(); ctx.arc(pointer.sx + jx, pointer.sy + jy, 26, 0, TAU); ctx.fill();
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

function startGame() {
  unlockAudio();
  // reset
  Object.assign(G, {
    state: 'playing', time: 0, shake: 0, hitstop: 0, flash: 0,
    enemies: [], eProj: [], pProj: [], gems: [], pickups: [],
    particles: [], floaters: [], beams: [], arcs: [],
    kills: 0, score: 0, combo: 0, comboTimer: 0,
    pendingLevels: 0, rerolls: 1, spawnTimer: 0, nextBossAt: 75, bossNum: 0, boss: null, frost: null,
  });
  enemyId = 1;
  player.x = player.y = 0; player.vx = player.vy = 0;
  player.level = 1; player.xp = 0; player.xpNext = 6;
  player.invuln = 0; player.dashCD = 0; player.dashTime = 0;
  player.weapons = []; player.passives = {};
  player.stats = freshStats();
  recalc(); player.hp = player.maxHp;
  addWeapon('pulse');
  G.cam.x = 0; G.cam.y = 0;
  hideOverlays();
  if (Sound) { Sound.startMusic(); Sound.setIntensity(0); Sound.setMusicTempo(112); }
}

function gameOver() {
  G.state = 'gameover';
  sfx('gameover');
  if (Sound) Sound.stopMusic();
  const cur = { score: G.score, time: Math.floor(G.time), kills: G.kills, level: player.level };
  const isBest = cur.score > (G.best.score || 0);
  if (isBest) { G.best = cur; saveBest(cur); }
  document.getElementById('newBest').classList.toggle('show', isBest);
  document.getElementById('overStats').innerHTML = statGrid([
    ['Survived', fmtTime(cur.time)], ['Level', cur.level],
    ['Kills', cur.kills], ['Score', cur.score.toLocaleString()],
    ['Best Score', (G.best.score || 0).toLocaleString()], ['Best Time', fmtTime(G.best.time || 0)],
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
    (b.score ? `Best: ${b.score.toLocaleString()} pts · ${fmtTime(b.time)} survived` : 'No record yet — set one.');
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

// touch on dash button
canvas.addEventListener('pointerdown', e => {
  if (!IS_TOUCH || G.state !== 'playing') return;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (dist(x, y, W - 56, H - 56) < 40) { tryDash(); e.stopImmediatePropagation(); }
}, true);

// buttons
document.getElementById('btnPlay').addEventListener('click', startGame);
document.getElementById('btnAgain').addEventListener('click', startGame);
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
  if (dt > 0.05) dt = 0.05;          // clamp big gaps (tab switches)
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// boot
boot.style.display = 'none';
showTitle();
requestAnimationFrame(frame);

// expose a tiny debug hook
window.NEON = { G, player };

})();
