# Type 74 (`type74`)

**Exact variant modeled:** Type 74 (JGSDF, 1975–1990s fit, pre-Type 74 Kai) —
L7A1 105 mm licensed (Japan Steel Works), hydropneumatic suspension at
standard ride height, IR/white-light searchlight left of the mantlet.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | ~6.7 m (roster dims 6.7) | militaryfactory.com armor_id=95 (overall 9.42 minus ~2.7 gun overhang); GHQ/model references |
| Overall length (w/ gun forward) | 9.41–9.42 m | en.wikipedia.org/wiki/Type_74_tank (9.41); militaryfactory.com (9.42) |
| Width | 3.18 m | Wikipedia; militaryfactory.com |
| Height (std clearance, cupola) | 2.25 m (turret roof ~2.0; clearance adjustable 0.2–0.65) | Wikipedia; militaryfactory.com |
| Gun (model, caliber, tube length) | JSW/Royal Ordnance L7A1 105 mm rifled L/51, gun length 5.89 m incl breech (~5.35 m tube), mid-tube fume extractor, NO thermal sleeve | Wikipedia (L7A1, 5.89 m); militaryfactory.com |
| Road wheels / rollers / sprocket | 5 LARGE road wheels/side, NO return rollers, REAR drive sprocket, front idler | militaryfactory.com ("five large road wheels", "no track return rollers", "drive sprocket at the rear", "track idler at the front") |

## Identity cues (what makes this vehicle unmistakable)

- Turret plan-form and roof layout: low CAST turret with heavily sloped
  rounded sides — a squashed hemispherical front flowing into a long tapered
  bustle (STB-1 lineage, reads like a lower, sleeker M60A1 needle-nose);
  commander's rotating cupola RIGHT with a 12.7 mm M2 on a pintle, low oval
  loader hatch LEFT; roof otherwise clean.
- Mantlet/gun mount: rounded cast mantlet saddle around a bare rifled tube
  with a fat mid-tube fume extractor; big rectangular searchlight box
  mounted LEFT of the mantlet (white/IR light).
- Hull front: LOW-SLUNG hull — sharp shallow glacis with a pronounced
  center crease, flush driver hatch left, very low sponson line; the whole
  vehicle sits close to the ground at standard trim.
- Running gear + skirts: 5 big exposed rubber-tired wheels, dead track sag
  between stations (no return rollers), NO side skirts — the upper run is
  visible under the fender line; rear sprocket.
- Signature equipment: hydropneumatic kneeling suspension (modeled at
  standard trim), fender stowage boxes, twin rear-deck exhaust outlets with
  mesh, tow cable across the glacis, two whip antennas at the bustle sides.

## Reference links (links only — no downloaded images committed)

1. https://en.wikipedia.org/wiki/Type_74_tank — infobox 9.41/3.18/2.25, L7A1 105 L/51
2. https://www.militaryfactory.com/armor/detail.php?armor_id=95 — running gear (5 wheels, no rollers, rear sprocket), cast sloped turret
3. https://tank-afv.com/coldwar/Japan/Type-74.php — photo walkaround set

## Local GLB oracle notes

