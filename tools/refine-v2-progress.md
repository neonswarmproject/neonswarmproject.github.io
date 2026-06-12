# NEON SWARM v2+ content pass — progress tracker

STATUS: ACTIVE
Branch: main — push `neon main` after EVERY item (standing user authorization,
2026-06-11: "pushing directly to main after each one without waiting for my
confirmation"). Each push: VERSION +0.1 in js/game.js + CHANGELOG.md entry +
tick the item here. Keep the game runnable after every commit. NEVER push
origin, never force-push.

Reuse existing helpers (G, player, director, diffScale, spawnEnemy, killEnemy,
damageEnemy, applyPickup, updateGems, addXp, moveVector, BOSSES, WEAPONS,
PASSIVES, grid.query, glow/poly/star/rgba, telegraph helpers). Named constants
for every tunable. Zero console errors desktop + mobile.

## Shipped

- [x] v2.0 — refinement pass (A–L + FINAL: director, boss-rush core, boss
      quality pass, THE ARCHITECT, mobile/perf/animation overhauls, bug
      sweep). Merged to main + tagged 2026-06-11.

## Checklist (work top to bottom; one commit+push per item)

### Quick fixes & monetization
- [x] Q1 Game-over restart on ENTER only (v2.1) — keyboard restart ENTER-only,
      0.7s tap/click grace on "Run it back" so mobile double-tap dash can't
      tap-through, desktop-only ENTER hint on the death screen
- [x] Q2 Removed the "Pure HTML5 Canvas…" footer from the title screen,
      #verTag version span kept (v2.2)
- [x] Q3 Title-screen ads (v2.3): AdSense loader + 4 rectangles (top/bottom
      banners, left/right rails) inside the #title overlay; slots configured
      via window.NEON_ADS in index.html (unset → hidden, no push, no console
      errors); responsive breakpoints keep the panel uncrowded.
      NOTE for owner: create 4 display ad units in AdSense and paste their
      slot numbers into window.NEON_ADS to activate.

### Combat & progression
- [x] C1 ALL player weapon ranges −25% (v2.4) — global WRANGE=0.75 at every
      range site incl. acquisition radii + FOCUS_LEAD_R; AoE sizes untouched
- [x] C2 Boss absolutes (v2.5): 2× HP everywhere (incl. ARCHITECT 48k),
      PLAYER_VS_BOSS=0.75 at the damageEnemy funnel; verified no build inputs
      reach boss stats (mercy + director already exclude bosses)
- [x] C3 Boss rotating lasers +110% damage (v2.6) — B_BEAM 0.8→1.68 covers
      all four laser attacks (OVERLORD/PRISM/GLITCH/ARCHITECT)
- [x] C4 PRISM & HIVE anti-orbit redesign (v2.7) — PRISM: orbit-radius lock
      detonations w/ angular lead, sweep reversals (white-blink warn), led
      fans; HIVE: velocity-led walls + p2 crossfire, interceptor drones,
      resin slow puddles on predicted path; hpMul bumps 1.15/1.25
- [x] C5 Five NEW late-game weapons (v2.8): Magnus Coil (charge railgun),
      Aegis Loop (shot-eating arc + ripostes), Latch Wyrm (boss-shredding
      latch drill), Temporal Echo (damage-echo bursts), Kinetic Verdict
      (dash slam cone). unlock() gates + floater announcements + LATE TECH
      card tag.
- [x] C6 Five NEW late-game abilities (v2.9): Overdrive Thrusters (dash range
      + cd), Spore Wake (toxic dash trail), Backlash Core (hit-retaliation
      nova), Adrenal Loop (kills refund dash cd), Ghost Protocol (+i-frame
      time). Same unlock-gate + announcement system as C5.
- [x] C7 Phoenix Protocol (v3.0): 4-rank LATE TECH ability; at max it arms an
      extra life (HUD indicator); death → rise at 60% HP, 2.5s i-frames,
      bullet-erase + 380px nova; rank resets to 0 on use and must be refilled
- [ ] C8 Enemy drops (8s duration each): +move speed / longer dash / +30%
      i-frame time on hit

### Save, shop & skins
- [ ] S1 Persistent save (localStorage): coins, owned/equipped skins, record,
      meta unlocks survive closing the game
- [ ] S2 Coins from boss kills (Architect and, later, Developer pay the most)
- [ ] S3 Skin system research + design (how 2D games do skins well), then the
      skin layer over the player render (palette/trail/shape/FX)
- [ ] S4 Title-screen SHOP with 10 creative skins — cheapest ≈ 10 bosses of
      coins, flagship ≈ 100 bosses
### Bosses — elevate ALL to Architect standard
- [ ] B1 SENTINEL TRINITY — three coordinated bodies, Architect-grade
      animation + telegraphs; drops a unique relic/glyph
- [ ] B2 LEVIATHAN — segmented serpent, Architect-grade; unique relic
- [ ] B3 OBELISK — monolithic arena-control boss, Architect-grade; relic
- [ ] B4 MIRROR — LEARNS from the player from spawn until the fight (weapons,
      movement, habits), fights as an improved copy with its own abilities;
      if the fight drags it adapts to counter the player's patterns, forcing
      an aggressive escalating duel; relic
- [ ] B5 NEXUS — portal/network boss, Architect-grade; relic
- [ ] B6 Full relic set → summon THE ARCHITECT at will (extend the existing
      glyph/sigil ritual to the grown roster)
- [ ] B7 THE ARCHITECT absorbs EVERY roster boss's mechanics (fold in each
      new boss as it lands) + finale-grade escalation so it reads as a finale

### Postgame (after the Architect dies)
- [ ] P1 Postgame state: LOWER enemy generation + genuinely new mechanics
      (no big-horde spam)
- [ ] P2 Special postgame bosses ≥ Architect tier, including fights that pull
      the player into other dimensions
- [ ] P3 THE DEVELOPER — final boss summoned with ≥10 manuscripts (dropped by
      the Architect and postgame bosses): throws code, debuffs/effects,
      teleports, dimension hops, multiple arms, summons mini-OVERLORDs,
      massive, all previous bosses' abilities + brand-new ones, animations
      unlike anything else
- [ ] P4 Developer kills you → Easter eggs on title screen + run report:
      English taunts ("Thought you could beat me?", "Forgot who codes this
      game?"), glitch/bug effects, mock "/kill player", more
- [ ] P5 Beat the Developer → special trophy power, then announced WAVE
      survival mode (wave 1 small, scaling until you fall, wave number
      announced at each start)

### Animations
- [ ] A1 Animation excellence pass: player, weapons, enemies, every boss to
      the Architect bar and beyond (Terraria / Hollow Knight / Silksong
      reference); enemy/boss attacks stay readable and distinct from player
      effects
