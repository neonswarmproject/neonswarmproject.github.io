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
- [x] B4 MIRROR (v3.9): run-long intel (dash count, avg speed, top weapon) →
      improved copy (speed+8%, your dash cadence + your trail, boss-grade
      version of your weapon family); shard veil; 12s adaptation loop with
      kite/hug/dash counters + 15% speedup each; phase-3 second reflection;
      glyph #10
- [x] B5 NEXUS (v4.0): portal web — relay fire from player-nearest exits,
      reweave on timer + on phase wounds, burning link cycle, warp snares
      (teleport + glitch jolt), phase-3 portal spokes; keep-away node;
      glyph #11
- [x] B6 Relic set → Architect summon (v4.1): per-boss colored relics
      (pickup/floater/pip identity), pips map to specific bosses, full set
      of 11 forges the sigil → G/tap summons the Architect at will
- [x] B7 ARCHITECT relic echoes (v4.2): phase-gated ECHO systems — TRINITY
      tri-beam (P2), LEVIATHAN constriction ring + gate (P3), OBELISK bars
      (P4), MIRROR intercepts + NEXUS portal relays (P5/ERASE), all under
      the ERASE cooldown compression; announced floaters per echo

### Postgame (after the Architect dies)
- [x] P1 Postgame state (v4.3): Architect death → THE LATTICE BREAKS;
      spawn interval ×1.8, violet veil, rift tears (void stragglers +
      gravity-flicker collapse + manuscript chance), manuscript pickups +
      HUD counter (10 needed for the Developer)
- [x] P2 Postgame bosses (v4.4): HERALD OF THE VOID (void dimension veil,
      moon-converged beams, unlight rain, hungering-dark donut) + CHRONO
      WARDEN (chrono veil, clock-hand beams, tick-tock semicircles, REWIND
      anti-burst, time dilation); rift scheduler alternates them every 75s;
      25⬡ + 3 manuscripts each; dimension enter/exit banners + veils
- [x] P3 THE DEVELOPER (v4.5): 10-manuscript summon (G/COMPILE slot), green
      compile-portal ritual; 90k HP, 6 segmented arms, code-glyph throws,
      curse bolts (slow/reverse-controls/bug DoT), mini-OVERLORD summons,
      teleport, quad compile-beams, gap rings, dimension hops, /kill zones,
      5-phase ladder (SYNTAX→KERNEL PANIC) w/ ERASE compression; code-faced
      hull animation; 200⬡ bounty. (P4 taunts / P5 survival next.)
- [x] P4 Developer-death Easter eggs (v4.6): run report glitches to
      "/kill player" + green taunt + "Compiled by THE DEVELOPER / Exit code
      137"; title-screen logo glitch + persistent taunt (PROFILE.devTaunt)
      until you beat it; 10 rotating taunts
- [x] P5 Developer victory → ROOT ACCESS + Survival (v4.7): trophy power
      (+50% dmg / +25% AS / +12% move / +10% crit + free Phoenix), DEVELOPER
      SLAIN badge, taunt cleared; announced wave survival (wave 1 ≈5, scaling
      count/HP/dmg + widening roster, boss wave every 5th), HUD wave counter,
      director/rift/roster-spawn all yield to waves

### Animations
- [x] A1 Animation life pass (v4.8): enemy idle breathing (per-id phase) +
      hit-swell; player motion-stretch (speed/dash, squash-laterally);
      silhouette + telegraph readability preserved. Bosses (B1-7, P2, P3) each
      already ship bespoke procedural animation. Player idle/thruster/dash and
      weapon fire/impact + enemy spawn-in/death landed back in v2.0 (J).
