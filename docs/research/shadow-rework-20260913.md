# Shadow rework — root causes, fixes and the plan (2026-09-13)

Owner report: "tree shadow flashing is still happening when the camera moves",
then "bushes have the shadow flashing issue too", then "we have to redo our
shadows, quality and graphics system to be much better and resilient".

This note records what was actually wrong, how it was proven, what changed,
and the plan for the rework. Evidence tooling lives in `.qa-dev/` (never
staged) and is described at the end so the checks can be repeated.

## 1. Root cause A — cascade instance culling never reached the GPU

### Symptom

Whole tree, bush and telephone-pole shadows appear or disappear for one frame
while the camera moves. Sparkle metrics (per-pixel one-frame blips) barely
move under any toggle, because the failure is at the level of entire casters,
not pixels.

### Mechanism

`src/engine/lighting.ts` r7 culled instanced casters per cascade by compacting
each heavy `InstancedMesh`'s instance prefix inside `onBeforeShadow` and
drawing `count = K`. In three r185 the shadow pass is

    WebGLShadowMap.renderObject → objects.update(object) → onBeforeShadow → renderBufferDirect

and `objects.update` is the only place instance buffers upload, gated once per
render call (`info.render.frame`). The compaction therefore wrote the owner's
CPU array after the upload had already happened: every cascade drew the FIRST
K instances in owner order, not the K visible ones. Casters past index K had
no shadow, and K changes with every camera move, so the missing set changed
too — the flashing.

### Proof

Still camera, temporal passes off, same frame rendered with the hook on (A),
off (B) and on again (A2), shadow masks compared (`.qa-dev/cull-still-ab.mjs`):

| pair | differing pixels | of which shadow missing with cull |
| --- | --- | --- |
| A vs A2 (hook on both times) | 0 | – |
| A vs B (hook on vs off), before fix | 3,909 | 3,875 |
| A vs B, after fix | 0 | 0 |

CPU-side count on the same scene: 63 % of cascade-0-visible trunks and 81 %
of visible bushes sat past the drawn prefix. The diff image
(`.qa-dev/out/cull-still-ab/diff.png`) shows whole crown and bush shadows
missing across the village.

### Fix — cascade caster proxies (r8)

Each heavy static owner (≥ 24 000 tris × capacity) gets one shadow-only proxy
per near cascade: a child of the owner on `SHADOW_ONLY_LAYER`, sharing the
owner's vertex and index buffers, with its own instance buffers (instance
matrix, mirrored instance colour, and every instanced geometry attribute such
as the canopy fade). `lighting.update()` compacts every proxy whose cascade
draws this frame to that cascade's frustum BEFORE `renderer.render()`, so the
shadow pass's own `objects.update` uploads exactly the bytes the draw uses.
The owner's buffers are never written; it keeps casting into the last cascade
(that box spans the map, culling there saves nothing), and a proxy draws only
in its own cascade (`count = 0` elsewhere — three skips zero-instance draws).
Proxies ignore picking rays and hold no strong references (WeakRef owner list,
WeakMaps), so discarded worlds and shared library geometry are never pinned.

Perf on the probe scene (still camera, all cascades forced, medians of 60
frames): shadow-pass triangles 2.80 M with the proxies vs 3.84 M with culling
off; the hook's earlier "saving" was of the same size, it just dropped the
wrong instances. 31 owners, 93 proxies on Verdant.

Receipt: `src/engine/shadowGeometryClaims.selftest.mjs` executes the private
block with real three meshes and lights: gate, per-cascade compaction in owner
order, upload ranges, draw hooks (owner / proxy / `noCull`), instance
rewrites, detached worlds, geometry swaps and GC.

## 2. What the flash meter still reports after the fix — and why it is not a fault

With the proxies in place the blob-level flash meter (`--rank=flash`) still
finds one-frame excursions while driving. The largest looked like a pole's
shadow band on the road jumping for exactly one frame and returning. Measured
on the saved full frames (verify1-dev-fixed, frames 92/93/94): the band's
darkest row moves 667 → 694 → 713, monotonically, ~27 px per frame, while the
band is ~30 px wide. Each road pixel is therefore dark for exactly one frame
as the shadow sweeps past — the detector's "changed at t, changed back at
t+1" signature — with nothing jumping back. The other top events are the
telephone-pole crossarms and insulators sweeping past the camera at close
range (geometry parallax). Tank shadow off, props off, TAA off and shadows
off all leave a similar residue, and the deterministic `track` camera
reproduces the same events at the same frames.

Lesson for the meter: at the probe's 25–30 fps, screen-space motion is about
twice what a 60 fps player sees, so thin shadows and thin geometry move
faster than their own width per frame. A stationary-camera or per-frame
shadow-mask analysis is needed to attribute one-frame changes to shadows;
until then treat `flashPx` as a screening number, not a verdict.

The still-camera hook A/B (section 1) remains the decisive shadow check; the
per-pixel sparkle metric is unchanged by the proxy fix (it measures foliage
and grass aliasing, tracked separately).

