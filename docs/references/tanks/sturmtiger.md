# Sturmtiger (`sturmtiger`)

**Exact variant modeled:** 38 cm RW61 auf Sturmmörser Tiger, late-1944
conversion on the Tiger I Ausf. E chassis, WITH the roof loading crane
stowed/erected at the casemate rear (the oracle carries it erected).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length (= overall, mortar barely projects) | 6.28 m | en.wikipedia.org/wiki/Sturmtiger; tanks-encyclopedia.com/ww2/nazi_germany/sturmtiger.php |
| Width | 3.57 m | Wikipedia; tanks-encyclopedia |
| Height (casemate roof) | 2.85 m | Wikipedia; warhistory.org/article/38cm-sturmmorser-tiger |
| Gun | 38 cm RW 61 L/5.4 rocket mortar (~2.05 m tube), ring of gas-vent holes around the muzzle, ball mount | Wikipedia; tanks-encyclopedia |
| Running gear | Tiger I: 8 interleaved 0.80 m stations/side (late steel-rim), FRONT drive, rear idler, 0.725 m tracks | Wikipedia (Tiger E chassis) |

## Identity cues

- Casemate: boxy, tall; front plate slopes back ~47°, sides ~20°, flat roof.
  Front plate carries the huge BALL MOUNT (sphere segment in a large round
  aperture ring) with the stubby 38 cm tube; muzzle face has the signature
  RING OF VENT HOLES; bow MG ball right of the mortar, sight port left.
- Roof: loading CRANE at the casemate rear-right (post + angled jib + hook),
  rectangular loading hatch, commander periscope hump, vents.
- Hull: Tiger I lower hull — vertical sides, three-plate stepped bow with
  driver plate, fender line, twin shrouded exhausts on the rear plate.
- Running gear: interleaved dished/steel wheels, front sprocket, dead-track
  sag between stations.
- Zimmerit on hull/casemate on most survivors (paint-level hint only).

## Reference links

1. https://en.wikipedia.org/wiki/Sturmtiger — dims, RW61, crane
2. https://tanks-encyclopedia.com/ww2/nazi_germany/sturmtiger.php — casemate
   angles, vent-ring detail, crane use
3. https://warhistory.org/article/38cm-sturmmorser-tiger — walkaround photos

## Local GLB oracle notes

Path: `public/models/tanks/community/sturmtiger-tomrs.glb` (fixedMount,
yawOffset −90°). Width-normalized to 3.57 m: 6.16 m long × 4.15 m tall — the
4.15 m height is the ERECTED loading crane above the 2.85 m roof; the mortar
muzzle sits nearly flush with the bow. Fused mesh: component masks N/A.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | whole | tracks | change |
|---|---|---|---|---|---|
| 2026-07-30 | 85.7 | 76.6 | 84.8 | 89.6 | baseline (parametric CASEMATE box, no crane) |