Path: `public/models/tanks/community/type74-nullops.glb` (Sketchfab Standard —
PERSONAL-USE QUARANTINE; oracle only, registered for the lab through
LOCAL_REFERENCE_OVERRIDES exactly like ariete; never a shipped source).
Skinned armature (Tower_9 yaw bone, Gun_7 pitch bone, wheels as bones);
loader uses scaleToOverall because the barrel verts live in the skinned hull
mesh. ROSTER NOTE: the type74 SPEC was delisted with the quarantined GLB
(userdrops.js SHIP_QUARANTINE_USERDROPS=false) because it had "no procedural
fallback"; the misc.js profile now registers the spec with an original
procedural build (clean license), which is the substitution that delist
comment asked for. Width-normalized (3.18) station readings: overall 9.09,
height 3.06 over the M2/antenna stack (the fused skinned mesh exposes no
hull/turret split, so hull/turret/gun component masks are N/A — the lab
scores whole silhouette + tracks only). The oracle reads proportionally
larger than the published envelope (its width bbox is set by the fender
mirror arms, shrinking the hull on normalization); the procedural keeps
published dims with the deck band at 1.32 and dome crown ~2.13, and mounts
its own mirrors INSIDE the ±1.59 width guard so normalization stays stable.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | — | — | — | — | — | — | no baseline possible: spec unregistered (quarantine delist), lab had no oracle row |
| 2026-07-30 | 82.1 | 76.6 | N/A | N/A | N/A | 90.7 | first scoreable build: spec registered from misc.js + lab oracle override; bespoke low hull, cast dome, 5-wheel dead-track gear, cupola M2, searchlight |
| 2026-07-30 | 83.8 | 79.8 | N/A | N/A | N/A | 89.3 | r2 final: deck band to 1.32 + dome to 2.13 (published 2.25 w/ cupola), wheels R0.42, fender mirrors, hull-rear whip antennas, taller M2 stack, gun 5.72 (muzzle registers with the oracle). Component masks stay N/A (fused oracle) — identity judged on the shaded board per the packet |

## RETIRED CAP — single-mesh rig (repaired 2026-07-31, batch 6)

The v9 "skinned single-mesh / setPart cannot split" cert is **DELETED —
the batch-6 re-rig succeeded** (tools/repair_oracles_blender.py
RERIG_RECIPES.type74: armature baked at bind pose, the 5 layer meshes
split by dominant bone weight into hull / `Tower_9` / `Gun_7` static
trees). Turret mask non-empty, hull != whole, stations measure, dims 100.

## GATE-V10 CERTIFIED ORACLE-DEFECT CAP — proportional print inflation (2026-07-31)

With the rig honest, the residual defect is measurable and PROPORTIONAL
(the old packet's cause stands: the print's width bbox is keyed by its
fender mirror arms, so width normalization under-scales the body):

- ref hull body span reads ~7.13 m and sits ~1.1 m AFT of the build's
  published-envelope midpoint (gate registration dAlong ≈ 1.14);
