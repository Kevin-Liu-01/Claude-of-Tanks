# Type 59 — reference packet (NEW BUILD, §5.45 no-builder queue → russia lane 2026-08-08)

Exact vehicle: **Type 59 (WZ-120)** — the licensed T-54A: T-54A silhouette
with the hemispherical dome turret, 100 mm Type 59 gun (D-10T2S line) with
the bore evacuator at the muzzle-third, 5 spoked roadwheels with the T-54
gap pattern (big 1st-2nd gap), flat glacis with splash board, and the
Chinese tells the print carries (Type 69 IR/headlight cluster ON the glacis,
fender lines). §5.45 donor ruling: t54-class (the print is the author's
**Type 69** — same WZ-120 hull family, packet-documented). Grammar donor:
buildT54/buildT62MV1 lineage (loftHull + meshDome + ru* kit); **the print
governs proportions**.

## Published dimensions (2+ sources, scout packet docs/references/tanks/scout-gen2-type59.md)

| dimension | value | sources |
|---|---|---|
| overall (gun fwd) | **9.00 m** | tank-afv.com/coldwar/China/Type-59.php; militaryfactory.com armor_id=52 |
| hull length | **6.04 m** | both scout sources |
| width | **3.27 m** | both scout sources (print measures 3.269 width-true) |
| height | **2.59 m** | both scout sources; §5.73 P95-envelope datum = the cupola crown band (print's own 2.55-2.63) |

Dims verification verdict (m48 two-source precedent): all four rows
two-source published and print-corroborated (print body 6.055 = +0.25%,
overall 8.798 = −2.2% short-tube, width 3.269 = 0%, body-top 2.546 = −1.7%).
**NO spec corrections needed.** The print being a Type 69 is measurement-
consistent: its body length lands ON the Type 59 row.

## Print oracle
`/models/tanks/community/type69_lasttriarius.glb` (LastTriarius "Type 69
2.0", thing:6192142, **CC BY 4.0** — ATTRIBUTION.md; shipped in every
build). Registered in MODEL_SOURCE (userdrops7.js) as `type59` until this
round's flip; at the flip the id renders buildType59 everywhere, the print
retires to candidateGlb (kv2/t30 pattern → Sources print card automatic)
and measurement registration moves to the three override maps (§10-pattern
mirror, helper-expanded `glb()` config verbatim).

Fused shell: HullMesh + Turret>TurretMesh, gun baked into the turret node.
Extract: docs/references/vertex/type59.json (2026-08-03, gate-parity
raster; glbToGate ×0.092329 uniform, identity axes, offset z −1.326).
**Frame landmark-verified: +z = front — glacisSign +1, gunSign +1,
turretSeatSign +1, agree:true.** AFT-SHIFTED frame: body (12%-band)
z −4.266..+1.789 (6.055 m), hull mask −4.399..+1.744, width 3.269, body
top p95 2.546 (max 2.628 cupola), overall 8.798 (tube ends +4.42).
turretPivot (0.002, 0.557, −0.712).

## Vertex-measured build lines (extract decode, authored DIRECTLY in the
## aft-shifted extract frame — built to the ref body ends, +0.25% of pub)

HULL:
- Stern: full-width upper box −4.09..−4.26 (y 0.72..1.30) = the hullLengthM
  rear anchor; THIN center gearbox tail to −4.398 (band 0.20 stays under the
  12% body filter — the print's own class) = the overallLengthM rear datum.
- Rising engine deck 1.32→1.468 over −3.92..−2.85; stowed OPVT snorkel ridge
  1.62 @ −3.80..−3.89 (w ±0.75, ref front-view 1.625 band); mid deck 1.364
  (1.33-1.38 jitter); splash board 1.428 @ +0.04; glacis knee (0.63, 1.35) →
  center toe (**1.56**, 1.00) — the +1.74-1.79 front line is carried by the
  FENDER/FLAP row (|x| 0.92..1.63, plan front 1.753), never the hull loft
  (r2 lesson: a 1.77 center toe read +0.22 on every plan center column).
- Type 69 IR/headlight pods ON the glacis (tops 1.439 over 0.84..1.09 — the
  Chinese identity tell): big IR drum right + white-light pair left.
- Fenders ±1.635 = the widthM carrier (full shelf at the 1.13-1.145 line,
  segmented); raised side-wall course 1.39 at x 1.49..1.54 (SOLID walls on
  the shelf, §B2); bins INBOARD of x 1.48 (ref tops 1.449-1.47); fender
  stay-brackets hang to 0.58 at the rail (ref front-view band).
- Belly plate 0.42 (front-view center bot 0.425, §B2 channel law).
- Gear: ground run −2.90..+0.55; 5 × r 0.405 spoked wheels at the T-54 GAP
  pattern z [0.52, −0.42, −1.26, −2.10, −2.94] (gaps 0.94/0.84³); track band
  x 1.045..1.425 (ref ground cols ±1.05..1.43 — the print under-scales its
  track width; mask governs); rear-drive sprocket (−3.78, 0.68, r 0.24),
  idler (1.24, 0.58, r 0.22) — the print FADES both end wraps (t62mv1
  print-fade class: real gear kept per §B6, residual certified).
- Muzzle +4.602 pinned to 9.00 overall from the −4.398 tail tip (m48
  rear-datum law; print tube ends +4.42: ~3 cols ONLY-PROC, dims sovereign).

TURRET (WIDE squat turtle — THIS PRINT's casting is 2.9 m wide; ring/pivot
z −0.71, turretG y 1.30):
- Plan ellipse −2.45..+0.61 (verified at x 1.008 → z +0.18..−2.02 vs ref
  +0.30..−2.08); skirt flare max ±1.475 @ y 1.52 (the ±1.47 plan column);
  hem 1.284 overhanging the deck; wall shelf 1.955 flat over x 1.0..1.27
  (ref front_turret); shoulder 2.18 @ ±0.75; apex 2.34.
- Cast nose BROW over the mantlet (ref side band 2.10-2.17 to +0.75): nose
  lathe with the bottom ring buried under the dome skin / into the gun
  collar (§B2 no open rim).
- Cupola LEFT crown 2.615 (ref 2.62-2.63 band @ −1.05..−0.75) = the heightM
  2.59 p95 carrier (§5.73 law; r2 receipt: a 2.535 crown read p95 2.53);
  loader dome RIGHT 2.46; mushroom VENTILATOR dome forward-center + twin
  periscope heads (the ref's 2.46-2.53 roof band over −0.15..+0.30).
- Curved rear stowage rack −1.90..−2.44 (y 1.40..1.80, chamfered plan
  corners following the dome tail).
- Turret-node APRON bottoming 0.545 over −1.42..+0.02 (fender bins baked
  into the print's turret node): hidden turretDark carriers, plan-tapered
  like the ref (±1.44 aft of −0.63 → ±1.26 → ±1.13 forward), §C mid-seam
  splits (r2 lesson: a full-width slab poked the ±1.37 plan column +0.10).
- Leaning whip antenna, turret LEFT flank (the ref's front-view 2.5-class
  tops across x −0.94..−1.34; strongly swept, spike-budget legal).
- Type 54 12.7 mm AA MG at the loader ring (MG law; kept under the 2.59
  court — r1 receipt: a y 1.16 seat read heightM 2.80/+8%).
- Gun: 100 mm — axis 1.589 (ref band 1.471..1.706, r 0.118), pivot world
  +0.15, collar + boot, **BORE EVACUATOR r 0.157 @ +3.55..+4.10** (the
  muzzle-third, the identity tell), muzzleBore §B3.1.

## Round log (measure → loft → close → prove)

HONEST BASELINE ×1 (pre-build, t62mv1 variantOf fallback vs the print):
min 0 — hull 14.8 / whole 0 / turret 0 / stations 25 / dims 0 / floaters 100.

r1 (first buildType59): min 6.1 — hull 58 / whole 6.1 / turret 46 / stations
67.1 / dims 38.6 / floaters 100. Receipts: the front_whole killer was the
UNBUILT wide flare/apron band (ref turret content to ±1.47 with the 1.80
shelf at x 1.28..1.45 — the r2 wide-turtle re-loft); heightM 2.80 (MG seat);
overall 9.15 (muzzle datum must pin from the −4.398 tail tip, not the body).

r2: min 0 — hull 60.8 / whole 46.6 / turret 51 / stations 74.8 / dims 88.6 /
**floaters 0** (the widened far-side front flap separated in 4/5 poses —
only a 0.02 shelf-corner touch; §B2 struts land in r3). heightM 2.53 (cupola
crown mis-seated 2.535).

r3: cupola crown 2.615 + vent dome/periscopes + flare 1.475 + apron taper +
flap struts + gear tuck (idler z 1.24, sprocket raised y 0.68) + track band
1.045..1.425. (Scores in the close table below.)

## §5.304 REDESIGN round — Type 59 on the widened obr-1975 base (2026-08-17, lane G)

OWNER ORDER (verbatim): **"update our t62 obr 1975 10% wider and then
redeisgn our type 59 to be based off of that"**.

WHAT LANDED (item 2 of 2):
- The §5.45 type69-print build RETIRED from profiles/russia.js (git history
  keeps it; pointer comment at the old seat). The playable now renders
  **profiles/china.js buildType59** — a ground-up derivation:
  `buildT62Obr1975Chassis(P, { gear: { wheelZs: [2.235, 1.08, 0.10,
  -0.92, -1.933] } })` (the WIDENED T-62 base verbatim; only the wheel
  PATTERN re-gauged to the licensed-T-54A big 1st–2nd gap — span, idler,
  sprocket, both contact tangents byte-held so the §B6 ramps hold).
- CHINESE IDENTITY DRESSING (distinguishes the id from its t62mv1 sibling):
  WZ-120 (T-54A-family) mushroom dome — meshDomeCurved rings ×1.10 of the
  certified §5.45 profile (max halfW 1.6225, apex local 1.04 → world 2.52)
  with sz 1.03→0.9364 (plan chord byte-held), flank shoulder shelves flush
  to the skin, cast nose BROW over the gun, race collar on the widened
  ring; cupola LEFT with the lid crown carrying heightM (world 2.5904 ≈
  2.59, compact p95 head), loader dome RIGHT, forward ventilator mushroom
  held at the apex line (p95 window law); curved rear stowage rack
  (FITTINGS.stowageRack) strapped into the dome tail (turret-owned, §B5
  yaw-proven); Type 54 12.7 mm DShK-class census MG at the loader ring —
  barrel FORWARD (CROWS law), planted ring mount, cluster under the cupola
  crown; paired 4-tube smoke banks with skin-bridging pads; nose-left whip;
  Type 59-II searchlight assembly RIGHT of the gun (mirrors the T-62's
  left Luna — the family-distinct read) + small gun-slaved IR; 100 mm
  licensed-D-10T tube — the certified §5.45 measured grammar verbatim
  (bore evacuator at the muzzle-third, §B3.1 muzzleBore r 0.115, muzzle
  gun-local +4.292 → world +5.99); Chinese hull dressing on the chassis:
  glacis IR drum pod (Type 69 tell), muffler on the LEFT rear fender,
  stowed OPVT snorkel ridge, PLA-green china-palette hooks in the spec
  visual (base #374836 / weather #49573f / patches / camoScale 0.52,
  ztz85_iii grammar with distinct values), number 406 decals re-seated on
  the new dome flank (ringSkin dx).
- FLIP MECHANICS (order item "retire MODEL_SOURCE.type59"): the flip
  ALREADY LANDED at §5.45 (2026-08-08) — MODEL_SOURCE.type59 has been
  `source: 'procedural'` + candidateGlb since then (userdrops7.js:253);
  §5.304 keeps those mechanics unchanged (comment updated). The
  LastTriarius Type 69 CC-BY print stays on disk as the registered
  measurement oracle (restored untracked-gitignored from 952561ea^ this
  round per §5.251 — it was a dead print, md5 10cc2b0b…; all three
  override maps still carry the registration).
- SPEC (userdrops7.js): stats KEPT (hp 1580 / 520 hp / 36 t / 50 km/h /
  100 mm reloadS 8.8 / number 406). Dims RE-DERIVED from the widened base
  (owner decree): hullLengthM 6.63 + widthM 3.63 (the base rows),
  heightM 2.59 (authored cupola crown — happens to equal the real Type
  59's published height), overallLengthM 9.52 (authored 100 mm gun-forward
  total). silhouette* rows are type59's OWN gate-measured envelope
  (7.13 / 9.52 / 2.60 from run receipts). Old row 6.04/9.00/3.27/2.59
  retired with the print-frame build.
- SPEC BUG FIXED IN PASSING (the §5.259 leak class, userdrops7 edition):
  type59's donor spread inherited t62mv1's silhouette* print rows
  (7.06/9.96/2.74) — the live-tree BEFORE gate read **dims 0** because of
  it (stored 58.7 row was stale). The explicit type59 silhouette rows now
  override the leak. NOTE for orchestrator: **t54 still carries the same
  leak** (same make() donor spread from t62mv1, no silhouette override —
  phantom 7.06/9.96/2.74 rows will zero its dims on any future re-gate);
  ztz85_iii is safe (china.js variant() strips silhouette keys, §5.259).

GATE (final bytes, registered type69 print, ×2 bit-identical — md5
5d174e63 both runs): **min 0 | hull 32.5 / whole 18.8 / turret 0 /
stations 42 / dims 100 / floaters 100** (before, this tree: min 0 with
dims 0 — leak; stored stale row was 58.7). CLASSIFICATION: NOT FALSE-0 —
the print is registered and measures; the curve rows are
**owner-decreed-divergence-capped**: the redesign abandons the print's
concept (3.27-wide licensed-T-54A hull) for the widened obr-1975 base by
order, and the gate's uniform width-anchored safeScale inflates the print
to 3.63 wide → +11% into every reference axis (ref body len 6.68 vs proc
7.13 in the run receipts). dims 100 / floaters 100 are the meaningful
components (ztz85_iii WEAK-instrument precedent); never chase the curve
rows back toward the print.

§B BATTERY (final bytes): track-clip --exact --strict **0/0 ALL columns**
(inherited the chassis §B4 pocket-shim fix — see the t62mv1 §5.304
section); turret-parent **0/0/0**; §B5 yaw-90 rotating-furniture pair in
pixels (rack/brow/MG/smoke/whip rotate as one; hull furniture fixed —
shots/t62-widen/after-type59-yaw90/); §B2 verified front/top/rear/heroes;
§B9 gear fully exposed (no skirts); §B3 census MG present; §B3.1 mantlet
+ boot + muzzle bore. npm test GREEN (full suite — vehicleMarkings
physical seats + yaw ownership pass on the new dome).

HASHES: before ea1ff837 (45/63593, §5.45 print-frame build) → final
**a62bf43c** (53/78371). AABB receipt: [3.29, 2.6409, 8.838] →
[3.63, 2.8443, 9.517]. Guards byte-exact through the round: ztz85_iii
13f0c8d7 (first-party §5.259 — untouched), ztz99a2 93c78198, type99a
7f613788, t54 cedb8be8, t44 72af6298, t64bv1 eabf99cc. Armor-frame note:
ztz85_iii deep-copies type59's armor frame ×1.14 (banked §5.259 debt) —
its HIT frame follows type59's dims refit; its geometry/gate rows are
untouched (hash-proven).

§5.254 PAIRS: shots/t62-widen/before-type59/ (pre-order tree, print-frame
build) vs shots/t62-widen/after-type59/ + after-type59-yaw90/ — 15 views
each + dims.json receipts, captured at their respective trees.

## §5.327 — owner order: "big bulbouys thing" on the turret (mantlet?) + machine guns (2026-08-17)

ORDER (verbatim): "theres a big bulbouys thing on type 59s turret, ius
that the manglet? make it better and also add machine guns" (+garage
screenshot, front-left view, bulb on the turret front-left cheek left of
the '406').

BULB ATTRIBUTION (pixels first, then instrument — the order's Q answered:
NO, it was NOT the mantlet):
- Reproduced at the TRUE garage pose (garageCameraPose verbatim: offset
  +7.4,+2.75,+8.0, fov 42, lookAt y 1.6 — tools/tmp-type59-mantlet-shots)
  in shots/type59-mantlet/before/garage.png: the pale crescent/fin
  standing on the turret front-left cheek, exactly the owner's shape.
- whatsat AABB receipt: the only geometry occupying the bulb envelope =
  the **Type 59-II searchlight assembly in the gunMount bucket** — old
  drum cylZ r0.26×0.27 at gun-local (0.66, 0.42, −0.05) → world center
  (0.66, 2.187, 1.645), **drum top 2.447** = the crescent tip; yoke arms
  to x 1.023. Root cause ×3: (1) drum authored at gun-local z −0.05 —
  the dome cheek SWALLOWS its lower half (casting front at its top height
  is z-local ~0.53, at its bottom ~1.09 — the drum emerges tangentially
  as a rounded fin, not as mounted equipment); (2) exposed body rode the
  pale gunMount slot (§C detail-slot loud-carrier class); (3) the actual
  mantlet collar (world z 1.665..1.945) sat ENTIRELY inside the casting
  front plane (~1.97 at gun height) — the tube exited BARE (§B3.1
  mantlets-mandatory failing read), so the crescent was the only mass
  reading at the gun root.

FIX (dressing layer only — buildType59 in profiles/china.js; the shared
buildT62Obr1975Chassis is byte-untouched, t62mv1 hash-proven):
1. MANTLET READ (§B3.1): compact cast-collar mantlet with the canvas-
   covered wedge look — ruBoot 3 sections [[0.22,0.62,0.50],[0.40,0.48,
   0.42],[0.58,0.34,0.34]] root→tube with crease collars + end clamp;
   root face buried at every corner (casting front at the ±0.31 root edge
   is z-local 0.246); ruSaddle rootL 0.48→0.30 so no cone sliver exits
   the canvas. Small (0.62 m root vs the 1.45 m brow) — the WZ-120 dome
   + nose brow themselves are UNTOUCHED (ratified §5.315 class).
2. SEARCHLIGHT RE-SEAT (the bulb kill): proper Type 59-II assembly RIGHT
   of the tube — shelf bracket cantilevered off the boot's right flank
   (0.52×0.055×0.34 at gun-local (0.42,0.085,0.42), buried into the boot
   wall), twin saddle cradles, **dark drum housing** cylZ r0.24×0.30 at
   (0.52, 0.36, 0.50) with pale mounting band + bezel, recessed glass.
   New drum top world **2.367** (was 2.447), x-max 0.763 (was 1.023),
   fully FORWARD of the casting (clear standoff, §B2-attached through
   shelf→boot→casting). Gun-linked as before.
MACHINE GUNS (census §B3, p95-budgeted per §5.265):
a. Loader DShK 12.7 RING MOUNT read (the classic Type 59 roof tell): race
   ring torus r0.286 BITING the loader-hatch collar (inner edge 0.266 <
   collar outer 0.27) + 3 carriage stubs + raked carriage arm from the
   ring's forward-right quadrant onto the existing pintle foot. The MG
   keeps its STOWED/LOW-FORWARD seat (census fitting unchanged, barrel
   forward, CROWS law). **p95 receipt: cluster crown world 2.57, ring
   2.505, arm ~2.50 — turretDark 2.59 (cupola lid) remains the datum
   crown; ZERO new side columns above published heightM 2.59; dims 100
   held ×2.**
b. Coax 7.62 (Type 59T) PORT beside the main gun in the mantlet area:
   boss + jacket stub + dark bore dot at gun-local (0.30, −0.06,
   0.26..0.382), rooted through the casting face at the boot's right
   shoulder — an aperture read, not a barrel. Gun-bucketed → elevates
   (§B5 elev-8 pair proves it).
c. Bow MG PORT on the glacis right: boss cylZ r0.085 along the local
   glacis normal (deck run 2.60→2.86 slopes 24.8°, rx −1.138) at world
   (0.88, 1.369, 2.698), half-proud + dark aperture disc — ball/port
   read. Outboard of the IR drum pod, inboard of the track band (x-max
   0.965 < 1.111); hullDetail AABB confirms containment.

GATE (×2 bit-identical, hold-or-improve vs the §5.315 min-0 owner-
decreed-divergence row): **min 0 | hull 32.5 (held) | whole 18.8→19.0 |
turret 0 (capped) | stations 42→43.2 | dims 100 HELD | floaters 100
HELD**. track-clip --exact --strict **0/0 all columns + 0/0 shoes + 0/0
sweep**. §B5 in pixels: yaw-35 pair (DShK+ring+arm, searchlight, boot,
coax all rotate with the turret; nothing stranded) + elev-8 pair (boot/
drum/coax pitch with the gun; turret-owned ring mount correctly stays) —
shots/type59-mantlet/b5-yaw35/ + b5-elev8/. §B2: floaters 100 ×2 + top-
tilt/front closed-deck reads.

HASHES: type59 **a62bf43c → ea3494b4** (53 meshes held, verts 78371 →
81761). Guards byte-exact start→end of round: t62mv1 **ac414eaa** (the
shared chassis — untouched by construction AND by hash), ztz85_iii
13f0c8d7, type99a 7f613788, t54 cedb8be8, ztz99a2
89052eac-as-read-live (= 93c78198 at clean HEAD — the live-tree offset
is a FOREIGN live lane's uncommitted spec/marking WIP, reproduced
clean-worktree, zero type59 mentions; my batches held the live reading
exactly). CLOSING-WINDOW NOTE: at the post-delivery receipt type99a read
f184fdc4 live while clean HEAD (f12bf027) still reproduces **7f613788**
— the mover is the same foreign type99-armor lane's live WIP (its own
tank, actively edited); type99a held 7f613788 through every one of THIS
lane's edit batches, and clean-HEAD type59 reads a62bf43c (pre-fix) ✓.

npm GATE (honest): pre-§5.337 chain GREEN exit 0 with these edits; the
§5.337 "test-chain union" then landed mid-round referencing an UNTRACKED
foreign-lane selftest (src/vehicles/profiles/type99Armor.selftest.mjs,
status ??) which fails on ITS OWN WIP ("type99a authored ring seat"
1.4436559 vs 1.4). EXONERATION RECEIPT: failure reproduces byte-identical
in a worktree with MY china.js reverted to HEAD (md5 b5bcf038) under the
same foreign WIP — not this lane's defect. Every OTHER test in the union
chain runs GREEN with my edits (16/16 post-failure tests individually
exit 0, incl. the new combatAnatomy + propPlacement).

§5.254 PAIRS (same-environment, HEAD 17a33b31 both sides, byte-
deterministic — after re-render cmp IDENTICAL): shots/type59-mantlet/
before/ (HEAD build) vs after/ (this fix), 9 views each at the owner's
garage angle + orthos + closeups; cross-env v1 pair archived in the lane
scratchpad. ORCHESTRATOR NOTES: (1) icons for type59 not regenerated
(orchestrator lane per §5.246); (2) the shared ledger.json working-tree
diff interleaves sibling lanes' rows — type59's row update is this
lane's; (3) delivered UNCOMMITTED-UNSTAGED per order.
