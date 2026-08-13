# HANDOFF — Claude Fable: rebuild every tank to real-reference quality

**Written 2026-07-30 for the next agent taking over `claude-of-tanks`.**

This is a corrective handoff, not a completion report. The previous procedural
model pass did **not** meet the owner's requested visual standard. Do not accept
the existing “91/91 pass” model-quality headline as proof of likeness: that
audit primarily checks loading, hierarchy, articulation, pivots, dimensions,
and configuration hygiene. The stricter visual comparison currently reports:

- **72 local sourced references**
- **0/72 pass** the required 90/100 overall **and** 90/100 in every view
- **71.53 median** visual-fidelity score
- **51.8 worst** (`chieftain5`)

The evidence is in `docs/procedural-fidelity-report.md` and
`docs/procedural-fidelity-report.json`. The owner is correct to reject the
current art.

## 1. Start from current `main`, every time

The handoff baseline is commit:

```text
665a35b56f6095aa1367324785dfb2684b8dc1ce
Deepen procedural tank geometry and tracks
```

Before making changes:

```bash
cd /Users/kevinliu/claude-of-tanks
git status --short --branch
git switch main
git fetch origin
git pull --ff-only origin main
git rev-parse HEAD
```

If the tree is dirty, inspect and preserve the owner's changes before pulling.
Never develop from a stale stable worktree or an old browser-served bundle.
Create a review branch only **after** it is based on the latest `origin/main`.

### The canonical baseline is already on `main`

Do **not** look for a separate canonical-model branch or assume the old stable
worktree is authoritative. The canonical procedural builders, current tank
registrations, recovered-model baseline, public fallbacks, and fidelity tools
described in this handoff are committed on `main` at the baseline above (or a
newer descendant after pulling).

In `src/vehicles/tankFactory.js`, `CANONICAL_BUILDERS` snapshots the authored
core and modern builders before recovered/profiled overrides are registered;
`buildCanonical(P, id)` is the supported way for a procedural variant to start
from that canonical family model. This mechanism and its current geometry are
on `main`. They are the starting point, **not proof that the shapes are
accurate**: Fable must improve or replace them against the reference packets
and fixed-camera gates below.

## 2. Where the real/local models are

There are three different asset layers. Keep them conceptually separate.

### Raw owner drops

```text
public/models/community-candidates/user-drops-recovered/
```

This contains the original ZIP/GLB/STL/FBX/OBJ inputs. Do not rewrite or delete
these archives. Rebuild processed assets with the scripts below.

### Processed local reference GLBs

The most important new fleet is here:

```text
public/models/tanks/community/recovered/*.glb
```

Additional sourced references are here:

```text
public/models/tanks/*.glb
public/models/tanks/community/*.glb
public/models/tanks/community/variants/*.glb
```

Run this for the authoritative local inventory:

```bash
find public/models/tanks -type f \( -name '*.glb' -o -name '*.gltf' \) | sort
```

High-value examples for the owner's reported failures:

| Family | Local reference/oracle files |
|---|---|
| Abrams | `m1a2_sepv3_dannzjs.glb`, `m1a2_tejas.glb`, `community/variants/m1a1_dannzjs_variant.glb`, `community/variants/m1a2_tusk_dannzjs_variant.glb`, `community/recovered/m1a2_sepv2.glb`, `community/abramsx-mortavex.glb` |
| Leopard 2 | `leo2a6_buh.glb`, `community/leo2a4_bergman.glb`, `community/recovered/leo2_revolution.glb`, `leo2a5.glb`, `leo2a7v.glb`, `leopard2_proto.glb` |
| Merkava | `merkava4_arlassar.glb`, plus `community/recovered/merkava1b.glb` through `merkava4b.glb` |
| Challenger/Warrior | `community/recovered/challenger1.glb`, `community/recovered/fv510.glb` |
| Ariete | historical comparison removed; playable is repository-authored procedural geometry |
| Russian/Japanese | `t80u_javanilga.glb`, `t90m_minehffd.glb`, recovered T-62/T-64/T-72/T-90 variants, and `community/recovered/type90.glb` |

`docs/RECOVERED-FLEET.md` lists the 42 recovered additions and explains their
processing. Asset builders are:

```text
tools/process_tank_asset.py
tools/process_stl_tank.py
tools/build_recovered_fleet.sh
tools/build_bergman_tanks.sh
tools/blend2glb.sh
```

### Licensing constraint

