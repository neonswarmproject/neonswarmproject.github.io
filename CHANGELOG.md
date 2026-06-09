# Changelog

All notable changes to **NEON SWARM**. The live build number is the `VERSION`
constant in `js/game.js` (shown discreetly on the title screen). The published
baseline was v1.0; each update bumps the minor version by 0.1.

## v1.2 — 2026-06-08 — Nine new weapons

### New weapons
Doubled-plus the arsenal — nine self-contained weapons join the level-up pool,
each scaling with the existing passive multipliers (`S()`):
- **Razor Disc** (`glaive`, 🔁) — spinning discs that fly out then home back,
  hitting on both passes (hit-set clears on return). Max 9.
- **Plasma Mines** (`mines`, ◇) — proximity/fuse mines that detonate in an AoE;
  capped simultaneous count, chain-friendly. Max 8.
- **Singularity** (`vortex`, 🌀) — a slow orb that leaves a vortex zone pulling
  and damaging enemies for a few seconds. Max 8.
- **Flak Burst** (`flak`, ✸) — a shell that airbursts into a cone of shrapnel
  bolts at mid-life. Max 8.
- **Arc Whip** (`whip`, ➰) — a melee arc swipe in the aim direction with
  knockback; later levels add a second swipe. Max 9.
- **Sentry Drone** (`sentry`, ▣) — deployable auto-turrets that fire at the
  nearest enemy then expire; capped count. Max 8.
- **Thunderstorm** (`storm`, ☇) — lightning strikes around the player (biased
  toward foes) with a small AoE and brief slow. Max 8.
- **Prism Ray** (`prismbeam`, ✴) — a piercing beam that splits toward other
  nearby enemies at its endpoint. Max 8.
- **Pulsar** (`pulsar`, ❂) — orbiting orbs that emit rhythmic shockwaves which
  damage and push. Max 7.

### Engine
- New projectile kinds (`glaive`, `vortex`, `flak`) extend both the body-pass
  render and `updateProjectiles()` motion (out-and-return, vortex-on-expiry,
  mid-life airburst).
- Added dedicated `_wq` / `_wq2` spatial-query buffers so the new weapons'
  nested `grid.query` calls never clobber the shared `_q`.
- All per-weapon spawned objects (mines, drones, vortices, pulsar orbs) are
  hard-capped; `MAX_ENEMIES` / `MAX_PARTICLES` remain respected.
- `MAX_WEAPONS` raised 6 → 7 (a flagged balance lever) so the larger pool gives
  more build variety; HUD loadout still lays out correctly.

## v1.1 — 2026-06-08 — Balance pass & deeper progression

### Economy & pickups
- **Fortune** decoupled from loot: it no longer affects enemy drop rates or
  elite spawns. It now only grants extra rerolls and a small nudge to the
  upgrade-card pool (description is now "Extra rerolls & better upgrade
  choices"). Cap raised 5 → 7.
- Normal-enemy utility drops are now genuinely rare — cumulative roll thresholds
  heal 0.4%, magnet 0.7%, bomb 0.9% (named constants). Elite/boss drops
  unchanged.
- **Magnet** pickup now only attracts XP gems that are currently on-screen
  (within half the screen diagonal, which equals the off-screen spawn ring);
  off-screen gems are left alone.
- **Bomb** pickup no longer affects bosses at all, and its kills now yield
  nothing — no gems, no pickups, no splitter children — so it can't chain into
  an avalanche of drops. Screen shake / flash / expanding ring / projectile
  clear are kept.

### Weapons — +4 levels each
- Pulse Cannon 8 → 12, Halo Blades 7 → 11, Shock Pulse 7 → 11,
  Arc Lightning 7 → 11, Seeker Swarm 7 → 11, Photon Lance 7 → 11,
  Cryo Field 6 → 10. New tiers continue each weapon's scaling (more
  bolts/blades/jumps/missiles/beams, more pierce, bigger radius, more damage)
  with matching upgrade-card text.

### Passives — higher caps for the late game
- Per-level effects unchanged; caps raised: Vigor/Swift/Expanse/Greed/Regen/
  Plating/Focus +3, Overcharge 8 → 11, Haste 7 → 10, Velocity 5 → 8,
  Magnet 5 → 8.

### Difficulty
- Rewrote late-game scaling: enemy HP ramps hard past ~4 min (new cubic term),
  speed cap raised to 1.95×, damage ramp steepened. The spawn director is more
  aggressive late (lower interval floor, faster batches) while still respecting
  `MAX_ENEMIES`. Tuning constants are flagged to be retuned once
  meta-progression exists.

### Meta
- Added a single `VERSION` source-of-truth constant, shown on the title screen,
  and started this changelog.
