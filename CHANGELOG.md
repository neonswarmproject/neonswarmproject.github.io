# Changelog

All notable changes to **NEON SWARM**. The live build number is the `VERSION`
constant in `js/game.js` (shown discreetly on the title screen). The published
baseline was v1.0; each update bumps the minor version by 0.1.

## v4.7 — 2026-06-12 — Beat THE DEVELOPER → ROOT ACCESS + Survival

The finale's reward, and the endless mode after it:

- **ROOT ACCESS** (trophy): slaying the Developer grants a run-defining
  permanent power — +50% damage, +25% attack speed, +12% move speed, +10%
  crit — plus a free Phoenix revive. "sudo survive — the swarm is yours to
  break." Clears the Developer's taunts and unlocks the **⌨ DEVELOPER SLAIN**
  title badge.
- **WAVE SURVIVAL:** the run rolls straight into classic announced waves.
  Wave 1 is small (~5); each wave scales count, HP and damage; the enemy
  roster widens as waves climb (rushers → shooters/splitters → tanks/
  shielders → bombers/juggernauts). Every 5th wave is a **BOSS WAVE** — a
  roster titan storms in. Each wave number is announced ("WAVE 7 · BRACE") and
  shown live in the HUD. It runs until you finally fall.

## v4.6 — 2026-06-12 — If THE DEVELOPER kills you (Easter eggs)

- Die to THE DEVELOPER and the run report glitches: the "YOU FELL" title
  becomes a chromatic-aberration **`/kill player`**, a green monospace taunt
  appears ("Forgot who codes this game?", "git commit -m \"player removed\"",
  "// TODO: let them win (won't fix)", "Segmentation fault (you dumped)" …),
  and the stat grid reads "Compiled by THE DEVELOPER · Exit code 137".
- It then **tampers with the title screen**: the NEONSWARM logo glitches and a
  taunt sits under the tagline — persisting across launches until you beat it.
- All of it clears the moment you slay the Developer (sets DEVELOPER SLAIN).

## v4.5 — 2026-06-12 — THE DEVELOPER (the final boss)

Collect 10 manuscripts (the Architect drops 3; postgame bosses and rifts
supply the rest), then press **G** / tap the COMPILE slot. A green terminal
portal streams code, and THE DEVELOPER compiles in — massive, six-armed, and
aware it wrote the game.

- **Six segmented arms** sweep around a giant code-faced hull (scrolling
  source, a single cursor-eye, corner brackets); the arm tips are lethal and
  are the muzzles for thrown code.
- **THROW CODE:** fans of glyph-bullets (`{ } ; < > / *`) from multiple arms.
- **CURSES (LINT, phase 2):** telegraphed hex bolts that, on hit, **slow you**,
  **reverse your controls**, or **infect you with a BUG** (damage-over-time) —
  a clean dash dodges the hex too.
- **mini-OVERLORDs:** summons minion cores that fire their own radial rings.
- **TELEPORT + COMPILE-BEAMS (RUNTIME, phase 3):** glitch-blinks across the
  arena; quad rotating beams sweep from the body.
- **EXCEPTION (phase 4):** Warden-style gap rings, **dimension hops** (it
  warps you between void/chrono/source mid-fight), and **`/kill player`** —
  telegraphed red zones that snap to your position.
- **KERNEL PANIC (phase 5):** the eye goes red, every cooldown compresses,
  all of the above at once.
- Pays a massive 200 ⬡ bounty. (Death taunts + the survival trophy land next.)

## v4.4 — 2026-06-12 — Postgame bosses: fights in other dimensions

Every ~75s of postgame, a rift births a tyrant and PULLS YOU THROUGH — the
world itself changes until it dies (each pays 25 ⬡ and 3 manuscripts):

