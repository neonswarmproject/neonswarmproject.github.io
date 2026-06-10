# NEON SWARM v2 refinement — progress tracker

STATUS: IN-PROGRESS
Branch: refine/v2 — do NOT push to main; deploy only after human confirmation.
Each item = one subsystem commit. Keep the game runnable after every commit.
Reuse existing helpers (G, player, director, diffScale, spawnEnemy, killEnemy,
damageEnemy, applyPickup, updateGems, addXp, moveVector, BOSSES, WEAPONS,
PASSIVES, grid.query, glow/poly/star/rgba, telegraph helpers). Named constants
for every tunable. Zero console errors desktop + mobile.

## Checklist (work top to bottom)

- [x] STEP 0 — overnight wrapper (tools/claude-overnight.sh), statusline shim,
      this progress file, launch instructions (tools/OVERNIGHT-README.md)
- [x] B — Adaptive difficulty director: lower early spawn rate/batch, hidden
      power+stress signals modulating spawns (between-boss windows only),
      progressive ~25s re-ramp after bomb, guaranteed early card variety,
      buff under-performing weapons
- [x] C1 — Boss-rush core: shuffled boss bag (OVERLORD included, no fixed
      intro), elapsed-time+cycle scaling (not fixed rank), boss spawn sweeps
      normal enemies with spectacular shockwave (particles/flash/hitstop),
      director suppressed during fights (boss summons exempt), boss XP ≈ 5
      levels (fix ~20-level dump)
- [x] C2 — Boss epic-ness: richer procedural designs, entrance animations,
      phase-transition cinematics, more telegraphed attack patterns for
      OVERLORD, PRISM, HIVE, GLITCH, CONDUCTOR, WARDEN (OVERLORD gets special
      attention)
- [x] D — THE ARCHITECT: glyph fragments from each roster boss → sigil UI slot
      → portal ritual → 5-phase screen-dominating super-boss with destructible
      rune nodes, fixed brutal difficulty, Ascendant Core + permanent meta
      unlock (extra reroll + damage head start, title-screen badge)
- [x] E — Enemy levels: Lv scaling starts after first boss cycle/time
      threshold, "Lv N" badge only when level ≥ 2, named constants
- [x] F — Movement feel: quick turn response, dash velocity transfer, dash
      camera zoom + motion trail, i-frames kept, smooth camera lerp
- [x] G — Mobile overhaul: camera zoom-out factor wired through ALL
      world<->screen math (magnet radius, spawn ring, telegraphs), true
      multi-touch (pointerId map), dynamic joystick with dead zone, dash on
      separate touch/double-tap that never stops movement
- [x] H — Focus target: G.focusTarget, click/tap creature to focus (toggle /
      switch), auto-aim weapons prefer focus, tap-vs-drag thresholds on
      mobile, subtle reticle
- [ ] I — Adaptive performance: device-tier startup budget
      (hardwareConcurrency/deviceMemory/DPR), rolling-FPS runtime adjustment
      of particle/glow/telegraph budgets, no per-frame allocations
- [ ] J — Animations everywhere: player (idle/thruster/dash/hurt/level-up),
      weapons (fire/impact), enemies (spawn-in/death), bosses (already in C2);
      readability sacred — enemy fire visually distinct
- [ ] K — Bug sweep: weapon info() vs update() audits (purple AoE projectile
      claim), collision edge cases, off-screen cleanup, pause/resume, HUD
      correctness, zero console warnings
- [ ] L — Free improvements: first-run hint, directional damage indicator,
      "boss incoming" banner, results screen
- [ ] FINAL — serve locally, open browser preview tab, desktop+mobile-viewport
      Playwright smoke test (no console errors), write test checklist, set
      STATUS: AWAITING-HUMAN

## After human confirmation ONLY
merge refine/v2 → main, push to `neon` remote, bump VERSION to v2.0,
update CHANGELOG.md, tag v2.0.
