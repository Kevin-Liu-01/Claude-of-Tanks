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

Final disposition: **KEEP `5fa68984`**. The Leclerc again has recognizable,
supported front mudguards without any static geometry intersecting or
replacing its native linked track.