- **HERALD OF THE VOID** (void dimension — darkness veils the arena, light
  dies at the edges): a winged un-light seraph. Three orbiting moons converge
  telegraphed beams from three directions; armed shards condense around you
  and lunge; from phase 2 the **HUNGERING DARK** — an expanding ring of
  blackness you must stay inside of or beyond, never within. Phase 3 ECLIPSE
  turns its corona white and compresses every cooldown.
- **CHRONO WARDEN** (chrono dimension — sepia world, drifting scanlines): a
  living clock. Two clock-hand beams sweep at different speeds; TICK-TOCK
  semicircles detonate on alternating sides of the beat; **REWIND** — burst
  it too hard and it snaps back to its 5s-old ghost (visible on the field)
  and heals 4%, three times max — sustained pressure beats burst. Phase 3
  dilates time around it while its hands quicken.
- Both scale with elapsed time on top of huge multipliers — comparable to or
  beyond the Architect by the time you meet them.

## v4.3 — 2026-06-12 — POSTGAME: the lattice breaks

Killing THE ARCHITECT no longer just opens a farm window — it ignites the
postgame ("THE LATTICE BREAKS"):

- **Calmer generation, weirder world:** normal spawn pressure drops ~45%
  (interval ×1.8) and a violet veil settles over the arena. No horde spam —
  the postgame is about its own mechanics.
- **RIFT TEARS:** telegraphed wounds in space open near you, trickling
  void-touched (purple, hardened) stragglers, then collapse with a gravity
  flicker that drags you toward them and a shard burst. Some collapses yield
  a **MANUSCRIPT** page.
- **MANUSCRIPTS:** the Architect's corpse drops 3 pages; rifts (and the
  coming postgame bosses) supply the rest. A page counter joins the HUD —
  at 10/10: "THE SOURCE IS ASSEMBLED. Something wants to be written."
  (THE DEVELOPER arrives in a coming build.)

## v4.2 — 2026-06-12 — THE ARCHITECT wields every relic (finale escalation)

It was summoned by eleven relics — now it uses them. Each phase awakens an
announced **ECHO** of a fallen roster boss, stacking onto its existing kit:

- **Phase 2 — ECHO: TRINITY:** two phantom vertices orbit it; the triangle's
  telegraphed edges burn on a cycle.
- **Phase 3 — ECHO: LEVIATHAN:** a serpent ring materializes around you and
  constricts — find the white gate before the snap.
- **Phase 4 — ECHO: OBELISK:** two rotating stone bars grind around it.
- **Phase 5 (ERASE) — ECHO: MIRROR + ECHO: NEXUS:** dash-intercept zones
  pre-fired along your velocity, plus three portals relaying led fans from
  whichever exit is closest to you.
- All echo cadences obey the ERASE cooldown compression. The finale now
  reads as a finale: by the last phase the Architect is fighting you with
  the whole roster at once.

## v4.1 — 2026-06-12 — Boss relics & the full-set summon

- Every roster boss drop is now a true **RELIC**: the dropped fragment, its
  pickup glow, its floater ("SENTINEL TRINITY RELIC 7/11") and its pip on the
  sigil slot all carry that boss's color. Each pip on the sigil ring maps to
  a specific boss — you can see exactly which relics you're missing.
- Collecting all **11** forges the SIGIL; pressing **G** (or tapping the
  slot) summons THE ARCHITECT at a moment of your choosing — the ritual
  scaled automatically as the roster grew from 6 to 11.

## v4.0 — 2026-06-12 — NEXUS (new roster boss; the roster is complete)

The portal network. The node barely fights you — its web does:

- **Relay fire:** it ingests orbs at the portal near itself and they erupt as
  led fans from the exit nearest YOU (two exits in phase 3). Watch the exits,
  not the boss.
- **Reweave:** the whole web relocates around you every 9s — and instantly on
  every phase wound.
- **NETWORK SURGE (phase 2+):** the portal cycle telegraphs, then its links
  BURN for 2.4s, carving the arena into cells.
- **WARP SNARE (phase 2+):** a ring closes on your position — caught inside,
  you're teleported through a random portal with a glitch jolt.
