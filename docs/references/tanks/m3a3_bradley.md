# M3A3 Bradley CFV (`m3a3_bradley`) — GROUND-UP REBUILD packet (§5.248 IFV wave)

**Exact vehicle modeled:** M3A3 Bradley Cavalry Fighting Vehicle — the A3
digitized hull in the two-man SCOUT configuration: family tub + flare
slabs + spine/roof + two-slope glacis + nose shelf + bow face plate,
NO troop firing-port band, cargo hump + rear roof box, full-height rear
RAMP with door inset, segmented skirts + flat-panel appliqué INSIDE the
3.28 base width datum, A3 turret with the big ISU hood right-front, the
CIV independent viewer left-rear (the A3 recognition tell), raised TOW
twin-box LEFT on its elevating bracket, right stowage wing, mesh bustle
rack, twin whips, M242 + coax M240, 'C-30'.

## OWNERSHIP / ROUND STATE (2026-08-17, §5.248 IFV wave)
GROUND-UP REBUILD — replaces the buildBradley(P)-donor composition under
the same id. The m2a2_bradley GRADUATE lineage is the family GRAMMAR
donor only (construction vocabulary + measured family envelope); every
solid is authored fresh. Spec: full row in src/vehicles/afvFamily.ts;
builder `buildM3A3` in src/vehicles/profiles/afvFamily.ts. m2a2_bradley
resident hash byte-held (a41410ac).

## ORACLE STATE — `m3a3_bradley` (INSTRUMENT DEFECT — rest pose scattered)
`public/models/community-candidates/m3a3_bradley_sipriv.glb` (LOCAL-ONLY
quarantine). **The rigged print does NOT assemble under static GLTF
load**: its rest pose is a disassembled parts kit (browser gate reads the
ref as a 3.37 x 1.59 clump — receipts: gate refExt rows + the run-1
fidelity grid, shots/ifv-wave/m3a3_bradley_geo.png; the vertex extract's
bind-pose AABBs show the same scatter: track runs at x 1.29..1.58 AND
x -0.12..0.17, parts piled around origin). Its clean turret/gun BONES are
real, but posing them needs a §E ORCHESTRATOR REPAIR (bake a posed copy).
**Curve/station components are capped at 0 by the defective instrument**
— dims (proc-only, vs published data) and floaters (proc-only) are the
honest measurable components until the repair lands: **dims 100,
floaters 100** at round close.

### Width-guard receipt
Runs 1-5 authored the skirts/appliqué to 3.38 over the 3.28 spec width —
the harness silently shrank the whole build ×0.97 (hullLengthM read 6.31,
heightM 3.09 pre/post mixes). Clamped to the published 3.28 base datum
(packet two-datum law, appliqué inside the band): dims 100.

## Corroborated dimensions (published)
| Measure | Value | Notes |
|---|---|---|
| Hull length | 6.55 m | overall = hull |
| Width | 3.28 m | BASE datum (m2a2 packet law) |
| Height | 2.98 m | turret sight-cluster datum (ISU brow/CIV authored to it) |
| Weight | 34.4 t | |

## Round history (§K flow)
- Family grammar from the m2a2 measured envelope; run-1 gate exposed the
  scattered ref (above) — photo-class discipline from there.
- Ladder: bow face plate (family bow-body anchor), width clamp, MG
  resize into the CIV z-band (p95 roof discipline), stern underside
  between-tracks correction.
- Honest residuals: all curve components await the §E posed-bake repair
  of the print; the build is delivered against published dims + family
  envelope + photos.

## Guards
m2a2_bradley GRADUATE geometry byte-held (hash a41410ac before/after);
no shared-file geometry edits — family-module rows only.

## CLOSE (×2 bit-identical, 2026-08-17)
  min 0 | curves/stations 0 (scattered-rig instrument cap) dims 100 floaters 100
Arc: dims 65.5 → 100 (width-guard clamp + bow face plate + MG p95
discipline); floaters 100 throughout. The curve floor is entirely the
defective instrument (rest-pose parts kit — receipts in the packet);
§E posed-bake repair is the unlock.
Geometry hash 17f88614 (60 meshes / 61359 verts).

