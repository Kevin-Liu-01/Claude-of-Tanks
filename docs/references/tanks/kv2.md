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