- **OVERLINK (phase 3):** every portal grows a rotating spoke beam.
- The node keeps its distance and drifts away if you approach. Drops a
  Magnet. Glyph #11 — the ritual now spans all eleven roster bosses.

## v3.9 — 2026-06-12 — MIRROR (new roster boss)

It has been watching since the run began.

- **Run-long learning:** it counts your dashes, samples your real travel
  speed, and reads your highest-level weapon. At spawn it announces what it
  copied — it moves at YOUR average speed +8%, dashes at YOUR cadence
  (leaving your own ghost trail), and fights with a boss-grade version of
  your best weapon family (volleys / locked lances / orbiting blades /
  point-blank novas / homing seekers).
- **Shard veil** (its own ability): periodic glass-shard fans.
- **Mid-duel adaptation:** every 12s of a dragging fight it reads how you're
  fighting and counters — kiting grants it flank BLINKS, face-tanking grants
  repulse novas, everything else gets dash-INTERCEPT zones pre-fired along
  your velocity. Every adaptation also makes it 15% faster. Three stacks =
  "FINAL FORM: it is more you than you". Wounding it into phase 2 triggers
  an adaptation instantly.
- **Phase 3 — two reflections:** a second half-real copy mirrors your
  position from the opposite side and echoes the shard fans.
- Drawn as your own hull ×2.3 with chromatic ghosting and a crack down the
  plating. Drops a Long Dash. Glyph #10 joins the ritual.

## v3.8 — 2026-06-12 — OBELISK (new roster boss)

The monolith that owns the ground. It never walks — it makes walking YOUR
problem:

- **Rotating stone lattice:** four thick rune-bars orbit it slowly; move with
  the rotation or get ground. The phase-3 **AWAKENING** speeds the lattice
  ×1.8 and randomly REVERSES it (white-blink warning), and opens the eye —
  a white lighthouse mega-beam sweeps the arena.
- **Sector slams:** telegraphed detonations carpet your sector.
- **REPULSE (phase 2+):** an imploding warn ring, then a shove that throws
  you outward — straight into a gap ring of bullets collapsing inward.
  Fight back toward the monolith or thread the gap.
- **Wards (phase 2+):** orbiting pylons shield it (45% damage taken) — break
  them first; fresh wards rise at the awakening. They fall with the boss.
- **Relocation:** sinks underground and erupts near you on a telegraph, so
  there is nowhere safe to camp. Drops a Bomb. Glyph #9 joins the ritual.

## v3.7 — 2026-06-12 — LEVIATHAN (new roster boss)

A 14-segment serpent. Only the **HEAD** (white maw, yellow eyes) takes
damage — the body is a living hazard that follows on a constraint chain:

- **Serpentine pursuit:** limited-turn steering + sinusoidal weave; it sweeps
  in arcs instead of beelining.
- **COIL:** it encircles your position spiraling inward, leaving ONE white
  gate in the ring — get through it before the **CONSTRICT** snaps the whole
  body inward and crushes whatever's left inside.
- **DIVE (phase 2+):** submerges (untouchable), a shadow tracks under you,
  then it ERUPTS at your last position — the body bursts out of the breach.
- **SPINE STORM (phase 3):** every other segment sheds armed spines
  perpendicular to the body's curve — a barrage shaped like the serpent.
- Spit volleys lead your velocity between specials. Drops a Speed Surge.
- Glyph #8 joins the sigil ritual.

## v3.6 — 2026-06-12 — SENTINEL TRINITY (new roster boss)

Three bodies, one will — the first of the five new roster bosses, built to
the Architect bar:

- A rotating triangle formation drifts after you. Only the **PRIME** (bigger,
  white-eyed, crowned) takes damage; the two phantom projections still cut
  and ram — shoot the crown.