Many recovered GLBs are local-only, NC/ND, or insufficiently documented. They
are **reference oracles**, not geometry to copy. `npm run build` is a public
build and strips restricted model trees. Therefore the procedural fallbacks
must become independently authored and accurate. Do not extract, trace, or
embed source vertices into procedural code. Check `docs/ATTRIBUTION.md` and
the matching records under `docs/licenses/` before using any asset beyond
private visual comparison.

## 3. Where the model code and registrations are

```text
src/vehicles/tankFactory.js          shared rig, WWII builders, running gear/tracks
src/vehicles/modern1.js              modern procedural builders
src/vehicles/modern2.js              modern procedural builders
src/vehicles/modern3.js              modern procedural builders
src/vehicles/profiledProcedurals.js  public fallbacks and donor-family variants
src/vehicles/modelLoader.js          GLB normalization, swap, rig re-parenting
src/vehicles/specs.js                complete roster and MODEL_SOURCE registry
src/vehicles/userdrops*.js           recovered/source registrations
src/vehicles/variants.js             sourced variants
src/vehicles/materials.js            paint, weathering, normal/detail materials
```

Use `MODEL_SOURCE` in `src/vehicles/specs.js` and the `userdrops*.js` modules
to map a tank ID to its selected GLB. `publicVisualFallback`, `visualBase`, and
`variantOf` reveal which procedural model the public build substitutes.

The current `profiledProcedurals.js` donor approach is a major source of wrong
identity. A detailed donor hull plus a few variant deltas is not automatically
the target vehicle. Do not preserve a donor merely because it is convenient.

## 4. Where to get real reference pictures

Build a reference packet for **every tank ID before editing it**. Store links,
measurements, variant notes, and license/provenance in:

```text
docs/references/tanks/<tank-id>.md
```

Do not commit copyrighted image downloads unless their licenses explicitly
permit it. Temporary image boards can live outside `public/`, for example
`/tmp/cot-tank-references/<tank-id>/`. Commit links and observations.

Use sources in this order:

1. **Prime Portal tank walkarounds** — broad, detailed multi-angle exterior
   photo sequences made for modelers. Start at
   [Prime Portal](https://www.primeportal.net/) and search:
   `site:primeportal.net/tanks "<exact variant>" "walk around"`.
   Verified examples include its
   [M1 Abrams index](https://www.primeportal.net/tanks/m1_abrams.htm),
   [Challenger 2 index](https://www.primeportal.net/tanks/challenger2.htm), and
   [Leopard 2 walkaround](https://www.primeportal.net/tanks/de_craecker/leo2_demo_walk.htm).
2. **Wikimedia Commons vehicle categories** — use the exact vehicle category,
   then search separately for front, rear, side, overhead, maintenance, and
   transport views. Commons exposes dedicated
   [front](https://commons.wikimedia.org/wiki/Category:Front_views_of_tanks),
   [side](https://commons.wikimedia.org/wiki/Category:Side_views_of_tanks), and
   [tank photograph](https://commons.wikimedia.org/wiki/Category:Photographs_of_tanks)
   collections. Open each file page and record its original source and license.
3. **Museum collections** — especially for WWII, British, prototype, and rare
   vehicles. Use [The Tank Museum vehicle archive](https://tankmuseum.org/tanks/)
   and its [Archive & Object Collection](https://tankmuseum.org/services/archive-and-object-collection),
   which includes photographs and technical drawings. Also search the relevant
   national armor museum for the exact surviving vehicle.
4. **Official defense/manufacturer imagery** — primary source for exact modern
   variants and equipment packages. Examples:
   [General Dynamics Abrams](https://www.gdls.com/abrams/),
   [Israel MOD Merkava Directorate](https://mod.gov.il/en/departments/merkava-and-armored-vehicles-directorate),
   and [DVIDS imagery search](https://www.dvidshub.net/search?q=abrams+tank&view=grid).
   Use KNDS, Rheinmetall, BAE Systems, Leonardo, national defense ministries,
   and army media libraries for their corresponding vehicles.
5. **Technical manuals and official brochures** — use these for hull length,
   width, height, wheelbase, gun model/length, wheel count, and equipment
   placement. Record whether length includes the gun. Cross-check at least two
   independent sources before changing dimensions.
6. **Local GLBs** — render them from all fixed cameras as a secondary shape
   oracle. They can expose forms hidden in photos, but they may be low-poly,
   mislabeled, wrongly normalized, or the wrong variant. Real photographs and
   published dimensions win any disagreement.

For top views, search specifically for `overhead`, `top view`, `museum
balcony`, `maintenance`, `rail transport`, `air transport`, and technical
drawing views. Never use AI-generated pictures, game screenshots, plastic
model box art, or an unlabeled image-search thumbnail as primary evidence.

### Variant identity is non-negotiable

Do not mix M1A1, M1A2, SEPv2, SEPv3, TUSK, and AbramsX references. Do not mix
Leopard 2A4/A5/A6/A7/Revolution, Merkava marks, T-72/T-90 subvariants, or
Challenger 1/2. Each reference packet must state the exact configuration,
production period, and visible package being modeled.

### Tanks without an admitted local fidelity oracle

The current fidelity report covers 72 of 91 tanks. These 19 need a web photo
packet and/or a carefully vetted local override added to the comparison lab:

```text
bmp2, challenger2, chieftain_mk10, is1, is2, k2, leo1a5, leo2a4,
leo2a7, m2a2_bradley, m4a3e8, panther_g, t14, t30, t34_85, t72b3,
tiger1, type10, type99a
```

Some have local community candidates (for example BMP-2, IS-1, T30, Tiger I,
and T-34-85). Vet them against real photos first; a rejected or stylized GLB
is not automatically a trustworthy oracle.

## 5. Why the tanks are still wrong

Treat **all four major assemblies as unfinished**.

### Hulls

- Many are generic boxes/wedges or donor-family hulls with only dimensions
  changed. Correct compound slopes, cast transitions, glacis breaks, sponsons,
  engine decks, exhausts, rear plates, fenders, and armor modules are absent.
- Side, front, top, and rear profiles were not independently matched.
- Width normalization and centroid alignment in the current silhouette lab can
  hide bad origins or some scale/placement errors; the human shaded review is
  still mandatory.

### Turrets and mantlets

- Many turrets are too short in plan view, too narrow, too low, or lack the
  correct rear bustle. Generic `polyTurret`/box assemblies do not reproduce
  cast cheeks, wedge modules, mantlet cavities, sight housings, ERA, bustle
  racks, or asymmetric roof layouts.
- Details were attached using approximate pivots, so some float when the turret
  turns. Every child must remain seated during full yaw and gun elevation.
- The current automated rig probe proves that a node rotates; it does not prove
  that the rotating shape is the correct turret.

### Guns

- Barrel length, caliber impression, sleeve diameter, taper, bore evacuator,
  muzzle-reference system, mantlet depth, and recoil origin are often generic
  or wrong. A fused/missing source gun can also make a GLB look acceptable at
  rest while failing elevation.
- Gun overhang scores are especially poor in the strict report. Match published
  gun type and physical tube length, not a family default.

### Tracks and running gear

- The recent pass added a generic two-layer shoe and a global winding check.
  That is not per-tank fidelity. Shoe pitch, guide teeth, connectors, track
  width, wheel count/diameter/spacing, return rollers, idler/sprocket location,
  suspension type, and skirt occlusion still need individual matching.
- The owner's screenshots still read as flat or upside-down trapezoids. The
  selftest only proves that the generic mathematical loop winds clockwise and
  that its authored ground base is wider. It cannot prove that every tank's
  local orientation, end-wheel assignment, pads, guide horns, and visual wraps
  look correct in the garage.
- Verify pads face outward, guide horns face inward between road wheels, the
  loaded run sits on the ground, the top return has believable sag, and both
  end wraps meet the sprocket/idler without an inverted profile.

### Surface detail and variant character

Hatches, periscopes, welds, grilles, cables, tow hooks, lights, smoke launchers,
RWS/MGs, antennas, stowage, baskets, ERA/NERA arrays, mud flaps, rear cameras,
and variant-specific sights are missing or generic. A silhouette-only pass is
necessary but not sufficient for community-model quality.

## 6. Mandatory fixed-camera review

The current lab is:

```text
tools/procedural-fidelity.html
tools/procedural-fidelity.mjs
```

It currently renders only `front`, one `side`, `top`, and `rearQuarter` at
384×384. Extend it before claiming completion. The required proof cameras are:

1. exact front
2. front-left quarter
3. exact left side
4. rear-left quarter
5. exact rear
6. rear-right quarter
7. exact right side
8. front-right quarter
9. exact top

Also generate a 24-frame turntable at 15° yaw increments for continuity and
floating-part review. Use an orthographic camera for proportion scoring and a
locked mild-perspective camera for the shaded beauty review.

For every camera:

- identical pose, orientation, camera scale/FOV, and neutral gun position
- same width/dimension normalization for source and procedural versions
- source mask, procedural mask, red/cyan overlay, and shaded side-by-side
- no camouflage or lighting difference that obscures geometry
- minimum 1600 px output for the shaded/detail board
- a second articulation board with turret at `-90°, 0°, +90°, 180°` and gun at
  minimum, level, and maximum elevation

Use this local page during iteration:

```text
http://127.0.0.1:<vite-port>/tools/procedural-fidelity.html?id=<tank-id>
```

Run a focused report and capture evidence with:

```bash
node tools/procedural-fidelity.mjs --ids=<tank-id> --shots=1
node tools/procedural-fidelity.mjs --ids=<tank-id> --check
VITE_PUBLIC_BUILD=1 node tools/model-rig-probe.mjs <tank-id>
```

Do not review with an arbitrary mouse-orbit camera. Reset to the same camera
presets after every edit so before/after comparisons remain valid.

## 7. The only acceptable scoring gate

Create a review row for each tank with independent 0–10 scores for:

- front profile
- both side profiles
- rear profile
- top profile
- four quarter profiles
- hull geometry/details
- turret/mantlet geometry/details
- gun geometry and attachment
- tracks/running gear
- exact variant identity and surface equipment
- articulation/cohesion

**A tank passes only when every view score and every component score is at
least 9.0/10.** The overall score must also be at least 9.0. An excellent hull
must not average away a 6/10 turret or inverted tracks.

Automated gates:

- procedural-fidelity total ≥90/100
- minimum fixed-view silhouette score ≥90/100
- dimensions within 3% of corroborated values where published
- wheel count and vehicle-specific running-gear layout exact
- no floating/detached part through the full articulation board
- no browser errors or GLB swap errors

Human gate:

- compare against the complete real-photo packet, not only a local GLB
- write concrete mismatch notes before scoring
- keep the lower score when uncertain
- retain the before/after camera board in review evidence

`tools/model-quality-audit.mjs` is still useful for structural hygiene, but its
8.5 score is **not a visual score** and cannot approve a tank.

## 8. Work order and iteration discipline

1. Upgrade the camera/fidelity harness and reference-packet template first.
2. Work from the bottom of `docs/procedural-fidelity-report.md` upward so the
   worst models cannot be hidden by showcase vehicles.
3. Prioritize the owner's named failures within that order: Ariete, Abrams
   family (especially SEPv2/TUSK), Merkava family, Challenger family, Leopard
   2 Revolution, FV510, and all visibly reversed models.
4. Complete all 72 tanks with local references.
5. Build and score reference packets for the remaining 19 tanks.
6. Run the full 91-tank camera/articulation sweep. Do not sample only five.

Finish one tank or one tightly related family at a time. If a shared base
builder changes, rerun every dependent tank; generic family edits caused much
of the current regression. Keep commits small and include the tank IDs plus
their camera-board/report evidence.

Do not proceed to the next tank merely because the code compiles. Proceed only
after the current tank clears every 9/10 gate.

## 9. Regression gates before each commit

```bash
npm test
npm run model:audit
npm run model:rig
node tools/procedural-fidelity.mjs --check
npm run shots
npm run build
git diff --check
```

After model changes, regenerate the relevant garage icons with `npm run icons`
and inspect them for rectangles, backward orientation, cropping, and incorrect
turret/gun pose.

Performance remains a requirement. Preserve instancing and merged geometry,
but never use “performance” to justify the wrong silhouette. Measure with
`node tools/perfprobe.mjs` at device scale factors 1 and 2; the battle target is
at least 45 fps p5.

## 10. Definition of done

This takeover is done only when:

- all 91 tanks have a real-reference packet
- all 91 have the nine fixed views and articulation board
- all views and all components score ≥9.0/10
- the strict report passes every tank, not 0/72
- hulls, turrets, guns, and running gear match exact variants
- no tank is backward, floating, rectangular-placeholder-like, or using a
  visibly wrong donor family
- public builds use the accurate procedural versions when local GLBs are
  stripped
- full tests, screenshots, rig checks, builds, and performance budgets pass

Until then, report the remaining failures plainly. Do not rename structural
success as visual completion.
