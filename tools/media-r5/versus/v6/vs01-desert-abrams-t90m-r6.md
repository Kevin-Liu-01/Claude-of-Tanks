# vs01-desert-abrams-t90m-r6: the head-on charge (rev 6)

**Composition.** A very low lens (0.7 m), looking up 6° and rolled +12°, on open sand in the north at (14, 302), clear of
the wadi scrub belts, over a long flat horizon. The M1A2
SEPv3 charges at 12 m/s, 15° off its nose, 18 m out and 47 % of the frame's width, on the left. Sand fans back and
outward off both rear track ends (FX-RECIPES.md 1). Its turret is swung 72° toward the T-90M, so the bore lies across the
view (about 105° off the ray to the lens). The shot is a `muzzle_flash` 44-56 ms old with no round, the barrel recoiled,
and the orange fireball rolls out sideways into the gap between the hulls, stopping about 0.1 short of the T-90M.

The T-90M stands behind on the right on slightly higher sand (0.5 m up), 32 m out and 24 % of the frame's width. It is 25° off its nose, its
front toward the SEPv3 and the lens, gun laid on the SEPv3, and a few hot fragments spark low on its glacis. A doubled
cook-off column rises directly behind the fireball, so the orange blast stands on its dark smoke. An HE burst behind the
T-90M drops debris, and embers drift.

**Why it is new.** This is not the old template. The hero is nose-on, both fronts face the lens, the blast is the
hero's own gun, and the lens is a low Dutch angle.

**Rev 5:** the owner asked for fronts, bigger tanks and more interesting angles.
- Both hulls are now within 35° of their noses.
- Widths: the SEPv3 is 47 % (was 41 %) and the T-90M 24 % (was 15.5 %).
- The lens is lower (0.7 m instead of 1.3 m), looks up, and is rolled +9°.
- The ground wave under the muzzle is dropped, because that ground lies in front of the T-90M from this lens.

**Rev 6 (GO QA):**
- The T-90M had sunk behind a dune crest, so the lens moved to a spot where all five low ground rays to each hull are
  clear (the TERRAIN check).
- There are no shrubs within 18 m of the SEPv3 or 12 m of the lens, which stands in for the grass belts.
- The roll went from +9° to +12°, so the long flat horizon and the column's vertical carry the tilt.
- The column now stands behind the fireball.

**Lens and light.** Lens a: 0.7 m lift, fov 34°, pitch +6°, roll +12°, looking at bearing 75. Lens b: 0.55 m, pitch +7°,
roll +16°. The time is `day`: the sun at azimuth 210, elevation 34, 135° off the view behind the lens's left. The grade
is LIT with temperature +6 and light halation.

**Check.** On the GO dumps (`rerender-226/features-go`), clean with no `!` lines and no TERRAIN flag:

```
lens a  hero 15° off its nose at 18 m, box x -0.94..0.00 y -0.35..0.59
        foe0 25° off its nose at 32 m, box x 0.44..0.92 y -0.68..-0.22
lens b  hero 15° at 18 m, x -0.94..-0.00; foe0 25° at 32 m, x 0.42..0.90
```
