# M1A1 AIM Abrams — reference packet

Variant: M1A1 AIM — depot-refurbished M1A1 (Abrams Integrated Management).
Externally an M1A1: M256 L/44 (NOT a long gun — the old profile's
`gunLength 6.15` and `width 3.55` were score-chasing artifacts, removed),
FLIR upgrades. Sources: Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams),
GlobalSecurity (https://www.globalsecurity.org/military/systems/ground/m1-specs.htm),
military-history M1 Abrams (https://military-history.fandom.com/wiki/M1_Abrams).

## Local GLB oracle
`/models/tanks/community/recovered/m1a1_aim.glb` (m_bergman print model,
autoPivot:false, empty `Turret` pivot at origin). It is NOT a scale Abrams: a
long slab-sided printable body, full-depth side walls, very low flat turret
hump, LOW gun, and a tall exhaust stack on the rear deck. Normalized against
overallLengthM (no separable gun), scoring frame (ground 0):
- body: z −4.54…3.52 (8.06 — sits rearward; centroid alignment absorbs the
  offset), deck 1.41 (z 3.4) → 1.55…1.67 (mid) → 1.78 (z −2.1) → 1.89…1.95
  (z −2.8…−3.6); rear overhang plate to z −4.54 (y ≈ 0.7…1.8).
- belly 0.36; skirt walls x ±1.83 with bottom edge ≈ 0.52; tracks x ±(1.0…1.6)
  to ground −0.08 (run z 1.8…−2.8); nose bottom rake (3.6, 0.87) →
  (2.1, −0.03); tail rake (−3.3, 0.11) → (−4.3, 0.71).
- upper works (scored as turret): low flat hump roof ≈ 1.89 over z −0.1…−2.4,
  near full width; small center sight block to ≈ 2.73; rear exhaust stack to
  ≈ 2.43 at z −3.3…−3.6 (turret-tagged in the asset, hull-built here — noted
  below); LOW gun: tube y 1.10…1.45 (axis ≈ 1.28!), muzzle z ≈ 4.62.

## Procedural strategy
Slab body with rising deck, full skirt walls, low wide turret hump + sight,
gun trunnion dropped to axis 1.28 with muzzle 4.62, rear stack built on the
hull at z −3.45.

## Mismatch note
The asset tags its rear stack (and some deck plates) into the turret subtree;
building the stack on the hull avoids a chimney orbiting the hump at yaw but
costs a couple of mask columns in the hull/turret split.

## Outcome (final lab state)
Baseline 64.4 (H80 T23 G46 R85) -> 77.3 (H92 T27 G78 R91), min view ~72.
Hull/tracks/gun match well (slab body, rising deck, low 1.29-axis gun,
muzzle 4.65, stack at the hump rear, ring apron + bustle shelf slivers).
TURRET COMPONENT IS CAPPED BY AN ORACLE QUIRK: the print model's turret
subtree contains four full-height SIDE-WALL STRIPS of the hull (upper-mask
bands reaching y 0.23 at z ~0.1/-0.3/-0.8/-1.4) which dominate its upper-mask
area. Reproducing them would require hanging hull-wall slabs off the yawing
turret (visually broken at any yaw), so they are deliberately not mirrored;
T stays ~27 with the remaining shape matched. Flagged as an asset-side fix
(re-tag those wall strips to the hull in the recovered GLB or its follower
config).
