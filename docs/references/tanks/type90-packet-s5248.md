# type90 — §5.248 GROUND-UP REBUILD PACKET (japan wave, 2026-08-17)

## Order
§5.248 owner order ("completely redesign ... exact geometric comparison with
the 3d models ... leclerc highest standards") applied to the JAPAN lane.
Scope: type90 + type10 (stb1 OUT — owner's own 5a9c28ef rebuild).

## Instruments (§5.251 restore receipts)
- Certified oracle RESTORED from history: `git show '952561ea^:...' >`
  public/models/tanks/community/recovered/type90.glb — md5 **fcfeb38a**
  = the 49-v2 owner-ratified bytes (§5.39 "the REAL lines govern": roof
  2.34 / ridge 2.44-2.53 / sight head 2.60). Loads + renders via the
  gate/fidelity board (gate rows populated; .bak untouched).
- Fresh vertex decode (this round): docs/references/vertex/type90.json —
  bodyH 2.55 (vs pubDims 2.34 = the §5.73-1 kit envelope), bodyLen 7.428
  (-0.3%), hullMask 7.449 (0%), overall 9.759 (0%), width 3.404 (-0.8%).
  The print is measurement-clean against published dims.
- §5.248 drop type90_42manako.glb = CC-BY-NC (ATTRIBUTION batch B):
  measurement/influence ONLY — used as a visual cross-check, never gated.
- Registration rows verified mirrored across vertex-extract /
  procedural-fidelity / visual-evaluator / tmp-tank-critic (recovered path,
  ^Turret$, autoPivot, yaw -PI/2). No drift.

## What the rebuild is (src/vehicles/profiles/misc.js buildType90)
The 2026-08-12 owner height order (0.80 local-Y turret compression +
compressed-frame roof re-kit + cupola M2) is RETIRED this round — §5.248's
later "exact geometric comparison" order selects the certified print lines,
which are themselves the §5.39 owner-ratified REAL lines. Rebuilt to the
datum-round measured configuration (§5.77 receipts) and improved past it:
- Turret at the real proportions: walls 1.43..2.13, extension 2.21, roof
  plane 2.34, crown band 2.395-2.53 (cupola ring/lid/vision blocks, loader
  dome, sight housing runs), commander tower to 2.60, §B7 bore line 1.82,
  France-round mantlet grammar (flat-face plate + bellows + trunnion
  tapers + recoil drum + MRS plate + §B3.1 muzzle bore), M2 on the low
  right swing mount (type10 M2-height law), 2x3 smoke banks, corner whips
  h 0.70 + REAL ANTENNA MASTS (8x42x14 cm posts — see receipts).
- NEW past the datum round (fresh-trace chases, world frame):
  - BUSTLE TAIL BLOCK: rising underside 1.61@-1.905 -> 1.80@-2.24 closing
    the wall to the roof plane (§B1/§B2) — the 49-v2 warp lifted the
    print's fused basket floor; the flat 1.43 wall bottom was paying
    0.11-0.24 on four cols. Wall plan rear pulled -2.11 -> -1.705 local.
  - Basket re-laid to the v2 lines: floor rails 1.58/1.82, stepped cargo
    (1.62/1.80 bottoms), mesh 1.81..2.19, posts spanning rail-to-rail,
    frame bars extended fwd to z_w -1.88 (top 2.533).
  - Sight-housing FORWARD RUN (top 2.505, z_w 0.44..0.68) — the v2 ridge
    band continues ahead of the tower.
  - STRICT TRACK-CORRIDOR RECONCILE: lanes xc 1.2615 / trackW 0.534
    (shoe faces 0.9715/1.5515, band 0.9945/1.5285) so the deep skirts
    return INSIDE the print's station cadence with §B4 clearance off the
    covered-top band: MID courses outer 1.601 (stations 3.202 vs ref
    3.187), AMIDSHIPS inset outer 1.5645 (3.129 vs 3.093), per-zone seams
    on their own planes, courses/filler re-cut so end-caps land in the
    print's alternating 3.187/3.093 slab cadence (END-CAP law).

## Gate ladder (honest, ×2 at close)
| state | min | hull/whole/turret/stations/dims/floaters |
|---|---|---|
| BASELINE (08-12 compressed turret, this tree) | **35.1** | 88.5/55.6/42.5/35.1/78.5/100 |
| restore print-lines turret | 59.8 | 88.5/85.2/76.6/59.8/100/100 |
| lane narrow v1 (xc 1.245) | 76.6 | 84.7/84.3/76.6/85.7/100/100 |
| station cadence + ±0.98 shoe fix | 77.1 | 88.5/82.7/77.1/87.5/100/100 |
| whip/finial + tail block + basket raise | 80.6-82.5 | ... |
| **FINAL ×2 BIT-IDENTICAL** | **83.9** | **88.5/86.4/83.9/87.5/100/100** |
Row-JSON md5 **854ff6e2** both runs. Hash **43179448** (53 meshes /
64039 verts) ×2. Beats the datum-round record (79.5) and the §5.77-era
per-row bests everywhere except stations (93.8 then — the §B4-legal skirt
world differs; receipts below).

## Reverted / priced experiments (receipts)
- xc 1.245 / trackW 0.53 lane cut: inner shoe face 0.968 bled the ±0.94
  front cols the print keeps for skirt/tub (0.27 x4 measured) — re-laid at
  0.9715 exact.
- 5 cm whip-tip finial: whatsat proved presence; the 1024 trace still read
  the 2.13 rail (AA-threshold class). 30 cm bisect probe painted (score
  82.36, cover +0.8) — reverted; landed as the 8x14 cm real mast post.
- The certified ±1.60 ground-reach front col pair is CEDED to the deep
  skirt (hem 0.608): ~0.31 x2, bought +24 stations (59.8 -> 87.5 class).

## Certified residuals at 83.9 (nothing uncounted)
- turret_side 83.9 binds: chin-band warp-stretch cols z_w 2.1..2.6
  (0.065-0.126 x4 — §E chin-knee revision filed since §5.57, out of lane);
  hood front-edge cliff-lerp col 1.356 (0.098, measured see-saw vs col
  1.313); -2.40 mast col residual 0.03-0.13 (ref roll, law-4 flicker);
  small housing cols 0.05 x2.
- stations 87.5: inset-plane §B4 floor (band outer 1.5285 + 1.5 cm
  clearance caps the inset at 1.5445 vs the ref's 1.5465 line — wPct
  1.1-1.4 x4 slabs); i3 3.223 attribution open (~1 col class).
- side/front smalls: ±1.60 skirt cede (above), mirror counterweight col
  (§A price, r5b-certified), rear-anchor col (hullLengthM-pinned).
- dims 100 ×2 (heightM 2.528/0.85%, hull 7.404/0.62%, overall 9.823/0.65%,
  width 3.44/0.3%); floaters 100 ×2.

## §B battery (final bytes)
track-clip --exact --strict **0/0 band + 0/0 shoe + 0/0 sweep**;
turret-parent **0/0/0**; winding m1 rev 0 / mix 0 / deficit 0px, m2 clean;
standard-check clip ✓ contig 0 ✓ census mg1+5d ✓; §B3.1 bore + mantlet ✓;
§B5 yaw-90 pair captured (turret+kit rotate as one — see evidence).

## Evidence
- before/ (pre-edit tree): shots/japan-wave/before/type90/ (16 views)
- after/: shots/japan-wave/after/type90/ (16) + type90-yaw90/ (16)
- §5.254 check: before/after PNGs differ (md5-verified on
  front/left/top/hero).

## Owner-landing absorb (5ed4d73c japan.ts, §5.278 protocol)
Owner intents read from the diff: longer whip antennas (absorbed — masts +
h 0.70 whips + finials keep tall antenna presence), winding-corrected
mirrored slabs (absorbed by construction — orientedSlab bound throughout),
prominent terminal wheels (SUPERSEDED for type90 by print receipts: the
certified print carries small high end wheels, r 0.19/0.14 class — the
lane keeps the measured lines), stb1 lathe/searchlight changes (stb1-only,
out of scope).

## Orchestrator items
1. The 2026-08-12 "turret 50% taller" owner order is retired by this
   §5.248 print-parity rebuild (35.1 -> 83.9). If the owner still wants
   the taller garage read over print parity, that is a §B7 re-ruling —
   flag for confirmation.
2. type90 spec remains donor-made from type10 (userdrops5 make row) —
   armor FRAME is donor-cloned (china §5.258 class); dims rows are
   ratified. Armor-frame refit out of scope.
3. The i3 station 3.223 attribution (one ~1% slab) left open.
4. type90a variant inherits the rebuilt base + adds its package
   (builds clean, hash 92e93b30); its package seats were tuned against
   the 08-12 compressed turret — variant re-seat round suggested.
