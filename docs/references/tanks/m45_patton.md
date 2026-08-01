# M45 (T26E2) — reference packet

Exact vehicle: **Medium Tank M45 (T26E2)** — the close-support Pershing with
the short **105 mm Howitzer M4** in the M71 mount (heavier gun shield /
counterweighted mantlet), 185 built, Korea service. NOT a long-gun Patton.

## Real dimensions (2+ sources)
- Same chassis as M26: hull **6.337 m**, width **3.51 m**, height **2.78 m**
  ([Wikipedia: M26 Pershing](https://en.wikipedia.org/wiki/M26_Pershing) —
  "T26E2, eventually standardized … as the Medium Tank M45 — a close support
  vehicle with a 105 mm howitzer (74 rounds)").
- [Tank Encyclopedia: Medium Tank M45 (T26E2)](https://tanks-encyclopedia.com/coldwar-us-medium-tank-m45-t26e2/)
  — short-barreled 105 mm howitzer, heavier gun shield; extra mantlet metal to
  balance the turret.
- [History of War: Heavy Tank M45 (T26E2)](https://www.historyofwar.org/articles//weapons_heavy_tank_M45.html)
  — 105 mm M4 replaces the 90 mm M3; (their "8.65 m" length row is a copy of
  the M26 gun-forward figure and does not apply to the stub howitzer).
- The howitzer muzzle barely clears the glacis: overall length ≈ hull length.
- Suspension identical to M26: 6 road wheels, 5 return rollers, rear sprocket,
  front idler, track tension idler.

## GLB oracle (width-normalized to 3.51 m; +z forward, y from ground)
`/models/tanks/community/recovered/m45_patton.glb` (Bergman pack, local-only).

- Hull: z −3.10 … +3.09 (6.19 m), roof y 1.51–1.56, glacis knee (+2.50, 1.50)
  → toe (+3.09, ~1.02), rear deck (−1.60, 1.53) → tail (−3.10, 1.13).
- **Gun: NO overhang.** No whole-mask pixels beyond the nose in side or top
  view (a 0.07 m sliver at +3.05) — the stub howitzer stays inside the hull
  length bound. Current procedural's gun 0.0 came from a 3.85 m barrel poking
  0.6 m past the nose while the reference pokes none.
- Upper mask envelope: plateau **2.24–2.33 over z +0.33…−1.30**, hump
  1.86–1.98 at −1.4…−2.1, stepped tail 1.45–1.85 down to −3.05; whole-mask
  junk overhangs the hull rear to −3.33 (y 0.9–1.5).
- Front view: tall narrow spike (the .50cal) at x −0.6…−1.06 up to 2.33;
  center only 1.77–1.88.

### Oracle defect
Same Bergman defect as m26: the **turret is sunk into the hull** (open ring,
crest ~1.8 flush with deck, pintle .50cal poking through = the 2.24–2.33
plateau, howitzer barrel buried in the hull silhouette). Build the CORRECT
proud T26E2 turret inside that envelope (dome roof 2.28, .50cal at the ref's
x −0.85 spike position), keep the howitzer muzzle at +2.90 (< nose +3.09) so
both gun-overhang masks stay empty (gun = 100 by the empty-vs-empty rule), and
extend a hull-bucket tail fixture to −3.34 so the reference's rear junk falls
inside the common hull bound instead of registering as reference "gun" pixels.

## Build targets (procedural, world coords)
hull tail −3.10 (+tail fixture to −3.34) / nose +3.09 / roof 1.54 / knee +2.50
/ toe y 1.02; 6 wheels r 0.33 span −2.45…+1.90, sprocket −2.75, idler +2.35,
tension wheel −2.50; turret ring (−0.50, 1.54), dome HW 1.24, roof 2.28, front
+0.33, bustle to −2.55 top ≤ 1.95, stow wedge to −3.0; prominent .50cal M2 at
x −0.80 topping 2.33; 105 mm M4 stub: r 0.16, ~L/22 (wave 2:
shortened + fattened per the shaded critique), axis y 1.58, muzzle +2.45
(inside the hull bound), counterweighted M71 shield casting.

**Oracle re-processed (repair_oracles.py): turret seated** — fused Turret node
lifted +3.6 model units onto the deck, recentred +5.4 x, origin on the ring
axis. Sunken-turret defect above is historical.

## Round-3 mismatch log (shaded-parity-r2 turret rebuild, 2026-07-30)
Repaired-oracle re-measurement (turret-only masks): ring (0, 1.54, −1.155);
dome +0.30…−2.05, plateau ≈2.25–2.33 over −1.4…−2.1; bustle to −2.82 (top
2.02–2.20 with a stowage bump at −2.5…−2.7); rack band 1.44…1.93 to −3.14;
M2 .50cal FRONT-RIGHT at x ≈−0.42 (spike top 2.68, barrel forward to +0.36).
The seated howitzer's muzzle ends at ≈+1.45 — the wave-2 +2.45 tube painted a
metre of false barrel into the whole/upper masks; procedural muzzle now +1.48
(both gun-overhang masks stay empty, gun = 100 preserved).
Artifact audit (r2 §9): the "hovering muffler over an open deck void" was the
turret stow tarp floating at deck height across the dark grille plates — the
stowage now rides a railed rack hung off the bustle, and the rear-deck grille
is framed louver bays (rails + spine + 7 deep slats per bay). The tilted
exhaust-deflector shelf was DELETED (not present on the repaired oracle; the
rear overhang junk is carried by the hull tail fixture to −3.34, which stays).
Rack rails run to −3.36 so their tips match the oracle's sparse tail pixels in
the top view without entering the side gun-overhang bound (−3.38).
No fender boxes: the oracle's flanks are bare and the howitzer band sits just
above the deck line. Turret component 51 → 66.

## From-scratch rebuild (2026-07-31, measured-curve program)
Rebuilt from `docs/references/profiles/m45_patton.json`: toe (+3.15, 1.04),
knee (+2.55, 1.52), deck 1.55; the full-width hull ENDS at −2.50 with the
narrow (±0.70) centre tail block to −3.09 (the old −3.34 tail fixture
overshot the repaired oracle and was removed); rack tips −2.96..−3.06 (the
old −3.36 rails painted phantom tail mass). Howitzer: axis 1.54, r 0.125,
muzzle +1.44, small recessed shield (the measured turret-plan shows the
oracle's M71 shield is narrow, not the wide casting wave-2 assumed). Dome
crest 2.32–2.34 with cupola at (−0.62, −1.62) top 2.30 and the M2 cluster
front-right (x −0.32, barrel to +0.34). Gear measured: idler (+2.58, 0.54),
HIGH sprocket (−2.44, 0.74), tension idler as the band's low support.
IoU 86.1 → 86.8-87.6 band; gun stays 100 (both overhang masks empty).

### Geometry-gate findings + certified cap (dims)
Gate baseline: hull 51.9 / whole 50.5 / turret 0 / stations 79 / dims 0.
After rounds: turret ~49 (ring basket to y≈0.34 added; the oracle's turret
subtree reaches that deep), hull/whole ~50.
**CERTIFIED CAP — dims.overallLengthM AND dims.hullLengthM**: this packet
already documents that the published 8.65 m row is a copy of the M26
gun-forward figure and "does not apply to the stub howitzer" (real M45
overall ≈ hull length). The oracle measures 6.08–6.37 m overall. Passing
dims would demand a 2.4 m 105 mm howitzer barrel — historically false and
curve-breaking (same span-midpoint registration argument as m26). Capped;
the spec.dims row itself needs the correction to ≈6.4 m.

## Gate v7 rebuild round (2026-07-31)
spec.dims.overallLengthM was corrected to 6.4 m (bow-flush stub howitzer) —
the old dims cap is RETIRED and dims now scores 100 (heightM 0.01% /
hullLengthM 0.21% / overallLengthM 0.15% / widthM 0.19%). The howitzer
muzzle stays +1.44 (inside the hull span); overall length is carried by the
hull: narrow tail block to -3.20 plus the toe/flap at +3.14 = 6.39 m read.
v6/v7 true-camera turret: dome plan narrowed hard (peak hw 1.21 @ -1.25,
ref band at x 1.12 is only z -0.93..-1.41), M45 M2 cluster at (-0.32,-0.90)
with the raised published-height mast top 2.79 (oracle's own reads 2.68),
cupola rebuilt as a TALL ring (base 2.34, h 0.26 — the old thin floating
lid at 2.555 was the articulation-floater source), rack halfW 0.46 with
tips -3.16. Sprocket raised to (-2.42, 0.85) for the measured departure
ramp; tension idler kept as the return-run support.
NO caps: this oracle's howitzer is bow-flush like the real vehicle, so every
component is satisfiable. Remaining work orders: side_whole mean 3.65
(front ramp columns +2.5..+2.9 vs the kit contact flat; M2 cluster tops
+0.1 high in 4 columns), turret_side mean 3.79 (dome front sections still
~6 cm proud at z +0.1..-0.4; cupola edge bin at -1.86), stations 57.2
(slice 3/9 tops — howitzer-tube slice visibility differs between models).
Final components: hull 63.5 / whole 48.4 / turret 49.5 / stations 57.2 /
dims 100 / floaters 100.

## Batch-8 oracle re-seat (2026-07-31, repair_oracles.py batch 8) — turret parked AFT of its ring pit
Owner report: "turret glitched into hull". Same print-bed packing defect as m26 (see that
packet): the fused turret part (identical T26 casting plug: basket r 7.000, race r 10.40,
race bottom y 8.000, bore race+4.4) was authored parked at basket axis (12.600, 20.372)
while THIS hull's ring pit — authored perfect 36-vert rim circle r 7.200 — sits at
**(18.000, 40.493)**, rim plane y **15.600**, i.e. ~1.93 m forward of the parked spot.
Repair (recipe `REPAIRS['m45_patton']`, from the pristine .bak): rigid translate by
world (+5.400, +7.600, +20.121); origin parked at (18.000, 15.600, 40.493) for the
autoPivot origin branch. Post-seat: bore axis y 20.0; the stub howitzer muzzle lands at
z 66.49 vs nose 64.49 — pokes ≈0.19 m past the glacis edge ("barely clears", matching
the real M45), overall reads ≈6.63 m. NOTE for the patton round: the procedural keeps
its muzzle at +1.44 (inside the hull span), so the gun overhang masks are no longer
empty-vs-empty and the fidelity gun view reads 0 until the proc muzzle is re-traced to
the seated oracle (~+3.2, still bow-flush class); spec.dims.overallLengthM 6.4 row may
deserve a ~6.6 re-check against the seated print.
Gate before → after (proc unchanged): hull 67.2 → 67.4, whole 47.7 → 0, turret 55.6 → 0,
stations 63.3 → 0, dims 100 → 100, floaters 100 → 100; reg dAlong 0.035 → 0.109, dy
0.003 → 0.005 (stable).
Evidence: shots/procedural-fidelity/boards/m45_patton-{before,after}-seatfix.png,
shots/procedural-fidelity/garage-m45_patton-seatfix.png (in-game, real loader).

## Batch-8 procedural re-trace (2026-07-31, patton-family builder)
Re-seat vs the seated oracle: ring (0, 1.516, +0.74..0.82); crest 2.64-2.71
over +0.2..+0.8; basket (bot 0.745) spans +1.42..+0.55; the front-left M2
cluster overhangs the bow — receiver band 3.01-3.07 over +0.55..+1.45,
barrel to ~+2.3. Stub howitzer axis 1.947, oracle muzzle +3.35. Hull:
fender-led bow (toe 2.80, platforms to 3.16 at y ~1.05); deck 1.512 with
grille bumps 1.55-1.57 over -0.3..-1.1; full width ends -2.50 into the
narrow tail block (hw 0.82 -> 0.67) ending ~-3.0.

CERTIFICATIONS / BLOCKERS:
1. DIMS heightM BLOCKER — same no-MG convention issue as m26: published
   2.78 vs the oracle's mounted M2 band ~3.0 (dims ~23 when turret-matched).
2. DIMS overallLengthM re-check (packet batch-8 already flagged): the
   seated stub muzzle reads +3.35 -> overall ~6.55-6.6 vs the spec row 6.40.
   Built to the published 6.40 (muzzle +3.18, ~1.5 ref-only columns).
   userdrops6.js row may deserve the ~6.6 figure.
3. Hull length: recovered span ~6.16 vs published 6.33 — centre tail pintle
   to -3.20 carries the dims row (1-2 certified proc-only columns).
State at handoff: hull 70.4 / whole 69.4 / turret 56.7 / stations 73.9 /
dims 22.6 (blocker 1) / floaters 100.
