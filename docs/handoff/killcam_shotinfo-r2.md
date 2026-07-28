# Handoff — killcam_shotinfo r2 (owner may not touch these files)

Owner fixed everything possible inside `src/game/killcam.js` + `src/ui/shotInfo.js`.
Two sim-side changes are REQUIRED to complete the critical/major fixes, one
main.js tweak is optional polish. Exact patches below.

---

## 1. REQUIRED (completes the CRITICAL fix) — export the rolled module damage
`src/sim/damage.js`, in `rollModuleDamage` (~line 279). The killcam previously
fabricated `−caliberMm` for module labels; it now renders `modulesHit[i].dmg`
(the value the sim actually applied) and **omits the number entirely** when the
field is absent. Add the rolled value to the event payload:

```js
// before
  m.hp = Math.max(0, m.hp - moduleDmg);
  const newState = refreshModuleState(m);
  ctx.modulesHit.push({ module: moduleName, newState });

// after
  m.hp = Math.max(0, m.hp - moduleDmg);
  const newState = refreshModuleState(m);
  ctx.modulesHit.push({ module: moduleName, newState, dmg: Math.round(moduleDmg) });
```

Additive only: nothing reads extra keys on these entries (verified: state.js
`module:state` emit, shotInfo chips/toasts, damagePanel, killcam all destructure
by name). Deterministic-RNG order unchanged.

## 2. REQUIRED (MAJOR fix) — displayed shot distance over-reads by up to v/60
`stepShell` (src/sim/ballistics.js:72-73) accumulates the FULL integration step
into `shell.distM` before the prevPos→pos sweep resolves the hit, so
`flightDistM` includes the unused remainder of the final step — up to 27.8 m
for 1670 m/s APFSDS (measured live: card 334 m for a 331.2 m shot; 111.3 m for
103.6 m). Correct the arc length to the impact point in `src/sim/damage.js`
(covers the shot card, shot log, killcam annotation AND `penAtDistanceMm`
falloff, since `ensurePenRoll` runs after the correction):

In `resolveShellHit`, right after `const behavior = behaviorOf(spec.type);`
and BEFORE `ensurePenRoll(shell, rng);`:

```js
  // Arc-length correction: stepShell accumulated the FULL step before this
  // sweep resolved — trim the unused remainder past the first intersection
  // (up to velocity/60 ≈ 28 m for APFSDS). prevPos-based so synthetic shells
  // that never stepped (prevPos === pos, e.g. the staged killcam_xray shot)
  // are untouched. Restored on the screen-pierce exits where the shell truly
  // keeps flying from shell.pos.
  const overshootM = hits.length > 0
    ? Math.max(0, shell.prevPos.distanceTo(shell.pos) - shell.prevPos.distanceTo(hits[0].point))
    : 0;
  if (overshootM > 0) shell.distM = Math.max(0, shell.distM - overshootM);
```

Then restore the remainder on the two paths where the shell continues past the
tank from its un-teleported end-of-step position:

a) wreck branch — replace
```js
  if (combat.destroyed) return resolveWreckHit(shell, hits);
```
with
```js
  if (combat.destroyed) {
    const wev = resolveWreckHit(shell, hits);
    if (!shell.dead && wev.kind === 'screen_pierce') shell.distM += overshootM;
    return wev;
  }
```

b) live screen-pierce — inside the `!decided && !hullPen && !shell.dead` block,
before `return event; // shell stays alive on its unchanged trajectory`:
```js
      shell.distM += overshootM; // shell keeps flying from shell.pos
```

And in `resolveHeBurst`, right after `const spec = shell.spec;` and BEFORE
`ensurePenRoll(shell, rng);` (HE shells always die at the burst — no restore):
```js
  shell.distM = Math.max(
    0,
    shell.distM - Math.max(0, shell.prevPos.distanceTo(shell.pos) - shell.prevPos.distanceTo(burstPoint)),
  );
```

Ricochet needs no restore: `deflectShell` re-bases `shell.pos` at the hit
point, so the trimmed distM is exactly the arc flown. Carry-through keeps the
pre-existing convention (internal traversal never accumulated distM).

## 3. OPTIONAL polish — end overlay vs the new full-screen battle report
`src/ui/shotInfo.js` now renders the battle report as a full-screen results
state with its own VICTORY/DEFEAT banner (z-index 71, pointer-events:none, and
it reserves the bottom 15vh). main.js's endOverlay (z 70) duplicates the
banner in dead center. In `showEndOverlay(result)` (src/main.js ~line 354),
anchor the button to the reserved bottom band and drop the duplicate title +
double-dim:

```js
function showEndOverlay(result) {
  endTitle.textContent = result === 'victory' ? 'VICTORY' : result === 'draw' ? 'DRAW' : 'DEFEAT';
  endTitle.style.color = result === 'victory' ? '#7ee87e' : result === 'draw' ? '#cfd9e2' : '#f05a5a';
  endTitle.style.display = 'none';               // report banner owns the verdict
  endOverlay.style.background = 'none';          // report backdrop owns the dim
  endOverlay.style.justifyContent = 'flex-end';  // button in the reserved band
  endOverlay.style.paddingBottom = '5vh';
  endOverlay.style.display = 'flex';
}
```
(If this is skipped nothing breaks — the center banner just doubles up.)

## Note (no action) — killcam ↔ fx coupling
killcam.js now suppresses live battle FX during a replay by looking up the
THREE group literally named `'fx'` (`scene.getObjectByName('fx')` — set in
src/fx/effects.js:248) and toggling `.visible`, restoring it in `finish()`.
If that group is ever renamed, update `begin()` in killcam.js.