- **TRI-BEAM:** the triangle's edges telegraph, then BURN while the formation
  keeps spinning — being inside (or lazy) gets cut. Phase 3 **OVERCLOCK**
  keeps the edges hot on a duty cycle: white blink = about to burn.
- **Staggered volleys:** vertices fire velocity-led fans in 120° rhythm.
- **LANCE RELAY (phase 2+):** vertices take turns spearing through your
  position along a telegraphed white lance, then snap back to formation.
- Formation tightens and spins faster each phase. Drops a Guard Frame.
- The SIGIL now needs 7 glyphs — TRINITY's joins the ritual set.

## v3.5 — 2026-06-12 — THE HANGAR (skin shop)

- New **⬡ HANGAR** button beside PLAY opens the shop overlay: 11 skin cards
  with LIVE animated previews (each card runs the real hull renderer — flames,
  hue-cycling, regalia rings), tier labels, prices, and your coin balance.
- BUY auto-equips (disabled until affordable); EQUIP/EQUIPPED states; the
  equipped card glows. Everything persists through the profile.
- Keyboard safety: while the HANGAR is open, Enter/Space can't start a run
  underneath it; Escape closes.

## v3.4 — 2026-06-12 — Skin system (research-grounded)

Data-driven cosmetic layer over the player render, built on 2D-skin best
practices (consistent color ramps, silhouette preservation, VFX as the
premium tier — silhouette never changes, so readability survives):

- 11 skins in three tiers. T1 palette swaps: Bloodline Protocol, Toxin
  Runner, Royal Phantom, Solar Forge. T2 VFX: Glacier Knife (frost wake),
  Ghostlight (translucent hull), Ember Cascade (sheds live embers), Prism
  Current (hue-cycling hull + rainbow dash trail). T3 regalia: Void
  Sovereign (gravity aura + orbitals), Architect's Heir (white-gold sigil
  ring + orbiting shards).
- Skins recolor body/stroke/glow, thruster flames, idle halo, the player
  glow underlay, and the dash ghost trail (soft-wide for ghost/frost,
  spectrum-cycling for prism).
- buySkin()/equipSkin() persist through the profile; prices 100 → 1000 ⬡
  (≈10 → ≈100 roster bosses). Shop UI lands in v3.5.

## v3.3 — 2026-06-12 — Boss coin bounties

- Every roster boss kill pays **10 ⬡** (+2 per completed boss cycle); THE
  ARCHITECT pays **40 ⬡**. Bounty floater on the kill; balance persists in
  the profile and shows on the title screen. THE DEVELOPER will pay top
  bounty when the postgame lands.

## v3.2 — 2026-06-12 — Persistent profile (save system)

- New consolidated localStorage profile (`neonswarm.profile.v1`): **coins**,
  **owned/equipped skins**, lifetime stats (boss kills, runs). Defensive
  loader sanitizes corrupt/missing data; every mutation persists immediately.
- Legacy keys keep working untouched (best run record, meta unlocks) — old
  records survive.
- Title screen shows your coin balance next to the best-run line.

## v3.1 — 2026-06-12 — Enemy combat-buff drops

Normal enemies now rarely drop three new 8-second buffs (HUD icons with time
bars, distinct pickup glyphs):

- **→ Speed Surge:** +35% move speed.
- **» Long Dash:** +60% dash distance (stacks with Overdrive Thrusters).
- **🛡 Guard Frame:** +30% post-hit invulnerability time (stacks with Ghost
  Protocol).

## v3.0 — 2026-06-12 — Phoenix Protocol (the maxable extra life)

- **🔥 Phoenix Protocol** (LATE TECH ability, 4 ranks): charge it to MAX and
  it ARMS — a pulsing "PHOENIX ARMED" indicator sits above your HP bar. The
  next death is refused: you rise at 60% HP with 2.5s of invulnerability, the
  rebirth wave erases every enemy bullet on screen and slams everything
  within 380px for 150 + heavy knockback.
