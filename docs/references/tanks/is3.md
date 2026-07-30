# IS-3 — reference packet

Soviet late-WW2 heavy. Signature cues: pike nose ("eagle's beak") of welded
plates, squat semi-hemispherical cast turret (the original "upturned frying
pan"), 122 mm D-25T with double-baffle German-pattern muzzle brake, 6 big
steel road wheels, external fuel tanks on the rear sponsons.

## Real dimensions (2+ sources)
- Wikipedia (https://en.wikipedia.org/wiki/IS-3): length 9.725 m gun forward,
  width 3.07 m, height 2.44 m, 45.8 t; "semi-hemispherical cast turret …
  inverted frying pan"; pike nose welded plates.
- Weaponsystems.net (https://www.weaponsystems.net/system/506-IS-3): same
  class figures (9.8 m overall, ~3.1 m wide, 2.45 m high).
- Game spec `specs.js is3.dims`: hull 6.77, overall 9.85, w 3.15, h 2.45.

## GLB oracle
`/models/tanks/community/is3_panzerfactory.glb` (Nick Tallon / PanzerFactory,
CC-BY 4.0), articulated turret+gun nodes, hull-centered by the loader.

Width-normalized probe of the oracle (meters, ground y=0):
- hull mask z −3.41..+3.41 (len 6.82); roof: rear deck 1.55 with raised
  stowage/fuel-tank line to 1.72-1.74 (z −2.5..−0.4), crew roof 1.49
  (z 0..+2.0), driver hump 1.57 at +2.0, glacis 1.35→1.10 at the tip.
- front widths at y .35/.7/1.0/1.3/1.6/1.9/2.2/2.5/2.8:
  3.00/3.00/3.00/2.85/3.12/2.85/2.62/1.26/0.66 (the 3.12 at y1.6 is the
  external fuel tanks poking past the sloped sponsons).
- turret: fat squashed dome z −1.6..+1.9 (depth ~3.5), crown ~2.54, base ring
  y ~1.74 floating over the 1.49 roof; cupola + DShK spikes to 2.94-3.12
  around z −0.5..+0.2. Width ~2.85 at y1.9, 2.62 at y2.2.
- gun: muzzle +5.66 ⇒ 2.25 m past the bow; tube y 1.90-2.15 (axis ≈2.02),
  double-baffle brake z ~4.9..5.66 (y 1.86-2.21).
- whole len 9.07, top 3.12 (AA DShK).

## Build notes
Hull-centered like the oracle. Turret pivot near dome center (z ≈ +0.1),
gun axis 2.02, brake via KIT buildGun `brake:'discs'` (D-25T pattern).

## Final fidelity (2026-07-30)
64.4 → 88.6 (H93 T79 G89 R87; overall ≈91.4). D-25T rebuilt with a fat
sleeved tube (mask Ø 0.25) and a custom double-baffle brake at the oracle's
Ø0.35 (KIT 'discs' is Ø0.40+ at this bore). Remaining gap: the oracle's
turret mask reaches ~0.2 below the deck line at the dome flanks (its hull
render is hollow there), a band a solid procedural deck occludes — side
turret views cap around 72-75.
