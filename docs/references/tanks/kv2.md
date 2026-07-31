# KV-2 — reference packet

Soviet 1940 breakthrough heavy: the towering slab. Signature cues: enormous
near-rectangular MT-1 turret (~half the vehicle height) with vertical sides
and a chamfered front-top, short fat 152 mm M-10T howitzer in a boxy mantlet
barely clearing the bow, KV hull with stepped driver plate, 6 road wheels +
return rollers, long flat fenders.

## Real dimensions (2+ sources)
- Wikipedia (https://en.wikipedia.org/wiki/KV-2): length 6.67 m (no gun
  overhang worth noting), width 3.35 m, height 3.25 m, 52 t, 152 mm M-10T
  "housed in an enormous turret".
- Tank Encyclopedia (https://tanks-encyclopedia.com/ww2/soviet/soviet_kv2.php):
  KV-2 1940, MT-1 turret, 152 mm M-10T L/24, ~52 t, 3.25 m tall.
- Game spec `specs.js kv2.dims`: hull 6.95, overall 6.95, w 3.32, h 3.25.

## GLB oracle
`/models/tanks/community/kv2-full-comrade1280.glb` (Comrade1280, CC-BY 4.0).
Gun fused into the turret mesh; hull-centered-ish by the loader (tiny gun
overhang), turret yaw articulates.

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −3.58..+3.25 (len 6.84); roof 1.55 rear → 1.61-1.72 deck →
  1.65 forward, bow steps 1.57→1.37→1.30 (stepped KV driver plate/nose
  shelf); plan full width 3.31 the whole length.
- front widths at y .35→1.3: 3.31-3.27 (full-width tracks+fenders), 2.62 at
  y1.6 (deck furniture), then the turret slab: CONSTANT 1.88 from y1.9 to 2.8.
- turret: slab z −0.9..+1.55 (rear handrail bit to −1.4), top 3.12 with a
  3.27 periscope spike near z +0.7, base y 1.67, front-top chamfer + mantlet
  step at z +1.5..+1.9 (station 2.13..2.77).
- gun: muzzle +3.60 ⇒ only 0.35 m past the bow; tube y 2.44-2.69
  (axis ≈2.57, Ø≈0.23 — the fat 152 mm howitzer).
- whole len 7.19, top 3.27.

## Build notes
Slab turret is 1.88 wide (much narrower than the 2.55 the generic profile
used), 1.45 tall, 2.45 deep, vertical sides. Gun is a stubby fat tube from a
boxy mantlet. Hull keeps KV return rollers (3) above the 6 wheels.

## Final fidelity (2026-07-30)
70.7 → 90.0 (H93 T85 G89 R88; overall ≈89.3). Key discoveries: the oracle's
centre deck around the turret well is LOW (~1.45) with raised outboard
sponson decks, and its slab skirt drops into that well; its howitzer mask is
Ø0.23 at axis 2.57 with only 0.35 m of bow overhang. Turret sides cap ~82 on
the mantlet-chin region.

## Shaded-parity r2 (2026-07-30)
90.0 → 90.2 — passes the 90/90 gate (H92 T85 G89 R88). Surface pass:
round BOLTED mantlet disc + stepped sleeve + fixed aperture collar (the r1
boxed recess that swallowed the howitzer at depression is gone — sealed
through −5/+12° in the articulation strip); ~65 dark rivet studs along every
turret plate seam; side vision slits; rear door MG ball + stub; second roof
periscope + hatch seams; bow driver visor + hull MG ball + both draped tow
cables w/ shackles; fender gusset struts; hull handrails (held inside the
3.31 width anchor); engine-deck mesh intakes + round hatch; twin tail
exhausts; headlight + horn moved to the left fender; dark wheel-face
contrast on wheels + rollers. Mismatch log: tail exhausts must stay flush
with the tail-plate face (−3.655) — extending the hull z-bound shifted the
gun-overhang crop (−2 G, reverted). Track tone is the shared family material
(gunmetal darkening would need a materials.js change — out of scope).

r4 verification (2026-07-31): no geometry changes this round. Re-verified 90.2 (H92 T85 G89
R88, minView 88.8) after the sovGear signature change — no regression.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 58.3 whole 40.2 turret 26.6 stations 65.1 dims 94.4 floaters 100
Dims vs published: heightM 3.28 hullL 6.83 overall 6.92 width 3.34 - all within 1.7% of published.
Oracle audit (v6 true cameras, width-normalized frame): closest print in the family (all dims within 3%); its turret face reaches ~0.3 further forward and the roof band tops ~3.17 vs published 3.25.
Certified oracle-defect caps (component | ceiling | cause):
- turretCurves | ceiling ~27-45 | hull-frame registration exposes the print's turret seat: its slab face/rear proportions differ ~0.2-0.5 m from the published-height rebuild (slab re-based on the ring deck this round: 10.9 -> 26.6)
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 66.1 whole 61.1 turret 74.4 stations 84.1 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 3.27/3.25 (0.55%) hullLengthM 6.89/6.95 (0.82%) overallLengthM 6.97/6.95 (0.27%) widthM 3.31/3.32 (0.2%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 3.172 vs pub 3.25 (-2.4%), bodyLen 6.799 vs 6.95 (-2.2%)
Cap verdict: HONEST ORACLE — no cap; driven by iteration: min 26.6 -> 61.1 (turret 26.6 -> 74.4, stations 65.1 -> 84.1, dims 94.4 -> 100)
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.

v10 measurement mechanics established this round (probe-verified, family-wide):
- Column band = top minus bottom INCLUDING GAPS: any furniture that shares a side-view
  column with the gun tube reads as body for hullLengthM no matter how thin it is.
  The measured bow/tail anchors must be planned around the gun's shadow (t90a read
  7.00 from idler-wrap-under-gun + drums-over-rear-rake; both ends re-planned).
- safeScale guard: the track BAND extends ~0.04 past trackW/2 - kv2's committed width
  was 3.39 vs spec 3.32 and safeScale 0.979 silently shrank every authored dimension
  2.1%. Real width must equal spec width exactly at a solid >=0.35m-band element.
- heightM p95 spike budget: at most ~4 columns may sit above the intended p95 line
  (kv2's second periscope pod and is3's raised MG receiver band each flipped p95 up).
- 12% body filter vs fat muzzle furniture: is3's 0.35-band brake discs crossed
  rough*0.12=0.324 and hullLengthM swallowed the gun (9.86); discs sized to 0.33 with
  the DShK mast lifting rough to 2.94 restored the filter margin.