- Using it burns the protocol back to **rank 0** — the cards offer it again
  and the whole ladder must be refilled to re-arm. One arming at a time,
  refills available all run.

## v2.9 — 2026-06-12 — Five late-game abilities

The "super-dash" idea is split in two, plus three more — all unlock-gated
(boss count / time fallback) with the same TECH UNLOCKED announcements and
LATE TECH card tags as the v2.8 weapons:

- **🚀 Overdrive Thrusters** (max 3): dash flies 35% farther and cools 15%
  faster per rank.
- **🍄 Spore Wake** (max 3): the dash sows a toxic spore trail that ticks
  enemies crossing it; higher ranks linger longer and hit harder.
- **💢 Backlash Core** (max 3): every real hit you take detonates a
  retaliatory nova around you.
- **🩸 Adrenal Loop** (max 3): every kill shaves 0.1s/rank off the dash
  cooldown — dash builds chain through crowds.
- **👻 Ghost Protocol** (max 3): +25%/rank invulnerability time from dashes
  and post-hit i-frames.
- New stat plumbing: dashRangeMul, dashCdMul, sporeLv, backlashLv,
  dashKillCd, invulnMul in freshStats; dash/hurt/kill hooks consume them.

## v2.8 — 2026-06-12 — Five late-game weapons

New tech is gated out of the early card pool (`unlock()` per weapon: boss
count with a time fallback) and announces itself with a floater when its gate
opens. Cards show a "LATE TECH" tag.

- **✛ Magnus Coil** (2 bosses / 5 min): charge-up railgun — locks an aim line,
  charges visibly, then fires a screen-length piercing lance with hitstop.
  Twin rails at high level.
- **⛉ Aegis Loop** (3 bosses / 7 min): an energy arc orbits you, EATING enemy
  projectiles it touches and answering each with an aimed riposte bolt. Up to
  three arcs.
- **⚙ Latch Wyrm** (2 bosses / 5 min): launches a drill that latches the
  strongest target (focus > boss > beefiest) and grinds it with rapid ticks —
  the boss-shredder answer to the new HP pools. Up to three drills; high
  levels spray shrapnel into the crowd while grinding.
- **◉ Temporal Echo** (3 bosses / 7 min): pulses mark foes; all damage a
  marked foe takes in 1.4s is repeated as a burst (up to ~80% at max).
  High level splashes bursts to neighbors.
- **⬟ Kinetic Verdict** (4 bosses / 9 min): your DASH slams a shock cone into
  the ground along the dash direction — aftershock and dash-end eruption at
  high level. Built for the C6 dash-ability builds coming next.

## v2.7 — 2026-06-12 — PRISM & HIVE anti-orbit redesign

Circling at a constant radius no longer beats either boss.

- **PRISM — refraction lock:** the boss tracks your orbit radius; holding it
  near-constant for ~2.2s arms a white telegraphed detonation placed AHEAD of
  your circling direction (angular-velocity lead). Change radius, dash, or
  stop-and-go to defuse. From phase 2 its sweeping beams randomly REVERSE
  direction (white blink warning) — orbit-matching the sweep gets cut on the
  turn — and spectrum fans now lead your velocity. Sweep start direction is
  random each volley. hpMul 1.05 → 1.15.
- **THE HIVE — interception:** hex walls aim at your PREDICTED position, and
  from phase 2 a second crossfire wall arrives at 90°, fencing an orbit path
  from two sides. Every 2nd drone spawns as an INTERCEPTOR that launches
  frenzied at your cut-off point instead of trailing you. Phase 2+ also drops
  telegraphed RESIN puddles along your predicted path — standing in one slows
  you to 55%, feeding you to the swarm. hpMul 1.15 → 1.25.

## v2.6 — 2026-06-11 — Boss lasers +110%

- `B_BEAM` 0.8 → 1.68: every rotating/sweeping boss laser (OVERLORD's sweep,
  PRISM's refraction beams, GLITCH's pixel-sort band, THE ARCHITECT's quad
  sweep) hits for just over double. All of them are telegraphed — respect the
  telegraph or pay for it.

