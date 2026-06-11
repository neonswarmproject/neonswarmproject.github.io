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
- [ ] Q1 Game-over restart on ENTER only — dash key must never restart a run
      (death + dash currently skips the report screen)
- [ ] Q2 Remove the "Pure HTML5 Canvas + Web Audio · no images, no libraries,
      all code" footer from the title screen (KEEP the #verTag version span)
- [ ] Q3 Title-screen ads: AdSense loader (client ca-pub-9117893594553497) + 4
      rectangle ad units, one per rectangle; slots configurable at the top of
      index.html; graceful styled placeholder when a slot is unset; hidden
      during gameplay; zero console errors either way

### Combat & progression
- [ ] C1 ALL player weapon ranges −25% (attacks must not outrange bosses)
- [ ] C2 Boss absolutes: remove build-based boss balancing entirely; 2× every
      boss's HP; player damage TO bosses −25%
- [ ] C3 Boss rotating lasers +110% damage
- [ ] C4 PRISM and HIVE anti-orbit redesign — circling them must stop working
      (punish constant-radius movement; force engagement)
- [ ] C5 Five NEW weapons, all late-game unlocks (gated by run progress, not
      in the early card pool)
- [ ] C6 Five NEW abilities, late-game unlocks — split super-dash into two
      (longer dash + shorter cooldown; damaging spore-trail dash) + invent
      three more in that spirit
- [ ] C7 Maxable extra-life ability: at max rank grants ONE extra life for the
      rest of the run; if that life is consumed the ability resets to rank 0
      and must be refilled
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
