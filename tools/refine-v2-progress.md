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
- [x] I — Adaptive performance: device-tier startup budget
      (hardwareConcurrency/deviceMemory/DPR), rolling-FPS runtime adjustment
      of particle/glow/telegraph budgets, no per-frame allocations
- [x] J — Animations everywhere: player (idle/thruster/dash/hurt/level-up),
      weapons (fire/impact), enemies (spawn-in/death), bosses (already in C2);
      readability sacred — enemy fire visually distinct
- [x] K — Bug sweep: weapon info() vs update() audits (off-by-one in ALL
      weapon cards found & fixed + 4 per-weapon text/threshold mismatches),
      collision edge cases, off-screen cleanup, pause/resume, HUD correctness
- [x] L — Free improvements: first-run hint, directional damage indicator,
      "boss incoming" banner (in C1), results screen "% of best" row
- [ ] FINAL — in this exact order:
      1. Re-run the adversarial review (the first run died on the usage
         limit with ZERO findings produced — do NOT trust that empty result).
         Either re-launch the review workflow over `git diff main...refine/v2`
         or review the diff directly for: runtime errors, boot-order/TDZ
         issues, state-reset gaps (G literal vs startGame), canvas state
         leaks, multi-touch Map leaks, camZoom math errors. Fix + commit.
      2. Playwright smoke test on http://localhost:8123 (server may already
         be running; restart with `python3 -m http.server 8123` if not):
         load → zero console errors → click PLAY → set NEON.G.time = 44 via
         evaluate → boss spawns (sweep + banner + entrance) → teleport boss
         near player, let it die → ~5 level-ups paid out, farm window opens.
         Also test at 390x844 viewport. Fix anything broken + commit.
      3. Bump in-game VERSION const to '2.0-rc1' (NOT 2.0 — that happens at
         release), commit.
      4. `open http://localhost:8123` to put the preview in a browser tab.
      5. Write the human test checklist at the bottom of this file, set
         STATUS: AWAITING-HUMAN at the top, print OVERNIGHT-DONE, stop.

## Human test checklist (v2.0-rc1 preview — http://localhost:8123)

Desktop:
- [ ] Title screen loads, version tag reads v2.0-rc1, no console errors (F12)
- [ ] Early game feels calm (sparse spawns in the first 40s), movement turns
      feel snappy, dash has a zoom punch + ghost trail and carries momentum
- [ ] ~45s: swarm disintegrates in a shockwave, WARNING banner, a random boss
      materializes (entrance animation) and duels you 1-on-1 with telegraphed
      attacks; beatable with just the starting weapon by dodging
- [ ] Boss death pays out a gem burst worth ~5 level-ups, drops its buff,
      a heal, and a yellow GLYPH rune; normal spawns resume gently afterwards
- [ ] Level-up cards: first picks always include a weapon AND a passive and
      offer NEW weapons early; card text matches what the upgrade actually does
- [ ] Click a creature → focus reticle appears, your weapons train on it;
      click it again → focus off; click another → focus switches
- [ ] Bomb pickup: field clears, then spawns ramp back over ~25s (no wall)
- [ ] Survive 6 boss kills → all 6 glyph pips fill on the bottom-right slot →
      "THE SIGIL IS FORGED" → press G → portal ritual at arena center →
      THE ARCHITECT (5 phases, 4 shielded rune nodes — kill nodes first).
      Beating it drops the Ascendant Core + permanent ARCHITECT SLAIN badge
- [ ] Game over screen shows "This Run … % of best"

Mobile (or DevTools device emulation):
- [ ] Camera is zoomed out — you can actually see approaching enemies
- [ ] Joystick appears where the thumb lands; re-placing the thumb never
      causes a random direction twitch
- [ ] Dash via the » button or double-tap WHILE moving with the other finger —
      movement never stops or stutters during dash
- [ ] A short tap on a creature focuses it without interrupting movement
- [ ] Tapping the pulsing sigil slot summons THE ARCHITECT (when forged)

## After human confirmation ONLY
merge refine/v2 → main, push to `neon` remote, bump VERSION to '2.0',
update CHANGELOG.md, tag v2.0. (Deploys GitHub Pages live.)
