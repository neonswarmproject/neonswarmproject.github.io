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
- [x] C8 Enemy drops (v3.1): Speed Surge (+35% move), Long Dash (+60% dash
      distance), Guard Frame (+30% i-frame time) — 8s each, HUD time bars,
      unique pickup glyphs, cumulative drop roll after heal/magnet/bomb

### Save, shop & skins
- [x] S1 Persistent save (v3.2): PROFILE module (neonswarm.profile.v1) —
      coins, owned/equipped skins, lifetime stats; defensive loader; legacy
      best/meta keys untouched; coin balance on title screen
- [x] S2 Boss coin bounties (v3.3): roster 10⬡ (+2/cycle), ARCHITECT 40⬡;
      floaters + persisted via PROFILE; Developer premium reserved for P3
- [x] S3 Skin system (v3.4): researched 2D skin practices (ramps, silhouette
      preservation, VFX tiers); SKINS registry (11 skins, 3 tiers) wired
      through drawPlayer/flames/halo/glow/dash-trail; buySkin/equipSkin
      persisted via PROFILE
- [x] S4 THE HANGAR (v3.5): title-screen shop, 10 buyable skins + default,
      live animated previews, buy/equip/equipped states, coin balance,
      Esc-close + key guard; prices 100→1000⬡
### Bosses — elevate ALL to Architect standard
- [x] B1 SENTINEL TRINITY (v3.6): prime + 2 phantom projections in rotating
      formation; tri-beam edges, staggered led volleys, lance relay, phase-3
      overclock duty cycle; crown marks the damageable body; glyph #7 joins
      the sigil set automatically
- [x] B2 LEVIATHAN (v3.7): 14-seg constraint-chain serpent, head-only damage,
      serpentine weave pursuit, coil+gate+constrict, dive eruption, phase-3
      spine storm; glyph #8
- [x] B3 OBELISK (v3.8): immobile monolith — rotating lattice (+reversal at
      awakening), sector slams, repulse→gap-ring trap, shield pylons (archnode
      reuse, die with boss), telegraphed relocation, eye-opening phase 3 with
      lighthouse mega-beam; glyph #9
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