## v2.5 — 2026-06-11 — Boss absolutes

- Every boss's HP **doubled** (roster base 950 → 1900; THE ARCHITECT
  24 000 → 48 000).
- Player damage **to bosses −25%** (`PLAYER_VS_BOSS`, applied at the single
  damage funnel) — duels are won by dodging, not by out-statting the boss.
- Verified build-independence: boss stats derive from elapsed time + bag-cycle
  tier only; the adaptive mercy system and spawn director already exclude
  bosses. Their power is absolute.

## v2.4 — 2026-06-11 — All weapon ranges −25%

- New global `WRANGE = 0.75` applied at every weapon's range-defining site:
  projectile travel (pulse, missiles, glaive, vortex orb, flak fuse, sentry
  bolts), beam lengths (Photon Lance, Prism Ray), aura/orbit radii (Halo
  Blades, Shock Pulse, Cryo Field, Pulsar waves, Arc Whip), chain-lightning
  seek + jump distance, Thunderstorm strike ring (targeted strikes now respect
  reach too), and every target-acquisition radius.
- Focus "aim steal" range scales down with it (FOCUS_LEAD_R).
- AoE blast sizes (missile/mine/flak explosions) and field durations are
  unchanged — this is a reach cut, not a damage/area nerf. Builds can no
  longer poke bosses from outside their threat range.

## v2.3 — 2026-06-11 — Title-screen ads (AdSense)

- AdSense loader (client `ca-pub-9117893594553497`) + four ad rectangles on
  the title screen: top banner, bottom banner, left rail, right rail. They
  live inside the title overlay, so gameplay is always ad-free.
- Slot IDs are configured in `window.NEON_ADS` at the top of `index.html`
  (AdSense → Ads → By ad unit → create 4 display units, paste the 4 slot
  numbers). Unconfigured rectangles stay hidden; nothing is pushed for them,
  so the console stays clean with or without ads, ad-blockers included.
- Side rails hide below 1180px width; banners hide on short screens so the
  panel and PLAY button are never crowded.

## v2.2 — 2026-06-11 — Title cleanup

- Removed the "Pure HTML5 Canvas + Web Audio · no images, no libraries, all
  code" footer from the title screen (the discreet version tag stays).

## v2.1 — 2026-06-11 — ENTER-only restart

- Game-over restart is **ENTER-only**: Space/Shift are the dash keys, so dying
  mid-dash-mash no longer skips the death report.
- "Run it back" ignores taps/clicks for the first 0.7s of the death screen —
  a mobile double-tap dash can't tap-through into an instant new run.
- Small "press ENTER to run it back" hint on the death screen (hidden on touch).

## v2.0 — 2026-06-11 — The refinement pass (boss-rush core + THE ARCHITECT)

Twelve subsystems shipped from branch `refine/v2`, closed by an adversarial
review (9 fixes) and a Playwright smoke test.

- Adaptive difficulty director: calm first ~40s, hidden power/stress signals
  modulating spawns between bosses, ~25s re-ramp after a bomb, guaranteed
  early card variety, under-performing weapon buffs.
- Boss-rush core: shuffled boss bag (no fixed intro), elapsed-time + cycle
  scaling, arena-sweeping entrance shockwave, director suppressed during
  fights, boss XP worth ~5 level-ups (no more 20-level dumps).
- Boss quality pass for OVERLORD / PRISM / HIVE / GLITCH / CONDUCTOR / WARDEN:
  entrance animations, phase-transition cinematics, more telegraphed patterns.
- THE ARCHITECT: every roster boss drops a glyph → forged sigil → portal
  ritual summon → 5-phase screen-dominating super-boss with destructible rune
  nodes; drops the Ascendant Core + permanent meta unlock (extra reroll,
  damage head start, title-screen badge).
