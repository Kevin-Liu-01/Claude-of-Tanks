# T-72BU (`t72bu`)

**Exact variant modeled:** T-72BU — the development designation of the
T-90 obr. 1992: T-72B hull + cast turret with full Kontakt-5 wedge fit,
Shtora-1 dazzlers, 1A45 FCS. Renamed T-90 for service. Visually a
K-5 T-72B with Shtora "eyes"; NOT the later T-90A (`t90a`, ESSA fit).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m | en.wikipedia.org/wiki/T-90; tank-afv.com/modern/Russia/t-90_mbt.php |
| Overall length (gun forward) | 9.53 m | en.wikipedia.org/wiki/T-90 |
| Width | 3.78 m over skirts | en.wikipedia.org/wiki/T-90 |
| Height | 2.22–2.23 m | en.wikipedia.org/wiki/T-90 |
| Gun | 2A46M 125 mm, tube 6.0 m, mid evacuator, sleeve | en.wikipedia.org/wiki/2A46_125_mm_gun |
| Road wheels | 6, rear sprocket, full skirts | en.wikipedia.org/wiki/T-90 |

## Identity cues

- Turret: cast dome with K-5 wedges front cheeks + roof-edge K-5 row;
  Shtora OTShU-1-7 dazzlers both sides of the gun; cupola right with tall
  sight cluster; bustle basket ring at rear.
- Hull: K-5 glacis wedges; drums + log at rear; T-72 wheels.

## Reference links (links only)

1. https://en.wikipedia.org/wiki/T-90 — obr.1992 identity (CC BY-SA)
2. https://tank-afv.com/modern/Russia/t-90_mbt.php — obr.1992 walk-through
3. https://en.wikipedia.org/wiki/Kontakt-5 — wedge layout

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/t72bu.glb`
Width-normalized (3.78 m) probe:
- whole 3.78 × 3.58 × 10.89. IMPORTANT: the barrel is parented to the HULL
  node (turretNode '^Turret$' matched only the dome) — ref hull mask spans
  z −5.45…+5.45 including the thin barrel (r ≈ 0.13) out to 5.45.
  That is why the baseline gun component reads 100 (both overhang masks
  empty beyond the union hull bounds); the barrel is effectively scored
  inside the HULL and WHOLE masks.
- hull proper (halfW ≥ 1): z −5.45…+2.6 (≈8.0), deck y ≈ 1.8–1.9 (tall!),
  glacis nose ≈ 1.33, rear 1.86.
- turret (dome only, no gun): z −3.22…+0.84, dome z −1.82…+0.21 halfW
  1.5–1.7, roof ≈ 2.4, sight cluster 2.9, mast to 3.58 at z −2.33; bustle
  basket z −2.1…−3.2 (halfW 0.77–1.11, y→2.2); dome center ≈ −0.8.
- gun axis y ≈ 1.75; muzzle-to-dome-center ≈ 6.25.
Oracle defects: hull-parented barrel; proportionally tall model
(scale 1.23); very long hull.

## Mismatch log

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 73.8 | 75.4 | 80 | 30 | 100 | 84 | baseline (t90a donor spec, SOVIET template) |
| 2026-07-30 | 74.3 | 80.1 | 79 | 32 | 100 | 84 | donor->standalone: zC -1.425, tall 1.80 deck 8.0 hull, dome 3.35x2.50 +0.575 fwd, muzzle kept just short of oracle hull-parented barrel tip (G stays 100); T capped: oracle upper mask has no gun |