## §E STOPPED — skinned-bounds hypothesis disproven; no framing defect
## exists (2026-08-17, §5.248 §E round; print PRISTINE sha a5a3a985…,
## reference-glb-loader UNTOUCHED)
The §5.269 instrument-finding-2 chain ("renders assembled; parts-kit read
was an AABB artifact; bounds ignore skinning; ref-side framing fix") fails
every fact-check against the real bytes:
1. The print has ZERO skins / zero SkinnedMeshes (231 plain mesh nodes
   under 65 bone-NAMED plain group nodes) — the claimed mechanism
   ("bounds ignore skinning") has nothing to act on.
2. Accessor min/max == real-vertex boxes EXACTLY (world box x 5.525 /
   y 3.781 / z 5.900) — no bounds lie of any kind.
3. The single animation ("M3a3 action", 5 channels) is articulation-only
   (turret yaw ~25°, gun/hatch pitches) and its frame-0 EQUALS the static
   TRS — no assembling pose exists anywhere in the file (1 scene, no
   exotic extensions).
4. The static scene is GENUINELY part-scattered: PCA spans 6.17 × 5.74 m
   (published 6.55 × 3.28), y to 3.72 (published 2.98), dual track runs
   (the packet's own receipt).
5. The gate frames it truthfully: refExt 3.412 × 1.591 == the width
   normalization of the scatter-wide box — instrument CORRECT on
   defective input.
VERDICT: there is no loader/gate framing fix to make (absent-param
byte-identity holds trivially — no code changed); a posed-bake cannot
source an assembled pose from these bytes. The curve-0 floor is the
PRINT's static parts-kit pose, now precisely characterized. The honest
row stands (min 0, dims 100, floaters 100). Any unlock requires a new
oracle drop or a hand-authored pose plan (owner/orchestrator ask).

## §5.269 FIX ROUND (critic 8.6, one fix from PASS, 2026-08-17)
ORDERED + DONE: the TOW launcher rebuilt at REAL DEPTH on the A3 elevating
bracket — wall root block, trunnion boss, cradle arm plate, full 0.42 ×
0.52 × 1.35 armored twin-tube box with side rib bands, proud muzzle faces
+ tube mouths, rear doors face (the round-1 thin-plate read is dead).
Instrument note per the coordinator: the print RENDERS ASSEMBLED — the
parts-kit verdict was an AABB artifact (bounds ignore skinning); the
ref-side framing fix stays with the coordinator; curve rows remain capped
until it lands. §B4 swept clean (lower bow between the lanes, skirt bins
outboard of the track pins, flaps outboard): track-clip 0/0/0 strict.
CLOSE (×2 bit-identical): min 0 (instrument cap) | dims 100 floaters 100 —
base-equal on every measurable component. Hash b0eb98a1.

## §5.306 OWNER ORDER — base reverted, wave equipment carried over (2026-08-17)
ORDER (verbatim): "revert our m3a3 bradley CFV except add the extra
equipment we added and detailing and armor".
DONE — HYBRID: the pre-§5.286 base returns from 2fc642fb^ (buildBradley
donor hull + the low welded A3 turret: buried ring collar, faceted shell,
gun-throat cheeks, twin crew stations, tapered left sight plinth, aft
bins + braces, spaced side armor course x1.73, smoke/radio, M3A3 decal;
in-builder seat (0.04, 1.895, -0.36) restored). The §5.286 wave's
additions were diff-enumerated and each seated at the old base's
stations:
- CARRIED (re-seated): TOW twin-box at real depth on the LEFT A3
  elevating bracket (root/trunnion boss/cradle arm/ribbed full-depth
  box/proud tube mouths/rear doors — the §5.269-fix item) — the whole
  cluster rides 0.14 inboard of its wave coordinates so the root buries
  at this shell's own 0.61..0.69 wall line; REPLACES the old right-hand
  pod + left electronics box (the wave corrected the TOW handedness).
- CARRIED: stowage wing RIGHT on the station the old TOW pod vacated.
  BUG FIXED in carry-over: the wave wrote the wing lid into the HULL
  bucket at turret coordinates (it landed buried inside the tub —
  latent); the lid now rides the turret it dresses (turretDark).
- CARRIED (re-seated): ISU hood + brow on the cheek/roof junction (base
  buried 0.15, wave reveal preserved; wave roof was 0.905 local, this
  shell's is ~0.556).
- CARRIED (station upgrade): CIV — the wave's rotating drum head replaces
  the old dual-aperture box on the base's tall left sight station; the
  tapered plinth stays, the pedestal grows (0.30x0.37x0.30) to hold the
  drum at the wave's own 2.99 world crown.
- CARRIED: deeper mesh bustle rack (w1.52 d0.50 h0.30 fill 0.80, wave
  seed 3610) + standoff plate, re-seated on the base bins; base braces
  keep returning the rails.
- CARRIED: coax M240 + muzzleBore + muzzle tip dot on the base gun plant
  (bore re-cut to the base's own len 2.42 / r 0.037).
- CARRIED (hull-side): A3 glacis appliqué panel + seam strips — seats on
  the donor's own upper glacis plane (same frustum line as the wave
  hull's).
- INHERITED, NOT DUPLICATED (donor already owns the station): cargo
  hatch hump, rear roof box, troop hatch seam, engine deck + grilles,
  driver hatch + periscopes, wire cutter, intake vent, stern light boxes
  on the bumperettes.
- NOT TRANSPLANTED (station conflict, documented): the wave's skirt-bin
  course + flat-panel armorTile rows (the base's spaced side armor +
  donor ODS skirts own the flank); the wave's ramp taillight/hinge-drum
  variants (donor stern furniture owns those stations).
SPEC: base-side dims block restored and TRUED to today's instrument
(silhouettes 6.71 / 6.70 / 3.61 / 3.05 — gate actuals on the hybrid;
the pre-wave declared 6.64/3.24 rows predate the §5.229 instrument);
published 6.55/3.61/3.73 restored. Armor mirror stays the wave's
m2a2-family datum (already the honest envelope for this donor hull;
turret band matches the restored turret's class).
GATE (×2 bit-identical, md5 3a1734ba6f1e01594596151c5a88b3f4): min 0 —
LAWFUL CAP (m3a3_bradley_sipriv print does not assemble: parts-kit pose,
§E posed-bake queued since §5.263; curves are ref-side capped) — live
rows: dims 100, floaters 100. HASH: b0eb98a1 (60/55389) -> 2c5ce78c (64
meshes / 83507 verts). GUARD m2a2_bradley byte-identical a41410ac —
family distinctness survives (donor hull shared, turret/kit distinct).
track-clip --exact: front 0 / rear 0. §B2 sweep: worst whole-view 1095px
= certified-donor class (untouched m2a2 guard: 1045px); turret-isolated
peaks are the mesh rack's own apertures (intended see-through lattice).
EVIDENCE: §5.254 pairs shots/m3a3-hybrid/before/ (at b0eb98a1) + after/
(at 2c5ce78c), probe-r1.

## SKIRT-SYMMETRY ROUND (OWNER ORDER, 2026-08-17 — uncommitted lane)
ORDER (verbatim): "make m3a3 bradley sideskirts symmetric and properly
attached to sides of tank" (rear-quarter garage screenshot: flanks
asymmetric, panels standing off the hull with daylight above).

BASELINE FACT (§5.254 BEFORE, shots/m3a3-skirts/before/): the donor base
is print-asymmetric BY LAW for the m2a2 guard — right flank = full-length
11-slab ODS course (face 1.6455, tops 1.10) under the 1.79 appliqué band;
left flank = ONE deep plate ending z +1.30 with the BOW THIRD showing
naked wheels/hull (proc_hero-frontleft), plus open daylight wedges between
skirt tops and the sponson flare (the detached read). The m2a2 lattice is
untouchable, so the fix is m3a3-LOCAL in buildM3A3 (the §5.316 hybrid's
documented unreconciled seam, now closed).

THE COURSE (both sides IDENTICAL, mirrored): 8 uniform panels per side
(cuts -2.97..+3.11 every 0.76, §C end caps), outer face +-1.652 (6.5 mm
proud of the donor ODS face — no coplanar fight), hem 0.62 = the donor's
own §B9 wheel line (wheels read under the hem, m2a2 parity), tops 1.42
stepping to 1.25 on the bow pair at the fender line (real A3 grammar);
dark hinge-line seams on every joint; raked MOUNTING APRON per side
closing the skirt-top-to-flare daylight (outer edge buried in the panel
tops at +-1.649, inner edge 1.50/1.565 landing on the right flare slope /
tucking under the left flare's 1.62 corner). Aprons split around each
flank's own tall gear, which closes its own band (right exhaust z
0.975..1.925; left stern bag box z -2.52..-1.98). CFV blank flanks hold —
no port holes either side (§5.286). All new content |x| >= 1.4425, clear
of the 1.395 shoe reach (§B4); the thin seams are killed by the widthM
plan filter and widthM stays turret-owned at 3.61.

RECEIPTS: hash 2c5ce78c -> 3aaa636d (64 meshes held, verts 83507 ->
89327 = the 30 new course pieces). Track-clip strict: front 123 / rear 0
band + shoe 0/19 — BYTE-IDENTICAL to pure HEAD in the clean-room worktree
(the 123 front offender is the §5.316 hybrid's pre-existing debt; the
skirt work adds ZERO offenders — all pieces outboard of the lanes).
Gate ×2 bit-identical: min 0 | hull 0 whole 0 turret 0 stations 0 dims
100 floaters 100 — the lawful cap and dims/floaters HOLD exactly at the
baseline row. CLEAN-ROOM GUARD PROOF (live tree carries foreign lanes'
WIP that drifts marder/bmp3/m2a2 hashes): worktree at HEAD da6bd042 +
ONLY this lane's two files reproduces EVERY briefed guard hash (marder1a3
59cb105c, bmp3 8d9d7aa3, m2a2_bradley a41410ac, bmpt_terminator2
1c7d8fbc, bmp3_rok 7456de28, upior_ifv 3f16cb9a, spz_puma 73ee54e0, bmp2
8da8b75a) — this lane moves only upior + m3a3.
EVIDENCE: §5.254 pairs shots/m3a3-skirts/before/ + after/ (9 views each).

### §5.349 LANDING ADDENDUM (2026-08-17, §5.355 closeout)
The skirt-symmetry course above was PROMOTED into the SHARED family
grammar (`bradleyFlankDressing`, modern3.ts — all three Bradley
playables) by the follow-up §5.349 owner order, gaining the §B2
donor-bow closure + hanger/bolt hardware at every joint, and LANDED at
**3635217c** (§5.354 absorb). m3a3-local §B2 fill landed with it: the
**ring-slit cap** (m3a3(a)) — the 3.4 cm x 0.60 m deck-to-cradle slit
over the engine raise ([y 2.041, z 0.77..1.37] world, opens at yaw),
closed by a hull-owned raise cap (1.98..2.035), 2 cm under the swept
gun-cradle floor. Receipts at HEAD 1c0ba018: sweep worst-view
y0-side-l **4216→3728** px (banked shots/bradley-b2/, reproduced
exactly); hash **3aaa636d → 9c545ac0** (65 meshes / 94181 verts — the
+1 mesh is the fleet-wide §5.354 equipment-split class); track-clip
strict front 123 / rear 0 + shoe 0/19 BYTE-IDENTICAL to the donor debt
(the 123-front class documented above). Gate row: still the LAWFUL CAP
(min 0 — the print does not assemble, §5.248/§5.306; dims/floaters 100
convention unchanged). Family §5.356 coupling: see the m2a2 packet —
the anatomy-pivot regression (fixed by the §5.361 landing, 394da5ed)
moved the family turrets, not this course.

## M2A2-FOUNDATION TURRET + BRAT ROUND (OWNER ORDER, 2026-08-17)

ORDER: significantly rebuild the M3A3 turret from the M2A2's stronger
two-man foundation, then add materially denser equipment, roof weapons,
side ERA and upper-glacis ERA without changing the Bradley suspension or
introducing a second track course.

PRIMARY FORM: the former narrow wedge hidden behind a 1.35 m TOW cabinet
is replaced by a broad ring, deep welded two-man shell, continuous faceted
cheeks, full-width roof foundation and backed bustle. The compacted
left-hand twin TOW pod retains its root, trunnion, cradle, two mouths and
rear door, but is now visibly carried by the turret wall. The right stowage
wing is supported by its own broad shoe. The M242 saddle is wider and fully
buried between the cheek continuations.

A3 IDENTITY / EQUIPMENT: retained and re-seated CIV drum and ISU hood;
two structural hatch/cupola stations; shielded commander M2 and loader
M240 on distinct forward arcs; four roof service bins; radio pair; four-
tube smoke banks; spare links; jerry cans; deep filled four-rail bustle
rack and diagonal bustle braces. Non-armor fittings use equipment/fitting
ownership and cannot expand the armor receipt. All upper equipment follows
the turret through the 90-degree yaw battery.

PROTECTION: real destructible ERA clusters now occupy two turret-cheek
rows, two turret-side rows, a three-course backed upper-glacis field and
two full-length side courses. The existing eight-panel spaced side armor
is the physical backing; skirts, hangers, wheels and smart course are
preserved. Mirrored front-fender bridge plates return the first cassette
bays into the roof and close the donor's narrow plan slots without entering
the animated track sweep.

VERIFICATION: 14-view yaw-0 visual battery plus yaw-90 hero/top ownership
checks; standard census `mg2+11d`; plan contiguity `0` enclosed cells;
duplicate course `1/1 PASS`; exact strict clipping `0/0 + 0/0` for M3A3
and the M2A2 guard. Combat anatomy is regenerated from the final geometry.
The absolute source-comparison row remains the packet's existing lawful
zero: its registered comparison GLB was removed from the runtime repository,
so forcing a fresh geometry gate returns the Vite HTML fallback to GLTFLoader
and cannot produce a valid source score. That missing-oracle condition is
not treated as a procedural-geometry regression.

## 20-PERCENT TURRET HEIGHT CORRECTION (OWNER ORDER, 2026-08-17)

The complete M3A3 armored turret is shortened to `0.80` of its former height
about the unchanged ring datum. The welded shell, cheek continuations, roof,
cupolas, glazing, side beds and turret ERA scale as one structural assembly;
the M242 gun axis follows the same correction and remains buried in its
mantlet. Equipment keeps its authored proportions: TOW pod, CIV/ISU sights,
roof weapons, smoke banks, radios, service bins, bustle rack and stowage are
re-seated onto their corrected supports rather than vertically squashed.
