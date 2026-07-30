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
x −0.80 topping 2.33; 105 mm stub: r 0.14, axis y 1.88, muzzle +2.90, big
square gun shield.
