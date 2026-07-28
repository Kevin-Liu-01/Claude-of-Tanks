# performance_budget r2 handoff — warm-path micro-allocation fixes

Applied this round IN MY OWN FILES (context for the verifier, no action needed):
`src/engine/post.js` now feeds GTAO the composer's scene depth
(`gtao.setGBuffer(sceneDepth)`) plus a 260→420 m view-distance AO fade patched
into the GTAO fragment shader (replaces the aoExclude visibility wrapper; the
fade also kills the ridge-slash artifact on the new horizon ring that
aoExclude used to dodge). This deletes the GTAO G-buffer prepass — a full
scene re-raster PLUS a duplicate render of the two per-frame CSM cascades that
its internal `renderer.render(scene)` triggered. Measured in battle at 1080p
(dsf 1 AND 2): draw calls 858 median / 980 max → 526/646, triangles 7.15 M
median → 4.52 M per frame. `userData.aoExclude` flags in world modules are now
inert metadata — safe to delete opportunistically.

The items below are measured-nil-impact (heap is flat) but they are the last
known per-frame allocations in warm paths. Each is a small mechanical change
in a file I don't own.

## 1. src/ui/hud.js — minimap `worldToMap` allocates [px,py] per blip (20 Hz)

`worldToMap(x, z)` (~line 1252) returns a fresh 2-element array; it is called
per tank blip / ping / trace vertex on every 20 Hz minimap repaint (~9 call
sites, lines ~1320-1505).

Fix: module-scope scratch, write-through:

```js
const _wm = [0, 0];
function worldToMap(x, z) {
  const half = mapWorldSize / 2;
  _wm[0] = ((x + half) / mapWorldSize) * MM;
  _wm[1] = ((half - z) / mapWorldSize) * MM;
  return _wm;
}
```

Callers keep destructuring syntactically (`const [px, py] = worldToMap(...)`)
— destructuring still allocates nothing — BUT any call site that holds the
result across a second `worldToMap` call must copy px/py into locals first
(the polyline loop at ~line 1364 already reads element-by-element per
iteration; verify it doesn't keep two live results).

## 2. src/sim/spotting.js — `checkTarget`/`canSpot` allocate per staggered check

- `checkTarget` (~line 280): `const seenBy = { player: false, enemy: false };`
  → hoist to module scope and reset both fields at function entry:

```js
const _seenBy = { player: false, enemy: false };
// in checkTarget:
_seenBy.player = false; _seenBy.enemy = false;
```

- `canSpot` (~line 266): the `combineCamo({ base, paint, bloom, bush })`
  argument object literal → hoist like the existing `_conc` pattern already
  used by `getConcealment` (~line 391):

```js
const _camoArgs = { base: 0, paint: 0, bloom: 0, bush: 0 };
// in canSpot:
_camoArgs.base = baseCamoOf(target.spec, moving);
_camoArgs.paint = getCamoBonus(target);
_camoArgs.bloom = bloom;
_camoArgs.bush = bush;
const camo = combineCamo(_camoArgs);
```

`combineCamo(p)` only reads fields synchronously — safe to share one object.

## 3. src/fx/effects.js — `update` allocates a `due` array while timers pend

~line 1320:

```js
const due = [];
for (const tm of timers) { tm.t -= dt; if (tm.t <= 0) due.push(tm); }
```

→ module-scope `const _due = [];` next to the other `_xxx` scratch objects;
in update use `_due.length = 0;` then push. IMPORTANT: clear `_due.length = 0`
again AFTER the `for (const tm of _due) tm.fn();` loop too — timer callbacks
(`visual.setDestroyed`) can re-enter fx spawn paths and must never see stale
entries retained (they also keep dead closures alive until the next pend
otherwise).

## Verification

After applying: `node tools/perfprobe.mjs` must stay green (the report now
includes a `budget` block with pass/fail per line) and
`node tools/screenshot.mjs` must exit 0 with zero console errors.

## 4. Triangle creep guard tripped during the round (shadow-proxy LODs)

The probe now tracks triangles-median across all passes (hard gate 7 M,
ratchet target 6 M). It measured 4.52 M right after the GTAO rework, 5.55 M an
hour later, 6.36 M by round close — the canopy/foliage work and community-tank
integration landed ~1.8 M tris of growth in one evening. Frame rate still has
big headroom (116 fps median at 1080p), but the growth is all re-rendered 3x
by the CSM cascades. Owners of tankFactory/props/vegetation: give the cascade
passes lower-poly shadow proxies for tank running gear (wheels/links are the
densest repeated meshes) and baked props — e.g. a `shadowProxy` mesh swapped
via `material.customDepthMaterial`-style or a second castShadow-only LOD —
then ratchet `trianglesMedianMax` in tools/perfprobe.mjs from 7 M to 6 M.
