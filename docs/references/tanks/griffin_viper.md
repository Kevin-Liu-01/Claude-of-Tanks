# Griffin Viper

Owner-directed 2026-09-21 modern American missile-carrier game concept.
Implementation is first-party procedural. It shares the revised Griffin 50 chassis,
tracks and suspension exactly; two new eight-cell pitchable pods
replace its turret. No external mesh or texture is distributed or loaded in play.

The owner’s final proportion correction makes both Griffin hulls 10% longer
and both upper assemblies 10% smaller. The hull is 7.26594 m long; wheel
radii and weapon calibers remain unchanged. See the
[proportion record](../../research/griffin-proportions-20260921.md).

Tier X, USA. Sixteen physical launch cells cycle a finite 64-missile inventory
at one-second stock intervals without a magazine pause. Each guided missile
has 140 nominal damage and 650 mm game penetration. These are game-balance
values, not real-world performance claims. The exposed pods trade protection
for sustained suppression. Three hull crew occupy separate physical volumes.

Frozen design: `docs/references/concepts/griffin-viper-20260921.json`.
Current qualification and publication state:
[batch packet](../../research/missile-roles-ariete-upgrade-20260921.md).
Source-comparison score: NOT APPLICABLE (new owner-directed concept).

## Side cable repair, 2026-09-21

The owner's garage screenshot identified the loop-ended tow cable standing
upright beside the launcher. The generic side fallback combined XYZ yaw and
roll, rotating the cable's long axis into the vertical direction. Viper now
uses an explicit `hullSideCable` station: local X runs fore-aft, the clamp
plane follows the measured hull normal, and each clamp embeds 4 mm. It remains
hull-owned through launcher yaw/elevation. Other vehicles retain their existing
equipment layouts; chassis, weapons, armor, geometry counts and LOD are unchanged.

`profiles/griffinViper.selftest.mjs` exercises the dressed HIGH/LOW path,
measures the actual cable orientation and all three clamp contacts, and checks
launcher motion. `decorationsEquipment.selftest.mjs` covers both side normals
and the previous upright rotation as a negative control. Bare procedural
metrology excludes this equipment and cannot catch this class of regression.

Repair validation passed: targeted release gate (including full `npm test`:
405 preflight + 684 core + 42 final checks), private production build and
typecheck. Anatomy/marking receipts and module probes are current; the final
fleet technical-image freshness check passes all 606 files. Only Viper's
asset row and changed images are published with this repair.