- Enemy level scaling starts after the first boss cycle; "Lv N" badges.
- Movement feel: snappier turns, dash momentum transfer, dash zoom + trail.
- Mobile overhaul: zoomed-out camera wired through all world/screen math,
  true multi-touch, dynamic joystick with dead zone, dash never stops you.
- Focus target: click/tap a creature, auto-aim weapons prefer it, reticle.
- Adaptive performance: device-tier budgets + rolling-FPS runtime adjustment.
- Animations everywhere: player idle/thruster/dash/hurt/level-up, weapon
  fire/impact, enemy spawn-in/death.
- Bug sweep: weapon-card off-by-ones across ALL weapons, spawn-in contact
  gate, phase-pause zone-timer desync, double-tap dash false positives, more.
- QoL: first-run hint, directional damage indicator, results "% of best" row.

## v1.5 — 2026-06-09 — Boss system + buffs + six bosses

A full, extensible boss system replaces the single inline OVERLORD.

### Architecture
- `BOSSES` registry (like WEAPONS/ETYPES): each boss has `update`/`draw`/optional
  `onPhase`, HP-based `phaseThresholds`, an exclusive `drop`, and a
  `suppressSpawns` flag. `BOSS_ORDER` defines appearance order; `spawnBoss()` now
  builds from the registry. New Game+: when the order wraps, `bossTier++` (bosses
  return with more HP/speed) and it loops to the first roster boss — never back to
  the intro OVERLORD.
- The inline boss behaviour moved to `updateBoss()`, which derives the phase from
  HP, plays a shared transition (flash + shockwave + sfx + brief shake) and runs
  the boss brain. Bosses still slow-chase by default.
- `director()` skips normal waves while a `suppressSpawns` boss is alive.
- Boss bar now shows the boss name **and phase pips**; bosses render their own
  procedural body (`bdef.draw`). Enemy-bullet pool capped at `MAX_EPROJ` (1200,
  drop-oldest) so bullet-hell stays smooth; explosion shake is damped during
  dense boss phases for readability.

### Six bosses (intro + 5)
OVERLORD (radial/double rings, summons, phase-2 spiral), PRISM (sweeping
refraction beams, homing spectrum fans, phase-3 mirror clones), THE HIVE
(drone swarms, telegraphed hex walls, hatching eggs), GLITCH (stutter-teleport,
pixel-sort band, screen-tear wave, ERROR rain, brief telegraphed input hiccup),
THE CONDUCTOR (beat-synced bullets, equalizer walls, telegraphed bass-drop nova,
phase-3 arpeggio), THE WARDEN (continuous gravity pull, spiral bullets,
implosion→explosion, phase-2 mini-singularities). Every dangerous attack is
telegraphed ~0.6–1.2s ahead via `G.telegraphs`.

### Temporary buffs + boss-exclusive drops
New central buff system (`player.buffT`) with HUD icons + time bars, never
dropped by normal enemies:
- Prism Shard (`prism`) — every projectile triple-fires (central hook in
  `firePlayerProjectile`).
- Queen's Nectar (`nectar`) — magnetizes on-screen gems + 2× XP.
- Singularity Fragment (`singularity`) — magnetize all + a damaging aura.
- Clean Save (`cleansave`) — full heal + ~2.5s invuln.
- Tempo Core (`tempo`) — permanent +8% attack speed (stacks).
Each boss drops its exclusive pickup plus a heal.

Verified: zero console errors; 60fps under bullet-hell; eProj/particle caps hold;
boss order/tier-wrap/drops/suppress all correct; phases trigger; every buff
applies, displays, and expires.

## v1.4 — 2026-06-09 — Enemy fidelity pass

Aligned five v1.3 enemies with their original design briefs (behaviour + stats):

- **Saw** now flies in a **straight line and bounces off the arena walls**
  (was a chaser). Stats to brief: hp 50, speed 80, r 16.
