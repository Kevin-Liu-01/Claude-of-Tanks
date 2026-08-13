# Leopard 2 prototype forward-turret and native-track re-certification

## Owner finding

The first-party prototype had accumulated a useful equipment suite, but its
primary turret was still one vertical-walled polygon with a flat lid.  It read
as a short slab rather than the longer, forward-set early Leopard fighting
compartment requested by the owner.  The strict suspension sweep also found a
hidden 21-voxel hull contact at the front glacis/idler transition even though
the static band and shoe tests were clear.

## First-party redesign

`buildLeo2Proto` now uses one connected three-ring welded loft authored from
repository primitives.  The lower belt carries broad clipped shoulders, the
middle ring preserves the long prototype plan, and the crown falls inward
without changing the low published roof datum.  The plan extends both the
armored nose and bustle, and the complete rotating package moves 0.10 m
forward.  The mantlet bay and gun seat move with it; only the exposed tube is
shortened by the corresponding amount so the published overall muzzle station
does not drift.

Two buried hatch foundations, asymmetric roof weld courses and four backed
bustle latches restore fabrication detail without adding stand-off geometry.
The rangefinder blisters, smoke banks, cupolas, sights, MG/RCWS, antennas,
spaced side bins and supported rear basket remain independently authored and
visibly seated on the new shell.

The glacis lane cut now begins behind the rising idler arc.  This preserves the
visible bow and mudguard outline while removing the future suspension contact:
band front/rear **0/0**, shoes **0/0**, and strict full sweep **0/0**.

## Oracle limitation

The quarantined recovered GLB is a certified melted print: its turret is sunk
into the hull and its gun lies at deck height.  It exposes no valid turret or
gun component masks.  The historical curve gate therefore remains honestly
at zero and is not used to justify the new turret.  The usable normalized hull,
track and whole-direction comparison scores **93.71**, with every available
direction at least **92.52**.  The owner-standard 15-view shaded packet and
0/90-degree ownership evidence are the controlling upper-vehicle proof.

## Receipts

- deterministic freeze: `a7eae06a` twice, 65 meshes / 90,127 vertices;
- evidence: 15 paired + 15 yaw0 + 15 yaw90, 45 distinct PNG hashes;
- fresh standard vector:
  `[9.2,9.3,9.2,9.1,9.1,9.1,9.2,9.3,9.3,9.3,9.2,9.3,9.2,9.3]`,
  floor **9.1**, mean **9.22**;
- fidelity: **93.71**, hull 94.03, tracks 92.69, minimum available view
  92.52; turret/gun masks unavailable by certified oracle defect;
- native course: exact band 0/0, shoes 0/0, strict sweep 0/0;
- ownership: 0 stranded / 0 abutting / 0 dangling;
- winding: 0 reversed / 0 mixed, 0-pixel deficit, clean mode 2;
- runtime rig and muzzle-bore probes pass;
- 108 playables remain first-party procedural, with 0 GLB-sourced;
- all eight prototype presentation assets regenerated and checked;
- complete tests plus private and stripped-public production builds pass.

Final disposition: **KEEP / RE-FROZEN `a7eae06a`**.  Retire `27f9212e` and
all earlier prototype freezes.
