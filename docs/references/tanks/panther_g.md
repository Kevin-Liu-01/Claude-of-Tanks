# Panther Ausf. G (`panther_g`) — photo-class packet

**Exact variant modeled:** Panther Ausf. G, late 1944 (ambush-scheme era,
zimmerit discontinued — spec carries `scheme:'ambush'`, no zimmerit):
one full-width 55° glacis with NO driver visor (roof periscopes + right
Kugelblende ball MG), 29° sloped sponson sides over the interleaved
8-axle Schachtellaufwerk, 30° UNDERCUT rear plate carrying the twin
shrouded exhaust stacks with Flammvernichter tips + two Gepäckkasten
bins + vertical 20t jack, schürzen course ending at the last roadwheel,
rolling-pin (chin-less) mantlet on the narrow-front trapezoid turret,
cast cupola LEFT with AA ring + MG34, rear-wall round escape hatch.

## ORACLE STATE
**NO reference oracle** (MODEL_SOURCE `procedural`, no
procedural-fidelity override row, no ledger/gate JSON, no GLB on disk —
the 'panther' hits in models/ are the K2 Black Panther + KF51 Panther,
different vehicles). **FALSE-0 LAW: never gate.** Bar = PHOTO-CLASS
FLOW (14-view rig + §B battery + published dims). Live builder:
tankFactory.js core map `buildPanther` (verified: NO profile override
exists in PROFILED_BUILDERS; §5.247 lane brief confirmed).

## Corroborated dimensions (photo-class targets = spec dims)

| Measure | Value | Anchor in build |
|---|---|---|
| Hull length | 6.87 m | shoe run z ±3.435 EXACT (sprocket 2.90+0.36+0.175 / idler 2.91+0.35+0.175) |
| Overall (gun fwd) | 8.86 m | muzzle +5.425 over the -3.435 tail (bore disc at 5.1665) |
| Width | 3.42 m | track outer faces ±1.71 EXACT (armor-married; see width residual) |
| Height | 2.99 m | cupola crest ~2.975 (lid seam) |
| Gun | KwK 42 L/70, visible run 5.175 m | 'double' flat-drum brake + §B3.1 bore; armor 5.25 shadow-proxy delta 0.075 flagged |
| Gear | 8 interleaved axles (2 painted rows), sprocket 0.55/r0.36 F, idler 0.50/r0.35 R | §B6 |

## §5.247 FULL REDESIGN (2026-08-17, ww2 lane — r9 lineage)

Baseline (r8 world): generic frustum hull with stepped glacis wings,
EMPTY deck, pinched-box turret (top ±0.50, rear overhanging the armor
line by 0.35 m), ball-capped pin mantlet reading as a sphere, skirts
floating at ±1.82 with an air band, shoe run overshooting to +3.485
(hull 6.94), muzzle +5.50 (8.94), census mg0+0d, clip --exact 2/4 band
+ 12/12 shoe (auto AO wall).

### Gap table closure
| # | Photo read | Was | Now |
|---|---|---|---|
| 1 | dims | 6.94 hull / 8.94 overall | 6.87 / 8.86 EXACT (shoe anchors + gun 5.175) |
| 2 | one-plane 55° glacis, no visor | 3-piece frustum + wing steps | single plane ±1.49->±1.32 with the real notched corners over the fenders (center strip ±1.02 to the toe), weld seams, proper Kugelblende + collar + rain strip, roof periscope pair, crew hatch discs |
| 3 | 29° sponson sides | frustum + shoulder boxes | armor-married slabs 1.70@1.17 -> 1.32@1.85, front edges following the glacis joint diagonally, sponson end caps closing the tail (§B2) |
| 4 | 30° undercut rear w/ furniture | bare slope, floating pipes | two coplanar slabs (constant ±1.02 through the idler window — §B4 receipt), shrouded stacks + dark tips, 2 bins, vertical jack + block, tow horns + pins, convoy light, crank port, mudflaps, soot |
| 5 | turret trapezoid | pinched box, rear -1.35W | armor-true loft: base ±0.95/-0.67 -> front ±0.60/0.97W(0.72 world), roof ±0.62..±0.44 at 0.75, 12° front, 6° rear lean; roof lip; ring debris collar |
| 6 | rolling-pin mantlet | pin + sphere caps = ball read | full-width r0.30 cylX ±0.60, FLAT dark disc ends, half-embedded in the face, cast bore collar, TZF12a left, coax right |
| 7 | cupola + census MG | tiny generic drum, mg0 | cast drum (-0.27,-0.35), 7 hoods, AA rail torus + FITTINGS.pintleMG 'mag' two-tone low on the ring (tiger fitting-sink precedent) |
| 8 | rear escape hatch | missing | round proud disc + seam ring + hinge + handle on the 6° wall |
| 9 | schürzen | 6 floaters at ±1.82, air band above | hanger rail + 6 plates tight to the pannier lip, course 2.60..-2.52 (ends at the last roadwheel like the photo class); missing #5 right + OUTWARD-bent #3 left kept |
| 10 | deck | EMPTY | full G grammar: engine hatch + hinges/handle, fan ring + cross slats per side, 2 louvre fields per side, fillers, roof-edge weld seams, lift eyes x4 |
| 11 | gear read | inner row dark/sparse | layers [0.15/0.03] both painted, 16-bolt dished faces; corrected orbits |
| 12 | tools/fittings | 1 cable + 2 boxes | cleaning tube + clamps, shovel, axe, crank (on the 29° planes, rz-rotated), cable runs + shackles/clamps, spare-link mats x2 (FITTINGS), antennaWhip (top 2.975 <= crest), stowage + tarp |
| 13 | AO-wall clip | band 2/4 + shoe 12/12 | tiger-precedent re-authored walls ±2.45 (outside both wrap windows) -> 0/0 |
| 14 | markings | crosses on air | crosses pinned to the skirt faces (1.768), '435' on the leaning walls (rz ±0.415) |

