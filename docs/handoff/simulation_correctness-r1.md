# simulation_correctness — round 1 handoff

Changes required OUTSIDE `src/sim/` (owner may only touch `src/sim/`). The sim
side is already implemented and covered by `src/sim/combat.selftest.mjs`
(193 assertions, passing). Items 1–2 are code edits; 3 is optional; 4–5 are
doc reconciliations.

## 1. src/game/state.js — keep wrecks in the shell broadphase (MAJOR)

In `stepShells()` (~line 346), destroyed tanks are skipped, so shells and
tracers fly straight through wrecks.

```js
// OLD
if (!ent.state || !ent.combat || ent.combat.destroyed) continue;
// NEW
if (!ent.state || !ent.combat) continue;
```

That is the whole fix: `resolveShellHit` (src/sim/damage.js) now detects
`combat.destroyed` and resolves the wreck as an inert collider — plates
ricochet/absorb the shell with zero damage, zero module/crew/fire rolls and
zero extra RNG draws; `resolveHeBurst` detonates HE on the wreck surface
(zero-damage `he_splash` event) and splashes only live tanks. Wreck events
carry `targetId: null`, which existing consumers already handle:
`emitHitOutcome` guards on `targetId`, fx/audio key off `ev.kind`
(`nonpen`/`ricochet`/`spaced_absorb`/`he_splash`), the HUD and AI ignore
events whose `targetId` doesn't match a live tank.

New event kind `screen_pierce` (kinetic shell crosses only skirt/track
screens or the barrel and keeps flying) is emitted with the shell left
alive; fx `impact()` default case and audio default case handle it safely
(small spark, no misleading nonpen clang). No consumer changes required.

## 2. src/game/state.js — route HESH like HE in stepShells()

HESH is now fully implemented in the sim (SHELL_BEHAVIOR entry, 1.25 spall
bonus, never ricochets). `stepShells()` gates burst resolution on
`shell.spec.type === 'HE'` in two places (~line 363 tank hit, ~line 372
terrain hit). Both should treat HESH the same:

```js
const isBlast = shell.spec.type === 'HE' || shell.spec.type === 'HESH';
```

Without this a future HESH round would resolve as a direct-hit-only shell
and would not detonate on terrain. (No roster shell fires HESH today, so
this is forward-proofing, not a live bug.)

## 3. src/vehicles/specs.js — optional explicit `external` flag (OPTIONAL)

`armor.js` now honors a per-module-box `external: true|false` flag
(damageable without hull penetration / full odds in HE blast sweeps) and
defaults `optics` boxes to external per armor doc §12 ("tracks, gun,
viewports are external"), so no specs change is needed for current
behavior. If a model ever needs an override, extend the helper:

```js
const mbox = (module, min, max, turretLocal = false, external) =>
  ({ module, min, max, turretLocal, ...(external !== undefined && { external }) });
```

## 4. docs/research/shells-ballistics.md — APFSDS ricochet angle is 78°

Conflict: shells doc §3 item 2 and the §11 SHELL_TYPES table say APFSDS
bounces at >70°, while armor-penetration.md §1/§11.3 (and the code, and the
selftest) use 78°. Code authority is **78°**. Please update:

- §3 item 2: "AP/APCR/APFSDS auto-bounce at `alpha > 70°`" →
  "AP/APCR auto-bounce at `alpha > 70°`; APFSDS at `alpha > 78°`
  (long rods are slope-resistant, see armor-penetration.md §11.3)".
- §11 SHELL_TYPES `APFSDS: { ... ricochetDeg: 70 ... }` → `ricochetDeg: 78`.

## 5. docs/research/shells-ballistics.md — annotate WW2 HE penetration

Conflict: shells doc §5 gives the "~0.5× caliber" HE pen rule of thumb
(122 mm HE ≈ 61 mm), but the shipped WW2 roster (src/vehicles/specs.js, from
tank-roster.md real-world data) uses historical HE pen values of 9–15 mm,
making WW2 HE a pure-splash round. This is an intentional design choice
(kept: real-world roster values are the authority for roster shells; the
0.5× rule applies to generated/hypothetical guns). Please add to §5 under
the HE bullet:

> NOTE (reconciled r1): shipped WW2 roster HE shells intentionally use
> real-world penetration (9–15 mm) from tank-roster.md — WW2-bracket HE is
> a pure-splash/module-shredder round and full HE penetrations are not
> expected there. The 0.5×caliber rule of thumb applies only when generating
> specs without historical data (and to the selftest's synthetic OF-471
> fixture, which pins the formula path itself).
