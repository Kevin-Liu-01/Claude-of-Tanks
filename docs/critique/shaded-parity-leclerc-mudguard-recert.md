# Leclerc front-mudguard and native-track re-certification

## Owner finding

The forward track collision had been eliminated by removing the Leclerc's
old low static flap, but the result no longer carried a proper pair of front
mudguards. Restoring the deleted plate verbatim was not acceptable because it
crossed the animated idler and linked shoes.

## First-party repair

`buildLeclerc` now authors two tapered steel caps above the terminal course.
Each cap is carried by an inboard knee entering the bow and an outboard knee
entering the fender rail. A shallower tapered-width rubber lip meets the cap
ahead of the terminal-shoe envelope. These are hull-owned repository
primitives; the private comparison model remains a read-only measurement and
visual oracle.

The first draft restored the overall guard but produced an excessively tall
black rectangular lip. The final pass reduced that lip, tapered the cap's
front corners and retained the higher collision-free seat. Front,
front-quarter and elevated-left comparison renders show both guards as part
of the hull while preserving the complete terminal links beneath them.

## Receipts

- deterministic freeze: `5fa68984` twice, 47 meshes / 85,191 vertices;
- evidence: 15 paired + 15 yaw0 + 15 yaw90, 45 distinct PNG hashes;
- fidelity: 94.0 overall; hull 95, turret 91, gun 91, tracks 93; every scored
  view/component >=90;
- native course: exact band 0/0, shoes 0/0, strict sweep 0/0;
- ownership: 0 stranded / 0 abutting / 0 dangling;
- winding: 0 reversed / 0 mixed, 0-pixel deficit, clean mode 2;
- rig and muzzle bore pass; native provenance and family-order audits pass;
- all eight Leclerc presentation assets regenerated and checked;
- full tests and private/public production builds pass.

## 2026-08-13 terminal-identity supersession

The live builder had retained the higher collision-free steel cap and shallow
lip, but the terminal still read too open in the owner's low front view. A
second first-party pass adds a short flexible leading apron that is backed by
the cap/knee structure and remains ahead of the linked-shoe sweep. Concentric
idler and final-drive face courses now sit inside the existing carrier-ring
span, so neither terminal can collapse visually into an anonymous knot of
shoes.

Freeze `126a4e90` reproduces twice at 48 meshes / 103,431 vertices. Fresh
evidence in `/private/tmp/modern-drift-final-r3/leclerc` contains 15 paired,
15 yaw0 and 15 yaw90 frames: 45 PNGs / 45 distinct hashes with no identical
yaw pair. Exact band, shoes and strict sweep remain 0/0; parent audit remains
0/0/0; winding and muzzle checks pass. Elevated profile and close views show
the front idler, six road wheels and rear final drive as distinct assemblies
inside one continuous native course. The apron, cap and terminal faces remain
hull-fixed while the complete turret package executes a genuine quarter-turn.

Final disposition: **KEEP `126a4e90`; retire `5fa68984`**. The Leclerc again
has recognizable, supported front mudguards and explicit terminal running
gear without any static geometry intersecting or replacing its native linked
track.

## 2026-08-13 native-idler and first-party supersession

Fresh elevated-profile pixels showed that the apron itself was no longer the
problem: the moving terminal links still projected too far beneath it and the
first round face did not read decisively as a free idler. The final native
course tightens only that forward wrap. A narrow hull-owned nose/guard bridge
holds the raised source silhouette between the lanes, while the raked steel
cap, tapered overlap, flexible apron and two knees stay ahead/above the moving
shoes. The terminal face is explicitly non-driven; six road wheels and five
return rollers lead to a separate bolted rear final-drive face.

Freeze `158157f4` reproduces twice at 48 meshes / 104,451 vertices. The last
read-only comparison run records a 90.5 machine floor, with hull 90.5, whole
90.7, turret 91.5, stations 94.2, dimensions 95.2 and floaters 100. Exact
band/shoes/sweep remain 0/0/0; parent is 0/0/0; winding, runtime, muzzle and
running-gear-order checks pass. `/private/tmp/leclerc-track-final-r6/leclerc`
contains 15 paired + 15 yaw0 + 15 yaw90 PNGs, all 45 hashes distinct. Fresh
fixed-order visual scores are
`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.2,9.1,9.2,9.1,9.1]`, floor 9.0
and mean 9.08.

The historical comparison GLB is removed from `public/`, and its retired
runtime/source-credit wiring is removed from player-facing code. It supplied
no playable mesh data; the active Leclerc remains repository-authored
procedural geometry. Final disposition: **KEEP `158157f4`; retire
`126a4e90`**.

## 2026-08-13 live-visibility supersession

The exact-clearance result was correct but insufficient: fresh procedural-only
front and close-front renders showed the `158157f4` cap almost completely
occluded by the native shoes, while the 4.5 cm apron did not read as a guard.
The final first-party assembly moves its raked face forward of the shoe orbit,
tapers the visible camouflaged plate, gives it an angled lower edge and retains
only a narrow rubber lip. Hinge overlap and two stiffeners per side preserve a
clear physical load path into the existing knees and fender rails.

Freeze `9c47c650` is 48 meshes / 104,523 vertices. Exact band/shoes/sweep are
0/0/0; parent is 0/0/0; winding is clean (7 antialias pixels / 0.01%); rig is
10/10 and bore contrast is 67.3. The immutable packet at
`/private/tmp/leclerc-mudguard-final-r4/leclerc` contains 45 PNGs / 45 distinct
hashes and fresh scores
`[9.4,9.5,9.4,9.3,9.3,9.3,9.4,9.5,9.5,9.6,9.5,9.6,9.5,9.6]`, floor 9.3,
mean 9.46. The guards remain fixed to the hull through a genuine quarter-turn
while the complete turret rotates. **KEEP `9c47c650`; retire `158157f4`.**
