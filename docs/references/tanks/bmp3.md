# BMP-3 (`bmp3`) — NEW VEHICLE packet (§5.248 IFV wave)

**Exact vehicle modeled:** BMP-3, Russian Ground Forces fit — low boat hull
with the two-plane raked bow and stowed trim-vane roll, three bow crew
hatches (driver CENTER), REAR engine deck with twin long troop hatches and
rear door recesses in the stern plate, full-length sponson/fender band over
narrow tracks with FRONT idler + REAR drive sprocket (rear transmission),
low two-man turret with the 100 mm 2A70 + 30 mm 2A72 + PKT triple plant,
commander sight tower rear-left, 902V smoke banks, '331'.

## OWNERSHIP / ROUND STATE (2026-08-17, §5.248 IFV wave)
GROUND-UP NEW ID (owner order §5.248: ground-up print-measured builds for
the drop set — supersedes the donor-clone variantOf approach for these
subjects). Spec row lives in **src/vehicles/afvFamily.js** (full spec, the
local `ifvArmor` pack mirror); builder `buildBMP3` in
**src/vehicles/profiles/afvFamily.js** (AFV family module, joins the IFV
lane). The ROK-liveried donor-clone `bmp3_rok` remains a separate playable.
NATION: Russia (§5.249 ASK-OWNER default; the print's ROK livery noted).

## ORACLE STATE — REGISTERED `bmp3`
`public/models/community-candidates/bmp3_rok_42manako.glb` (CC-BY-NC,
LOCAL-ONLY quarantine, never ships; ATTRIBUTION §5.248 batch A). Fully
semantic print: hull-3/hull.001/hull-2 shells, turret.001, weapon2.001
(100 mm), weapon.001 (30 mm), interior buckets, per-wheel nodes.

### Instrument findings (this round, receipts in the gate JSONs)
1. **Node-name sanitization (fixed in all three maps + vertex REG):**
   GLTFLoader strips dots from node names (`turret.001` loads as
   `turret001`), so the onboarding row's dotted regexes never matched
   in-browser — the gate silently ran the fused-reference path (run-1
   report shape: components {whole, dims, floaters} only). Fixed with
   `\.?` regexes that match both pipelines.
2. **interior.001 pollution (fixed):** the print's crew-basket/interior
   bucket (x ±1.045, y 0.64..2.37) is hull-side in the file but rides the
   ring in reality — as hull content it wrote 2.4-2.6 m "hull" tops across
   the turret columns of every ref hull row. Registered as a
   `turretFollowers` row; the build authors the matching crew basket under
   the ring.
3. **Print stylization:** width-anchored frame reads hull mask 7.373
   (+3.3% vs published 7.14) — build authors the print's lines z-mapped
   ×0.9684 into the published envelope (pub-dims sovereignty; bmp2
   registration-law precedent).

## Corroborated dimensions (published)
| Measure | Value | Notes |
|---|---|---|
| Hull length | 7.14 m | overall = hull (IFV convention; print's own 2A70 muzzle overhang honored by the build) |
| Width | 3.23 m | print reads 3.229 as loaded (its anchor axis) |
| Height | 2.40 m | turret-roof datum; the print's sight stack reads 2.645 p95 (two-datum class, documented) |
| Weight | 18.7 t | |

## Round history (§K flow)
- MEASURE: docs/references/vertex/bmp3.json (extract) + gate ref columns.
- r1 honest baseline (broken instrument): whole 87.3 (fused path), dims 0.
- r2 (regex + follower fixes; components live): hull 48.1 / whole 47.1 /
  turret 23.1 / stations 9.7 / dims 0 / floaters 100.
- r3-r5 ladder: full-height side walls (the print's skirted-flank boat
  hull; front_hull mean 6.9% → fixed), stern §B2 void fill behind the
  engine deck, crew basket, crown re-cut to the 2.40 p95 datum, tip-band
  thickening for the 12% dims filter (the turret-whip-raised rough
  threshold documented), owner-c425f495 smoke-seat collars absorbed.
- Honest residuals: stations vs the print's tall sight stack (its 2.645
  p95 vs the published 2.40 datum — two-datum class); turret side rows pay
  the print's fused-stack columns.

## Guards
bmp2 / m2a2_bradley resident hashes byte-held (8da8b75a / a41410ac at
round close); shared-file edits are additive rows only.

## CLOSE (×2 bit-identical, 2026-08-17)
  min 31.9 | hull 61.6 whole 50.8 turret 31.9 stations 57.8 dims 100 floaters 100
Arc: min 0 (broken instrument) → 31.9 with dims 0 → 100 (width-guard
fitting fix + p95 cluster discipline + gun at the published flush datum),
stations 15.3 → 57.8 (§C sub-slab-pitch bins), hull 48.1 → 61.6.
Geometry hash 417526e2 (63 meshes / 72114 verts). Floor: turretCurves
31.9 = the print's fused sight-stack columns + basket-follower band
(documented cap candidates for the §E lane).

## §E EXECUTED — batch 65 (2026-08-17, §5.248 §E round; frame-pin law)
The fused-sight-stack cap RELEASED (repair_oracles.py batch 65,
node-scoped y-warp on turret.001 + the lens node). Census: the stack
cluster reads gate 2.44..2.85 (raw x 0.49..1.09); a thin fused whip owns
the model max-y at gate 3.48. FRAME-PIN LAW RECEIPT (k2 batch-56 class):
the first candidate compressed the whip too and CRATERED every row (hull
62.7->46.8, turret 36.6->23.2 — max-y re-frames every court; receipt
scratchpad e-round/bmp3-cand-sim.json). The landed map compresses ONLY
the 2.28..2.755 stack band to the published datum (2.851 -> 2.42) and
PINS the whip tip exactly (raw 3.366 -> 3.366). hatch5.001 (gate 2.455
lid, 5cm proud) is not the stack and stays. Receipts: .bak = pristine
def74f6e…, output c20e0afe… byte-idempotent ×2; landed bytes == sim
candidate; census (2, 1735, 1318). SIM == OFFICIAL GATE ×2 BIT-IDENTICAL:
min 36.6 -> **39.8** — hull 62.7 EXACT HOLD (frame pinned), turret
36.6->39.8, stations 61.4->73.0 (+11.6), whole 52.4->55.4, dims 100 HELD,
floaters 100 HELD. The basket-follower band residual stays the next
turret-row rung (family lane).

## §5.269 FIX ROUND (critic 6.4 -> ordered fixes, 2026-08-17)
ORDERED + DONE: §B9 gear visibility (the round-1 full-height flank wall was
an AABB misread — open bays + shallow sponson band per the print's own
close-wheels sheet, all six wheels + idler + sprocket exposed); two-plane
raked boat bow + trim-vane roll on the break line (the near-vertical tip
slab is dead — the raked lip still anchors hullLengthM); commander sight
rebuilt as the LOW ROUNDED POT under the 2.42 p95 line; 902V banks enlarged
on visible collar seats; stern door relief (hinge lines, waterjet outlet
covers, grille band, taillights). §B4 swept clean (flaps outboard of the
1.504 shoe plane, stern plate split around the sprocket wrap, band bins
outboard of the track pins): track-clip 0/0/0 strict.
CLOSE (×2 bit-identical): min 36.6 | hull 62.7 whole 52.4 turret 36.6
stations 61.4 dims 100 floaters 100 — every component >= the round-1 base
(61.6/50.8/31.9/57.8/100/100). Hash 310b7f2e (63 meshes / 64914 verts).