- ref deck/gun bands ride high: tube band 1.75..1.93 (axis ≈ 1.84 vs the
  build's published ~1.66), M2/cupola cluster 2.76-2.85 over ~16 trace
  columns (published height 2.48 caps the build's cluster at ~2.46-2.50);
- ref muzzle ends z +4.48 with a ~1.95 m overhang — the build carries the
  PUBLISHED 9.42 m overall (muzzle +6.09), so ~9 build-only barrel columns
  land in the gun-bearing whole rows (hull-anchored registration: this is
  the certified short-barrel coverage class, wholeCurves only).

Build-side fixes this round: whips matched to the print's 1-column spikes
(x ±0.95, one body-relative column aft of midships), mirror heads folded
to the fender line. **hullCurves / wholeCurves / turretCurves / stations
are certified capped at their measured residuals** (~40 / ~6 / ~0 / ~0)
against this print — no rigid transform repairs relative proportions.
dims + floaters remain sovereign and pass at 100/100.

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Zero-row triage + normalize plan (2026-08-03, misc agent)

Ledger 0 (turretCurves/stations) is HONEST — the quarantine reference
renders (gate rows carry real ref values; side reg dAlong 1.14 shows the
scale/offset mismatch, not a false-0). Extract REG appended (quarantine
oracle, ^Tower_9$/^Gun_7$ scaleToOverall). Stylization: bodyH +13.9%
(near-uniform tall: deck band 1.5-1.6, dome/cupola band 2.8 vs pub 2.48,
whip spike 3.06), hullMask +2.2%, overall -3.7%, width 0%. **Normalize
plan authored** (tools/vertex-normalize.mjs `type74`): y [[0,0],
[1.60,1.38],[2.827,2.46],[3.058,2.49]] (sim p95 2.460, h -0.9%); z body
x0.978 about -1.1135 + muzzle -> rear'+9.42. NOTE scaleToOverall: the
loader re-normalizes post-warp — `--verify` must re-check the landed
factors. DO NOT BUILD pre-warp (>2% law).

## Oracle warp verify note (orchestrator, batch-27)
height -1% / overall -0.4% / width 0% — in grace. hullMask reads 40.1% and
is UNMEASURABLE BY DESIGN on this print: it is a skinned/armature model
(Hull_17/Tower_9/Gun_7 are bones; all geometry lives in shared skinned
meshes Object_7..12, so the barrel is inseparable from the hull mask in
bind pose). In-game articulation drives the bones and works; only the
extract's node partition is blind here. Census also counts differently on
skinned prims (guard numbers used per the batch-19 law). Dims-sovereign
building unaffected: the GATE measures the proc build vs published dims.

## VERTEX ROUND r2 note (2026-08-03, misc agent) — post-warp standing, NOT rebuilt

Post-warp gate rows (v11): hull 43.2 / whole 25.8(6 in ledger) / turret
0 / stations 0 / dims 100. Honest zeros (reg side dAlong 1.138 dy 0.113
/ plan dy 1.068 — the warped skinned print sits ~1.1 aft of our frame;
plan_hull already 86.5, so the FOOTPRINT matches well and the errors
are vertical-band + turret placement/shape). TRACK CONTAINMENT: the
pre-build audit measured SEVERE front 370 / rear 260 exact voxels on
this id — the next hull re-lay must keep the lower bow/stern plate lips
clear of the wrap arcs (kit band far edge = end-wheel r + 0.09 + ~0.08
link pads; see the leclerc r2 numbers) and re-run
`node tools/track-clip-audit.mjs --exact --ids=type74`.
Note the packet's hullMask-40.1% flag: the extract's node partition is
blind on this skinned print (batch-27 note) — buildable only from the
whole-silhouette rows + published dims; turret rows score against the
re-rigged bone split, which DOES measure.

## VERTEX ROUND r3 (2026-08-03, misc agent) — SEVERE §B4 flag RESOLVED (463/278 -> 6/0) + §B3 mg

Final: gate hull 0 / whole 0 / turret 0 / stations 0 / **dims 90.4** /
floaters 100 (rows floored as at round start — same comparison-pathology
class as type90/ariete, see type90.md r3; type74 adds side dAlong 1.45 and
front dy 0.37 mean 16.6). Track-clip exact: **front 6 / rear 0** from the
SEVERE pre-build 463/278 (audited 370/93 front + 260/18 rear). standard-
check: clip ✓ contig 0 ✓ mg1. Boards: shots/misc-r3/after/type74.png.

§B4 fixes (type74 has NO skirts — the wrap arcs are fully exposed):
- Both mudflap pairs were INSIDE the wrap arcs (370 front / 260 rear
  exact vox): re-hung from the fender tips at y 1.19 (tops at the 1.336
  fender underside), clear above the wrap crowns.
- Glacis half-slabs: lower edge TAPERS to x ±0.98 (was full-width 1.59 —
  inside the idler wrap; the real vehicle's glacis tapers between the
  exposed tracks). Lower nose narrowed to x<=0.98 AND made 0.32-band tall
  (0.40..0.72) so it stays the hullLength front BODY anchor at 3.35 (the
  taper alone dropped hullLength to 6.55/-2.2%; this restored dims 90.4).
- Tail plate split: narrow 2.00-wide course below the wrap line + wide
  2.86 upper course with its bottom at 0.78 above the sprocket wrap.
- Sponson band bottom 0.90 -> 0.94 (grazed the dilated idler crown).
- Residual 6 vox: the auto-generated hull LOD's simplified gear blob at
  (±1.06, 0.78, 2.89) — not directly authorable, well under the 60 line.
- §B3: commander's M2 = FITTINGS.pintleMG m2 two-tone on the cupola lid,
  foot 0.76 — receiver ~2.50w keeps the heightM p95 anchor at the
  published 2.48 (at foot 0.725 heightM read 2.42/-2.3%).

## VERTEX ROUND r4 (2026-08-04, misc agent) — dims 90.4 -> 99.6; curve rows CONFIRMED oracle-floored (normalize escalation)

Gate x2: hull 0 / whole 0 / turret 0 / stations 0 / **dims 99.6** /
floaters 100 (heightM 2.46/0.64%, hullLengthM 6.63/1.05%, overallLengthM
9.42/0.05%, widthM 3.19/0.24%). Track-clip exact **14/2** (<=60 band ✓);
standard-check clip ✓ contig 0 ✓ mg1. Board: shots/misc-r4/after/type74.png.

WHAT LANDED (measured from the r27-fixed workorder dump):
- The print re-normalizes ~+13% TALL at load: scaleToOverall undoes the
  batch-27 y-warp (side dy 0.28-0.35 every run; its deck reads 1.70,
  dome 2.52-2.58 against the published 1.38/2.48 proportions). Features
  are now seated at the DY-EFFECTIVE lines: deck band raised to 1.395
  (print-effective 1.40), dome crown 2.25 longer/rounder (its 2.52-2.58
  dome reads effective 2.22-2.28), cupola lid ~2.36, M2 receiver kept
  2.46-2.50 as the published-2.48 heightM p95 anchor (t80u
  partially-tall trade, unchanged from r3).
- Contact patch pulled to the print's [-2.35, 2.15]: wheels
  [2.05, 0.975, -0.10, -1.175, -2.25], RAISED end wheels (idler 2.80/
  0.62/0.24, sprocket -2.85/0.65/0.24) for its climbing-ramp read.
- SS-A anchors: nose body cols 3.14+3.26 (published 6.7 about the ref
  band mid ~-0.14) + tail plates/flaps at -3.42..-3.47; muzzle step at
  the measured mask end (overall 9.42 EXACT).
- tightenHullShadowProxy() fitted to the real gear envelope.

ESCALATION (orchestrator lane — oracle work, builders never run repairs):
1. The re-rigged TURRET MASK RENDERS EMPTY in the gate (side_turret ref
   0 columns this round) — turretCurves is a hard 0 for ANY build until
   the Tower_9 split is restored/re-baked. Worth re-checking the batch-6
   re-rig against the current loader.
2. scaleToOverall RE-NORMALIZATION defeats the batch-27 y-warp (the
   packet's own warp-verify note warned of this): the print renders
   ~+13% uniformly tall, so side/front rows floor at mean 11-15% under
   dy-registration (the t80bv certification class, option-b re-warp:
   bake the y map into bind pose ACCOUNTING for the loader's re-scale,
   or parameterize the loader's normalization for warped GLBs).
3. The skinned hull mask still carries the barrel (side_hull cover ~20%
   = ~19 ONLY-REF barrel columns) — certified per batch-27; hull rows
   cap in the low tens regardless of build until then.
With 1-3 resolved this build's rows re-score in one round; the frame,
gear, and dy-effective bands are already seated.

## VERTEX ROUND r5 (2026-08-07, type74 lane) — FULL PRINT-FRAME REBUILD; plan rows 46.5/67.8 -> 61.4/80.8, dims 100, all audits 0-clean; remaining rows PRINT-CAPPED with mechanism evidence

Gate x2 (bit-identical): `min 0 | hull 0 whole 0 turret 0 stations 0 dims
100 floaters 100`. Row detail (final run): plan_whole **80.8** (mean 1.47
p95 2.75 cover 0), plan_hull **61.4** (mean 2.44, p95 15.65 = the 2+2
fused-gun center columns), side_whole 0 (mean 9.34 — the dy floor, see
CAP-2), side_hull 0 (mean 12.18 cover 19.01 — CAP-1), front_whole 0 (mean
11.24 — CAP-2 at dy +0.325), front_hull 0 (CAP-1), stations 0 (CAP-3),
turret 0 (CAP-4). dims: heightM 2.48/0.06%, hullLengthM 6.71/0.13%,
overallLengthM 9.48/0.60%, widthM 3.19/0.28%. Hash `tmp-hashgeo type74
7ba404c5` (51 meshes / 55557 verts); siblings byte-held (diff scope = two
hunks: TYPE74_SPEC armor pivots + buildType74; ariete 324c3f12 / t80u
a6782440 match their banked resit values at this tree).

WHAT LANDED (authored from the LIVE workorder, world = body-relative):
- **§D WIDTH-ANCHOR FIX (the round's structural find):** the kit's sprocket
  TOOTH RING spans the band edges +0.031 (widest face xc+0.3065) and the
  shoe pads ride xc+0.2985 — at the r4 xc 1.315 the build's visibleBox hit
  ±1.6215 and safeScale rescaled the ENTIRE build x0.98066 (probe-frame
  law: every authored coordinate rendered ~2% small; the r4 "dims 99.6" was
  measured on the shrunk render). xc 1.2835 seats the tooth ring EXACTLY at
  the ±1.59 published anchor: scale 1.0000, authored = world, widthM 3.18
  EXACT, and plan cover dropped 3.51 -> 0 in the same landing.
- Frame: body [-3.38, +3.30] (published 6.7 about mid -0.04), muzzle +5.96
  (overall anchored on the -3.44 sprocket-shoe rear extreme), deck 1.395,
  belly 0.305.
- Gear from the live print bots: 5 near-touching wheels r 0.42 at z [1.83,
  0.96, 0.10, -0.77, -1.64] (contact [-2.06, +2.25] = the print's), raised
  idler {2.93, 0.64, r 0.28}, HIGH climbing sprocket {-3.00, 0.90, r 0.26}
  — the Type 74 tail-high wrap read; track-clip --exact **0/0 band + 0/0
  shoe**.
- BOW (§B8.1 gate-2): two-plane 29°-from-horizontal glacis with the
  PRONOUNCED center V-crease (nose edge (0, 0.89, +3.37) -> (±0.98, 0.91,
  +3.17), sweep 0.20 ≈ 9°/side) + reverse-raked chin plate tucking to the
  belly (0.90@+3.35 -> 0.42@+3.16 center); glacis crest x ±1.02 — the real
  vehicle's glacis is the plate BETWEEN the fenders (the first-pass ±1.50
  wing swept its taper edge through the idler wrap: track-clip front 17/22
  -> 0/0 on the narrow). Splash rail, tow eyes on the chin, cable draped
  across the crest, driver hatch flush at the deck edge (-0.52, +2.00).
- TURRET seated FORWARD per the print (pivot z +0.50; the r4 -0.05 seat was
  ~0.8 aft of the print's crown zone -0.10..+1.47 body-rel): long-crown
  STB-1 cast dome (lathe, crown 2.26-2.28, left shoulder 2.10-2.16 = the
  ref's own 2.03-2.13 front-view band), tapered bustle + rear plate to
  world -1.55, side baskets (rails + mesh + duffel) hugging the bustle
  flanks to ±1.28, x-outer 1.30. Cupola RIGHT (photo class; the print reads
  it near center — documented split) lid ~2.34 + M2 pintle = the
  heightM-2.48 p95 anchor (receiver+sight ~2.535); loader ring LEFT on the
  shoulder (lid 2.20); IR searchlight box LEFT of the mantlet seated
  AGAINST the dome face (rear face buried into the casting) with hood lip,
  split doors, glass slit, mount arm, cable conduit.
- GUN on the print's bore line: gunG world (0, 1.60, +1.65) — bore 1.60 vs
  ref tube axis 1.57 (r4 rode 1.74); trunnion saddle roll r 0.22 + ball +
  collar (§B3.1 mantlet mass), cast brow; bare L7 tube len 4.31, evacuator
  at the ref's own +3.43..+3.72 station (evac 0.445/evacR 1.75), muzzle
  step + §B3.1 shadow-named bore at +5.96.
- §I FITTINGS census mg1+6d: pintleMG(m2) + towCable + jerryCans(x2, left
  fender) + antennaWhip x2 ON THE BUSTLE flanks (x ±0.94 body-rel -0.93 =
  the ref's own 2.59 spikes; §B5: they yaw with the turret — r3/r4 had them
  hull-mounted) + smokeBank x2 (3-tube JGSDF banks on the dome rear
  quarters). Fender bins/rack-shelf boxes stay hand-authored (JGSDF lidded
  bins — no library primitive matches; justification per §I).
- Rear: exhaust NOTCH panels (x 0.68-0.97 recessed to -3.21 = the print's
  own plan notch) with mesh outlets + taillights; rack shelf at the print's
  1.447 line (z -2.69..-3.29, bottom 1.392 clears the sprocket-shoe crown
  1.355); tail plate center x ±0.66 at -3.38; corner step 1.246; flaps
  above both wrap arcs.

AUDITS (round close): track-clip --exact 0/0 + 0/0 ✓; winding-audit m1
rev 0 / mix 0 / deficit 6px 0.00% (AA @rear) ✓, m2 yaw-stranded CLEAN (38
candidate px vs 5205 static, 5167 coincidence) ✓ — **the §C.1 BUILD-
STANDARD "type74 (1+1)" open-carrier note is CLOSED at this rebuild**;
turret-parent 0/0/0 ✓; standard-check clip ✓ contig 0 ✓ census mg1+6d ✓;
floaters 100 x2 ✓; §B5 yaw-90 top pair banked (the full turret group —
dome/gun/searchlight/baskets/whips/smoke/M2 — rotates as one, hull
furniture static): shots/misc-r5/final/type74/yawpair-top.png.

Self-shots (16-view photoclass, rest + yaw90 + measures.json):
shots/misc-r5/final/type74/; mask board shots/misc-r5/type74-board.png
(overlap overall 91.0). §B8 self-read (NOT an acceptance verdict —
DELIVERED-PENDING-CRITIC): low-slung hull, 5 countable wheels, no skirts,
raised ends w/ high sprocket, 29° V-crease bow, forward-set long low cast
dome, bare L7 + mid-tube evacuator + bore, searchlight left of mantlet,
cupola+M2 right / loader left, bustle baskets + whips. Turret z-span 3.83
= 57% of hull — over the generic §B8.1-4 ~55% alarm line but print-true
(the ref's own crown+bustle read spans the same; revolution-class
adjudication note, not an order).

### PRINT CAPS (gate-v11, live 2026-08-07 tree — the type10 evidence pattern; re-scoreable only by oracle repair, orchestrator lane)

The oracle is the RAW SKINNED ARMATURE (re-verified in bytes this round:
29 nodes, 5 meshes ALL carrying skin 0; Tower_9/Gun_7/Hull_17/wheels are
meshless bones — the batch-6 re-rig is NOT in the committed GLB; the
batch-27 y-warp rebuilt from .bak and dropped it). Consequences, measured:

- **CAP-1 (side/front/plan _hull rows):** the ref "hull" mask = the WHOLE
  fused model (extract: side_hull == side_whole byte-equal; hullMask span
  9.385 vs body 6.654 = the 40.1% flag). Any honest proc hull (turretless)
  eats ~12-13% mean over the ref's turret-zone columns + 18-19% cover from
  its ~19 barrel-only columns. Measured floor this round: side_hull mean
  12.18 / cover 19.01; front_hull mean 13.53. plan_hull only loses the 2+2
  center gun columns (p95 15.65) -> 61.4 is its cap neighborhood.
- **CAP-2 (side/front _whole rows):** whole-vs-whole is fair, but the gate
  pins whole rows to the HULL row's registration (fixedReg law) and the
  fused hull mask pollutes dy upward: measured dy +0.254 side / +0.325
  front (decomposition: ref turret-zone mids ride +0.35..+0.5 over our
  deck mids on ~40 of 66 paired columns -> predicted +0.25/+0.29;
  measured matches). Every paired column then carries ~dy of error the
  build cannot follow (track bottoms cannot sit 0.25 below ground; a
  dy-chasing build would need deck 1.12/bore 1.32 — §B8 identity death).
  Measured floor: side_whole mean 9.34, front_whole 11.24 -> scores 0.
- **CAP-3 (stations):** station z-ranges come from each model's own
  side-HULL mask ("no barrel in it" by design — violated by this print):
  refZR spans -4.69..+4.69 INCLUDING the tube, so ref stations 11-13 are
  barrel-only slices (extract stations: w 0.153/0.146/0.139) while proc
  slices are body -> wPct 1499/1503/1506; trimmed() drops only 2 -> one
  ~1500 always survives -> stations 0 for ANY honest build. Additionally
  the body pairing SHEARS (ref body occupies stations 0-9.99 of 14, proc
  0-14: ref station i samples body fraction 1.41x i/14).
- **CAP-4 (turretCurves):** the bones carry no meshes -> setPart('turret')
  on the ref renders EMPTY -> curveScore(empty ref, non-empty proc) = 0
  both rows (gate turretRows: score 0, mean 100, cover 100, reg None).
  noTurretBoth cannot apply (our rig_turret is honest), fixedMount would
  be a lie (turreted vehicle).
- **LIVE-vs-EXTRACT LAW (banked for the file):** the 2026-08-06 vertex
  extract's CPU skinning disagrees with the live GPU skin on this armature
  print — live ref muzzle reads ~+0.48 beyond the extract's (+5.17 vs
  +4.70 workorder frame; live overall span ~9.87 vs extract 9.385) and
  live plan columns light to ±1.71 (its fender-mirror arms) vs the
  extract's ±1.59 box. Skinned-print rounds must author from the LIVE
  workorder dump only; extract curves stay useful for BAND SHAPES (deck/
  dome/bore lines corroborated live).

ESCALATION (unchanged, orchestrator lane): restore the batch-6 re-rig
(tools/repair_oracles_blender.py RERIG_RECIPES.type74 — bake bind pose,
split by dominant bone weight into hull/Tower_9/Gun_7 static trees),
verified against the CURRENT loader (the old warp-verify note's
scaleToOverall re-normalization concern reads RESOLVED at this tree:
live height stylization ≈ -1%, gate dy is pollution-shaped, not
scale-shaped). With the re-rig landed, CAP-1..4 all lift and this build's
rows re-score in one round — the frame, gear, bands and turret seat are
already print-true.

## §C MISSING-SIDE WINDING FIX (2026-08-06, abrams builder — coordinator order extension)
tmp-misc-leftprobe measured the RIGHT glacis half-plate REVERSED (out1/6,
vol -0.322): x[0.02,1.55] y[0.55,1.39] z[1.06,3.22] (buildType74 ~:1744,
the `for s of [-1,1]` crease-glacis mirror loop — the as-authored corner
ring is left-handed for s=+1; the LEFT half read mixed out5/6 and rendered
correctly). FIX: buildType74 binds `const slab = orientedSlab;` (slab
dropped from the KIT destructure). Probe after: REVERSED 0; both halves
now SYMMETRIC mixed out5/6, positive volumes (+0.322/+0.305) — per-face
adjudication: the single centroid-"inward" face per half is the CENTER-
CREASE inner-edge face at x ±0.02 (the two halves face each other across
a 4 cm slit over the hull tub — interior by construction, unlit at 1x);
the outer glacis surface, front band and side edge are outward. The fixed
right half is the byte-mirror of the always-correct left. Renders
(shots/misc-leftside/{before,after}/type74-*): diffs localized to
frontleft/frontright/gunrun (0.02-0.20% px — the right glacis surface now
renders); left/rear/yaw-180 views identical. Asym rows 21 -> 18; the
residual rows are the print's own offsets, not winding. Flood identical
(open-background class). GATE HOLD x2 EXACT: min 0 (skinned-print cap
class, see above — hull/whole/turret/stations capped) with the SOVEREIGN
components byte-held: dims 99.6 / floaters 100 both runs.
