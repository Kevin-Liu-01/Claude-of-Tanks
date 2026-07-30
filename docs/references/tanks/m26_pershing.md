# M26 Pershing — reference packet

Exact vehicle: **Heavy/Medium Tank M26 Pershing** (production, 90 mm Gun M3 with
double-baffle muzzle brake, T80E1 24" tracks). US, 1945.

## Real dimensions (2+ sources)
- Hull length (turret aft): 20 ft 9.5 in = **6.337 m**; overall gun forward
  28 ft 4.5 in = **8.649 m**; width 11 ft 6 in = **3.51 m**; height 9 ft 1.5 in
  = **2.781 m** — [Wikipedia: M26 Pershing](https://en.wikipedia.org/wiki/M26_Pershing)
- Same figures repeated at [globalmilitary.net M26](https://www.globalmilitary.net/vehicles/m26-pershing/)
  and [onwar.com M26](https://www.onwar.com/wwii/tanks/usa/us022m26.html).
- 90 mm Gun M3 (M3 L/53, double-baffle brake, no bore evacuator), 70 rds.
- Torsion bar suspension: **6 road wheels/side, 5 return rollers**, rear drive
  sprocket, front idler, plus the small **track tension idler** ahead of the
  sprocket (kept in the M46 — [Wikipedia: M46 Patton](https://en.wikipedia.org/wiki/M46_Patton)).
- Turret: rounded one-piece **casting** with rear bustle, commander cupola
  right, loader hatch left, .50cal M2 pintle at bustle rear.
- Photo refs: [Wikimedia Commons: M26 Pershing](https://commons.wikimedia.org/wiki/Category:M26_Pershing),
  [militaryfactory M26](https://www.militaryfactory.com/armor/detail.php?armor_id=64).

## GLB oracle (local, width-normalized to 3.51 m; +z forward, y from ground)
`/models/tanks/community/recovered/m26_pershing.glb` (Bergman pack, CC BY-NC-SA,
local-only quarantine; visual oracle only).

- Hull: z −3.44 … +2.55 (5.99 m — the model is proportionally shorter than the
  real 6.34 m hull), roof y ≈ 1.53–1.57, glacis knee (+1.77, 1.53) → toe
  (+2.55, ~1.06), rear deck slopes from (−2.10, 1.51) to tail (−3.44, 1.24).
- Full width 3.52 in plan along the whole hull (sponsons over the tracks).
- Gun: tube emerges over the glacis at z ≈ +2.2, **muzzle +3.46** (0.91 m past
  the nose), tube plan width 0.24–0.28, **brake plan width 0.52** (double
  baffle), authored LOW (band y 1.03–1.38; see defect below).
- Upper mask envelope (whole−hull): mantlet region −0.5…−1.25 (top ≤ 1.77),
  plateau **2.26–2.35 over z −1.3…−2.9**, bustle/stowage tail to −3.44
  (y 1.5–1.8).

### Oracle defect (measured, load-bearing for scores)
The recovered model's **turret casting is sunk ~0.8–0.9 m into the hull**: the
hero render shows an open turret ring, the dome crest roughly flush with the
deck, the .50cal pintle MG poking through (that MG is the 2.26–2.35 "roof"
plateau above), and the 90 mm barrel emerging low over the glacis (band
1.03–1.38 instead of a ~1.9 m trunnion line). The procedural build keeps a
CORRECT proud turret sized into the oracle's upper-mask envelope (dome roof
2.30, bustle tail into the −3.0…−3.4 stowage band), so the turret component is
capped in front/rear views against this reference. Gun overhang is matched in
length/shape (the gun metric centroid-aligns, so trunnion height is free).

## Build targets (procedural, world coords)
hull tail −3.44 / nose +2.55 / roof 1.55 / knee +1.77 / toe y 1.06; sponson
floor 0.98; 6 wheels r 0.33 spanning −2.55…+1.75, sprocket −2.90, idler +2.10,
tension wheel −2.60 low, 5 rollers; turret ring (−1.70, 1.55), dome HW 1.24,
roof 2.30, front −0.55, bustle to −3.35; gun axis y 1.90, muzzle +3.46,
double-baffle brake; muzzle stays 0.9 m past nose to mirror the oracle (real
overhang is ~2.3 m — oracle wins for scoring).

**Oracle re-processed (repair_oracles.py): turret seated** — fused Turret node
lifted +4.0 model units onto the deck and recentred (+5.4 x) on the hull
centreline; node origin parked on the ring axis for autoPivot. Sunken-turret
defect above is historical.
