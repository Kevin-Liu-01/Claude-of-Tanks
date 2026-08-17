# ariete-MBT round packet (§5.322 owner order) — UNCOMMITTED-UNSTAGED delivery

OWNER ORDER (verbatim): "for the ariete c1 and c2, add machine guns and make
the turrets hulls and tracks so much better and more MBT like"

Base: §5.313 sloped state (c1 49c15299 49/64151, c2 b0b3c184 51/68699), slopes KEPT.
Surface: src/vehicles/profiles/italy.js ONLY (buildArieteMk + branches; 28 s5322 markers).
Final hashes: **ariete_c1 4e04e814 (51/74855)** · **ariete_c2 2703f8d0 (53/80843)**.
Guards: **carro45t 9fa68918 EXACT** · **donor ariete 43e126e8 EXACT** (hashgeo, same run).

## §1 MACHINE GUNS (order item 1)
- **Coax MG 42/59 (s5322-A1)**: real aperture right of the 120mm — armored
  collar ring at the mantlet block face + recessed dark throat + stub barrel
  + booster cap. GUN-BUCKETED (addGunExtra*) so the coax ELEVATES with the
  gun (§B5/§B3.1). Protrusion budget measured ×3: 0.30-proud rod −0.67
  plan_turret, 0.16-proud −0.38, final ≤0.06-proud port read −0.13 raw
  (component-invisible) — §5.290 receipts banked.
- **Commander's MG 42/59 (s5322-A2)**: CENSUS pintleMG at the TURMS-station
  cupola front-right rim, stowed forward alongside the TURMS housing —
  §5.265 stowed doctrine; the mass nests under the certified pano-2.47 /
  TURMS-2.46 side columns; top 2.395 < the 2.45 p95 datum (dims-100 seat).
  Two rejected seats measured (aft sweep, hatch-band sweep) — receipts in
  the round transcript.
- **Loader's MG 42/59 (s5322-A3)**: kept at the certified left-ring stowed
  seat both marks (ring-rim re-seat experiment measured and reverted w/
  receipt).
- §B3 census: **mg2+4d (c1) / mg2+5d (c2)** — machine-checked.

## §2 TURRETS (order item 2 — density at the leclerc bar)
- §5.283 debts folded: **rack-end caps** (s5322-B1 — cap plates + dark end
  faces INSIDE the certified −2.58 rail envelope; the brief's "−3.0" is the
  REF frame: extending the run to build-frame −3.0 walked past the
  z-compressed print's own rail end, plan_turret 63.4→48.7 + st1 11.2 —
  measured, REVERTED, receipt banked).
- **Bustle cargo (s5322-B2)**: two more lashed bundles (right item clamped
  inside the ±1.13 bustle plan after a measured 1.17 overflow receipt) +
  4 lash straps on the bundle faces.
- **Cheek lifting lugs (s5322-B3)**: leaned D-rings + seat plates ×2 per
  cheek flush with the §5.299 climbing face line.
- **Cable conduits (s5322-B4)**: bustle→cheek runs + junction/feed boxes
  riding the wall-top shoulder INBOARD of the plan outline (first wall-face
  seat measured −0.8 turret and re-seated; receipt).
- **Wind sensor (s5322-B5)**: T-crossbar + vane + drum at the mast tip,
  flush with the rod's certified line (whip-rough law: zero new height).
- **TURMS + pano realized (s5322-B6)**: hood cheeks, lens sill, wiper on
  the TURMS pane; brow hood, face frames, wiper on the pano — all under the
  2.46/2.47 datum carriers, z-flush with certified faces.
