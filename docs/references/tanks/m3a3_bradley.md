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
solid is authored fresh. Spec: full row in src/vehicles/afvFamily.js;
builder `buildM3A3` in src/vehicles/profiles/afvFamily.js. m2a2_bradley
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