### §B4/strict-sweep receipts (the round's law discoveries)
1. **GLACIS-WING ORBIT CLASS:** a full-width glacis foot dipping below
   the fender line enters the sprocket wrap window (measured 66 band +
   77 shoe voxels). Fix: full-width sheet stops at the fender line;
   only the ±1.02 center strip (inboard of the 1.05 lane) descends.
2. **REAR-PLATE TAPER SLIVER:** the undercut plate's upward widening
   crossed x1.05 inside the idler window (12 voxels). Fix: constant
   ±1.02 through y0.96, taper above.
3. **SHOE-SWEEP ENVELOPE LAW (strict):** the audited moving-shoe
   envelope reaches x ±1.732 — 22 mm past the ±1.71 band face. A rigid
   skirt on the armor's 1.72 spaced plane is physically inside the
   sweep (measured 1295/12 strict). The course hangs at inner face
   1.745; the wear-bent plate needs a BASE offset (bent*0.4 outboard),
   not just roll — either roll sign swings an edge back into the sweep
   (measured 23 -> 25 -> 0).

### WIDTH RESIDUAL (armor true-up queued, §E lane)
armor track boxes span 1.05..1.71 = 3.42 over tracks (the published
width), but the REAL vehicle is 3.27 over tracks / 3.42 over skirts.
With visual tracks armor-married and the shoe sweep at 1.732, the skirt
course is FORCED to 3.53 (+3.2% over published; the r8 baseline sat at
3.64). A future armor true-up to the real 3.27 gauge would let the
skirts land exactly on 3.42. Flagged for the orchestrator/§E lane —
dims-affecting, not coverable by a cap.

### Close battery (final state, x2 bit-identity)
- track-clip --exact --strict x2: **0/0 band + 0/0 shoe + 0/0 strict
  sweep, both runs identical** (from 2/4+12/12 baseline).
- tank-standard-check x2: clip ✓ / contig 0 ✓ / decor **mg1+3d** ✓
  (from mg0+0d ✗), both runs identical.
- turret-parent: stranded 0 / abutting 1 (hullCloth AABB touch at the
  casting-envelope rear corner — static deck tarp/stowage beside the
  bustle, yaw-90 pixel disproof at
  shots/ww2-wave/panther_g-final-yaw90) / dangling 0.
- npm test: exit 0.
- Geometry hash (NOT a freeze): **d44cf526 (48 / 70150)**, identical
  across two full runs; 14-view boards x2 bit-identical (16/16 pngs
  md5-equal: shots/ww2-wave/panther_g-final-A == -final-B).
- §B3.1 muzzle evidence: muzzle-endon/oblique crops (rear drum / dark
  slot / front drum / collar / bore) in every board dir.

### 14-view SELF-READS (builder estimates, not verdicts — critic is the bar)
front 8.7 / frontleft 8.8 / left 8.8 / rearleft 8.7 / rear 8.7 /
rearright 8.7 / right 8.8 / frontright 8.7 / top 8.8 / hero-fl 8.8 /
hero-rr 8.7 / hero-toptilt 8.8 / close-front 8.7 / close-roof 8.8.
**Floor 8.7.** Weakest named reads: cupola drum a touch tall vs the
cast photo class; fender front sections carry the real underside air
but no support stays; the G's sloped sponson floor is simplified flat
(§B4: the certified track crest 1.165 owns that line — residual).

### Evidence
shots/ww2-wave/panther_g-before (r8 baseline), panther_g-r9draft
(+yaw90, pre-§B4-fix receipts), panther_g-r9 (mid), panther_g-final-A
+ -final-B (bit-identity pair), panther_g-final-yaw90 (§B5 pair).

### Residuals / next-round candidates
- Cupola: dedicated cast-profile lathe (squat dome + hood ring) is a
  kit.js lane candidate.
- Fender support stays (thin diagonals under the front fender tips).
- NO ORACLE: §E re-source lane open (no licensed community Panther GLB
  seen in the drops — provenance check due if one lands).
- armor gunBarrel.lengthM 5.25 vs built 5.175 visible run
  (shadow-proxy true-up, orchestrator lane — t34_85 precedent).