- **GALIX verified reading (s5322-B7)**: dark backing plates behind both
  banks (ref's own ±1.31–1.40 plan band) — tubes read against dark at yaw.
- **Antenna bases (s5322-B8)**: tuner feed boxes + coiled cable loops at
  both whip stations, nested under the certified base-drum columns.

## §3 HULLS (order item 3)
- **Skirts (s5322-C1)**: c1 → the real C1's SEVEN-section front-half run
  (0.50 pitch < 0.54 station slab, prism law); c2 keeps its 13-panel AMV
  run — c1≠c2 preserved. Per-panel hinge straps (rail→panel at every
  interior seam) + twin face bolts BOTH marks; everything ≤ |x| 1.799
  (WIDTH GUARD 1.80 honored).
- **Rear-sponson louvre bands (§5.283 debt, s5322-C2)**: recessed dark
  intake fields flush with both wall faces + 6-rib cadence (0.004 proud —
  plan_hull byte-clean).
- **Woven glacis grille band (§5.283 debt, s5322-C3)**: dark field + 3×5
  crossing weave strips riding the §5.299 raked plane A (pitch 0.0638,
  tops ≤ surface+0.020) — clear of the c2 add-on rows (z ≥ 2.04).
- **Headlight brush guards (§5.283 debt, s5322-C4)**: verticals + hoop +
  stays over both pods; thin low kit also armors the razor-margin bow
  anchor columns.
- **Bow tow shackles (s5322-C5)**: D-bows + clamp blocks stowed FLAT on the
  nose plate above the certified eyes (first leaned seat floated in pixels —
  caught in the after-shots, re-stowed; receipt).
- **Fender lines (s5322-C6)**: dark shadow lines under both sponson crests
  (outer face flush after a measured front-corner nick receipt).
- **Exhaust depth (s5322-C7)**: 4-rib louvre cadence proud of both recessed
  dark throats, inside the pod envelopes.
- **Rear furniture (s5322-C8)**: convoy plate, center tow hitch + pin,
  taillight guard frames, mud-flap hinge strips — all inside the certified
  −3.47/−3.79 rear extremes.

## §4 TRACKS / RUNNING GEAR (order item 4 — §B6/§B9)
- **s5322-D**: §5.262 gearFloor/tireHex law applied — dishR 0.82 opens a
  real rubber rim; wheelHex 0x3d4433 lifted-olive dish vs tireHex 0x242522
  dark tire so the factory hub/cap/bolt contrast set reads in skirt shade
  (both cfg clones re-attach the family ambient-floor hook; the shoe-pad
  hook is unconditional at tankFactory ~1456). Radius/stations byte-held —
  contact/ramp/wrap tangents unchanged. Toothed sprocket carrier + bolt
  ring, idler hardware, wrap pads + guide horns over both end wheels are
  factory-standard and verified in the after pixels (close-front/view-left).
- Track containment: **--exact --strict 0/0 front/rear + shoe 0/0 + sweep
  0/0 BOTH marks**.

## GATES / AUDITS (final bytes, clean-HEAD worktree instrument)
- **ariete_c1 ×2 BIT-IDENTICAL: min 39.6 | hull 46.6 | whole 39.6 | turret
  62.5 | stations 85.8 (+0.6 IMPROVED) | dims 100 | floaters 100** —
  hold-or-improve vs the 39.6 floor satisfied; dims 100 HOLDS. Raw ledger:
  plan/front rows EXACT-zero delta, side_hull −0.011, side_whole −0.048
  (39.558 raw — the coax/MG exchange, documented), turret side +0.001,
  turret plan −0.134.
- **ariete_c2: NO GATE BY DESIGN** (never gated; no row written).
- §B2 holes 0 both · §B4 0/0 strict both · §B5 turret-parent delta ZERO
  (baseline reproduces the identical pre-existing adjudicated set 5/0/0 +
  6/1/0; all new turret kit turretG-parented, coax gun-bucketed) · npm test
  exit 0 (&&-gated) ×2.
- **INSTRUMENT INCIDENT (documented)**: mid-round, the live tree's gate
  reads went polluted by other lanes' uncommitted churn (untouched guard
  carro45t reproduced hull 91→89.9 / stations 89.2→88.3 live while its
  bytes held 9fa68918; ariete_c1 read 36 deterministically live). All
  verdicts re-derived in a clean-HEAD worktree (HEAD da6bd042 + only my
  italy.js), where BOTH certified baselines reproduced EXACTLY before my
  file was measured. Live ledger repaired: carro45t row restored
  HEAD-verbatim, ariete_c1 row = the tool-written ×2 row; ariete_c1.json
  ported from the certified worktree run.
- §5.254 pairs: shots/ariete-mbt/{before,after}-{c1,c2} (15 pairs each,
  zero console errors; before captured at the landed bytes BEFORE any edit,
  after at the final bytes; byte-distinct as required on changed ids).

## RESIDUALS / NOTES for the re-cert sitting
- The pale ring pair visible past the bow edge in high-rear views = the
  CERTIFIED bow tow eyes (present identically in before-shots).
- The 39.6 wholeCurves cap remains the documented §5.283 z-compression
  structural residual (§E z-warp recipe still queued) — not a round defect.
- tools/tmp-ariete-mbt-critic.html + tmp-ariete-mbt-shots.mjs are this
  round's pinned harness copies (delete after the sitting).
