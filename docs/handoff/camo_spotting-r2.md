# camo_spotting r2 handoff — changes needed outside owned files

Owner fixed (in owned files): GLB camo supernova root cause (CSM registration
of GLB material clones + KHR clearcoat strip + metallicRoughness-map matte
clamp + composite luma ceiling, all in `src/vehicles/materials.js`), USSR
digital density + urban palette + Tiger stripes scale variation
(`materials.js`), AI uphill/pinned-gun freeze (`src/game/ai.js`).
Verified: `node src/sim/spotting.selftest.mjs` 60/60,
`movement.selftest` 28/28, `combat.selftest` 211, garage pattern cycle
screenshots for m1a2/t34_85/tiger1/leo2a7, AUTO urban+desert battle starts.

The items below need edits to files this specialist does not own.

---

## 1. MAJOR (r6): unspotted enemy tanks are still rendered in the 3D world

`src/main.js` — the spotting gate currently drives only HUD elements
(minimap, nameplates, team panel) via `spotFrame`. `TankVisual.setVisible()`
is never called from the spotting path, so a tank the sim says is concealed
is still drawn and can be manually aimed at.

Suggested patch (in `updateDustAndSync()` in `src/main.js`, which already
iterates every tank each frame — around line 623):

```js
function updateDustAndSync() {
  for (const ent of game.tanks) {
    if (!ent.state) continue;
    ent.visual.syncFromState(ent.state);
    // SPOTTING WIRING: unspotted live enemies do not render (WoT rule).
    // Wrecks stay visible; the player is never gated; outside battle
    // (garage/shot/killcam) everything renders.
    if (game.phase === 'battle' && game.spotting && !ent.isPlayer) {
      const visible = ent.combat.destroyed ||
        game.spotting.isSpotted(ent.id, 'player');
      // eased fade to avoid popping (0 -> 1 in ~0.35 s)
      ent._spotFade = ent._spotFade === undefined ? (visible ? 1 : 0) : ent._spotFade;
      const target = visible ? 1 : 0;
      ent._spotFade += (target - ent._spotFade) * Math.min(1, dtFrame / 0.35);
      ent.visual.setVisible(ent._spotFade > 0.02);
    } else if (game.phase === 'battle') {
      ent.visual.setVisible(true);
    }
    ...
```

Notes:
- `spotting.isSpotted(id, 'player')` already includes the 5 s linger, so no
  extra timer is needed; a simple 0.3–0.5 s opacity or dither fade is only
  cosmetic (setVisible flip at fade end is acceptable if opacity plumbing is
  too invasive — the linger means the flip happens out of contact).
- Keep wrecks always visible (`ent.combat.destroyed` above).
- Killcam calls `vis.setVisible(true)` on restore already
  (src/game/killcam.js:728), and `spawnTanks` resets `setVisible(true)`
  (src/game/state.js) — both paths stay correct with the gate because it
  only runs during `phase === 'battle'` frames.
- AI-side is already correct: enemies acquire the player exclusively through
  `spotting.isSpotted(id, 'enemy')` (state.js aiDeps), no render dependency.

## 2. Permanent selftest for the AI uphill/pinned-gun fix

A verified repro/regression test exists at
`/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/ai_uphill_test.mjs`.
Please add it as `src/sim/ai.aim.selftest.mjs` (ownership prevented creating
new files in src/sim). It asserts three scenarios fire within 30 s:
- `uphill-pinned`: Tiger I nose-up on a 16.7% ramp, target needing +0.05 rad
  world elevation -> gun pins at the −6.5° stop with the settled barrel ON
  target (`atGunLimit=true`). The old `!st.atGunLimit` veto froze this
  forever (r6 verdant repro); it must fire (<2 s after reaction now).
- `uphill-flat-base`: flat shooter, target on an 8 m plateau at 150 m
  (literal r6 geometry).
- `flat-control`: unchanged flat-ground engagement.

## 3. Root-cause hardening (optional but recommended)

- `src/ui/tankThumbs.js:89` passes a stub `setupShadowMaterial: (m) => m`.
  Any code that captures "the" engine context by duck-typing will grab this
  stub (that is exactly how the GLB fleet silently lost CSM registration and
  turned into the r6 winter/desert supernova — unregistered materials are lit
  by EVERY CSM cascade sun at once). materials.js now probes a ctx for
  `defines.USE_CSM` before trusting it, but a cleaner fix is to thread the
  real engineCtx through `modelLoader.applySwap -> applyCamoToModel(root,
  spec, engineCtx)` and to mark the thumbs booth ctx explicitly
  (e.g. `isPortraitBooth: true`).
- `src/vehicles/modelLoader.js` `addOnMaterial()` materials are now CSM
  registered via the applyCamoToModel clone pass, but if modelLoader ever
  stops routing add-on parts through that pass they must call
  `engineCtx.setupShadowMaterial` themselves.

## 4. Status of the two r6 minors that needed no foreign-file change

- AUTO desert battle framing: verified OK now (player tank framed at battle
  start on 'desert', shots in scratchpad diag3/auto_desert_battle.png); the
  r6 out-of-frame capture appears to have been a rig-settle race in the r1
  audit script (screenshot taken <1.5 s after startBattle) plus since-fixed
  desert spawn tuning. No further action needed.
- AUTO urban palette lightened in materials.js (base #7a7d75); verified in
  battle light on the urban spawn grass.