- **Detonator** is now a true **heavy bomber**: it chases, and on **contact or
  death** it arms (accelerating-blink telegraph) then erupts in **3 staggered
  concentric rings** (was a periodic stand-off attacker). Immune while arming so
  it always gets to burst. Stats to brief: speed 100, dmg 22, r 16.
- **Juggernaut** now **charges along a telegraphed line OR summons a few minions**
  (was a ground-slam). Stats to brief: hp 220, speed 50, dmg 24, xp 12.
- **Phantom** now **blinks ~every 2s closer to the player**, shows a **fade-out
  telegraph** before each blink, and is **truly intangible (takes no damage)**
  through the fade + ~0.5s after (previously AoE/melee still hit it). Stats to
  brief: hp 24, speed 90.
- **Disruptor** slow softened from ~45% to a **mild ~20%** ("light, not
  frustrating"). Stats to brief: hp 35, speed 80, dmg 8.
- **Hatcher** now releases **4–6** minis on death (was 3).

Engine: `damageEnemy` gained intangible/arming immunity guards; a shared
`armDetonator()` drives both the contact and lethal-damage paths. Verified: zero
console errors, 60fps at ~135 enemies, all 20 types spawning, every reworked
behaviour observed at runtime.

## v1.3 — 2026-06-08 — Twelve new enemies & a telegraph system

### Telegraph system
- New `G.telegraphs` list + `addTelegraph()` helper. Fading warning shapes are
  drawn in the additive pass ~0.6–1.0s before a hit lands: `line` for aimed
  shots / charges, `zone` for AoE. They pulse and intensify as the hit nears.

### Behaviour refactor
- `updateEnemies()` per-type logic moved into a clean `EBEHAVIOR[type]` registry
  (each entry may define `move(e,c,dt)` and/or `contact(e,c)`; no entry = default
  chase + contact; bosses dispatch by the `e.boss` flag). Existing enemies
  (grunt/rusher/orbiter/splitter/shooter/tank/bomber/mini + OVERLORD bosses)
  behave **identically** — the original orbiter spiral, shooter strafe/fire,
  bomber detonation, and boss barrage/summon were ported verbatim.

### Twelve new enemies (time-gated in `pickEnemyType`)
- **Weaver** (CY) — serpentine rusher. ~0.5 min.
- **Shielder** (BL) — frontal shield soaks ~80% of frontal projectile damage. ~1.5 min.
- **Charger** (OR) — telegraphs a line, then dashes along it. ~1.5 min.
- **Mender** (GR) — hangs back and periodically heals wounded allies. ~2 min.
- **Hatcher** (GR) — periodically releases a brood of minis (and on death). ~2 min.
- **Lancer** (PU) — telegraphs then fires a fast aimed shot. ~2.5 min.
- **Saw** (YE) — fast-spinning, high-contact buzzsaw. ~2.5 min.
- **Phantom** (PU) — blinks near the player and is briefly intangible (phases
  through projectiles, deals no contact damage while phased). ~3 min.
- **Reflector** (CY) — ~30% chance to bounce a shot back as a hostile bolt. ~3 min.
- **Detonator** (RD) — a staggered 3-ring AoE, each ring telegraphed. ~3.5 min.
- **Disruptor** (MA) — emits a field that slows player movement while near. ~3.5 min.
- **Juggernaut** (OR) — slow mini-boss with a telegraphed ground-slam and an
  always-on health bar. ~4 min.

### Engine
- Player movement gains a per-frame `G.playerSlow` multiplier (disruptor fields).
- Projectile collision now respects phantom intangibility, reflector bounces, and
  tags player projectiles (`proj`) so the shielder block can read impact angle.
- All new spawns route through `spawnEnemy` (so `MAX_ENEMIES` is respected); new
  shapes reuse the existing `drawShapeFor` set. Verified: zero console errors,
  steady 60fps at ~150 enemies, all 20 enemy types spawning.

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