## 3. Rework plan (owner direction: "much better and resilient")

Principle: verify the rendered result, not the code shape. The culling bug
survived for weeks because its receipts exercised the CPU compaction and the
regex'd wiring, never a rendered shadow.

1. Shadow render-truth gate (`tools/`): headless still-camera invariants on a
   fixed scene — cull on/off identical; every caster class (trunk, bush, pole,
   building, tank, running gear) casts; no caster casts twice; flash meter
   under threshold on the `track` path with TAA on and off.
2. Shadow quality: sharper near cascade (split cascade 0 nearer, 4 K at High
   for cascade 0), contact-hardening PCF widths by blocker distance, and a
   temporally rotated kernel now that TAA is stable; caster LOD stays as is.
3. Foliage anti-aliasing: alpha-to-coverage is inert at High (0 MSAA);
   replace with temporally dithered alpha test under TAA so leaf and grass
   edges stop sparkling. First measurement (2026-09-13 19:35, dev server,
   look-mode pan, pinned 200×120 window over the densest tree shadow; tree
   foliage and bush cards switched from `alphaTest 0.38 + alphaToCoverage` to
   three's `alphaHash`, shadow depth materials unchanged):

   | metric | alphaTest (today) | alphaHash |
   | --- | --- | --- |
   | one-frame blips, whole frame | 0.576 % | 0.392 % |
   | blips inside shadow | 1.155 % | 0.811 % |
   | blips in the open | 0.539 % | 0.355 % |
   | blips in the pinned window | 12,920 | 3,346 |

   Reverted after the measurement; landing it needs the visual A/B (hash noise
   where TAA history is rejected: fast pans, disocclusions, moving tanks), the
   grass carpet/detail materials, the sight-capsule dissolve interplay, and a
   gate.
4. Ambient: sky-derived hemisphere / SH term so shadow interiors read as
   lit-by-sky, with GTAO tuned to that.
5. Quality system: presets defined by measured budgets with a governor that
   adapts pixel ratio, shadow sizes and AO with hysteresis; a headless
   `quality:audit` renders each preset and asserts the invariants above.
6. Resilience: retire prototype monkey-patching where three offers a hook,
   keep one in-game diagnostics overlay (`?diag=1`) for cascade texels,
   scheduled mask, TAA weight and caster counts.

## Deploy 11 (2026-09-13 19:29 PDT) — the fix in production

967523860 → deployment claude-of-tanks-92bnrq8sr, bundle `main-Dn3sjcid.js`,
after gate 14 (pre 315 green on 2c1fe6661) and gate 15 (core 661 / post 45 /
build green on 967523860; the two commits between them touch receipts only).
Commits: 034de9bc9 caster proxies, 546a5f5e5 Frontline trench variant +
destructible AA guns, 417d80eae + 03182e413 render-truth tool and script,
4cf718d21 Bradley flat sponson shelf (+ regen), d40d3f2e9 / 967523860 receipt
declarations, 2c1fe6661 geometry-gate refresh (Bradley source-fidelity misses
are pre-existing: 49.1 / 0 / 81.9 at the pre-batch worktree → 53.4 / 0 / 82.4).

`tools/shadow-render-truth.mjs --url=https://cot.kevinliu.studio/?tier=desktop`:

| | before deploy 11 | after |
| --- | --- | --- |
| cull parity (px differing, hook on vs off) | 3,900 (3,865 missing with cull) | 0 |
| determinism (same state twice) | 0 | 0 |
| caster classes casting | – | trunks, canopies, bushes, props, structures, tank |

The drive-mode flash probe against production ran at 17 fps under machine
load, which doubles per-frame screen motion and inflates the sweep residue
(section 2); it is not comparable with the dev runs and is not a verdict.

## Tooling

- `tools/shadow-render-truth.mjs [--url --map --gate --strict]` — the checked-in
  render-truth check: still camera, temporal passes off; asserts determinism
  (same state twice → 0 px), cull parity (culling on/off → 0 px) and that every
  caster class present casts. First run on the fixed dev build: 57,401 shadow
  px, determinism 0, parity 0, classes trunks/canopies/bushes/props/
  structures/tank all casting, 93 proxies.

- `.qa-dev/cull-still-ab.mjs` — the still-camera hook A/B above.
- `.qa-dev/tree-shadow-flash.mjs --rank=flash` — records consecutive frames,
  reports sustained pops, per-pixel sparkle and blob-level one-frame flashes
  with strips for the largest; modes `drive|turn|look|dolly|track`; toggles
  `--no-cull --force-all --no-taa --shadows-off --no-tank-shadow --no-props
  --no-sight-fade --freeze-shadow-fov`.
- `.qa-dev/csm-trace.mjs` — per-frame cascade pose / matrix / render trace.
- `.qa-dev/shadow-tris.mjs` — shadow-pass triangle cost, cull on vs off.
