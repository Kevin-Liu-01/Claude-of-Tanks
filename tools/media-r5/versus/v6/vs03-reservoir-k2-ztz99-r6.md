# vs03-reservoir-k2-ztz99-r6: across the water, pass 3 (owner 2026-10-16: fronts, size, camera)

K2 Black Panther v ZTZ-99 Longwei on Highland Reservoir at golden hour. The lens stands in the shallows at the west waterline of the south-west bay, 0.9 m over the water, and looks north across the bay's corner on a 30° lens rolled −10°.

- **K2:** on the west bank in the right foreground, its front to the lens (26° off its nose), 46 % of the frame's width. Its turret is laid left across the water. It fires a live `muzzle_flash` (calibre 160, 42 ms old) with the barrel recoiled, and the bore lies 68° across the view.
- **ZTZ-99:** on the far shore left of centre, its front to the lens (18° off its nose), 27 % of the width. It fires back with a 75 ms-old blast. The K2's round struck 0.3 s ago and throws sparks and spall off its quarter.
- **Column:** a doubled cook-off column rises off the promontory past the ZTZ.

How it differs from the earlier versions and the old template:
- Both hulls now face the lens. The earlier K2 was 40-55° off its nose.
- The tanks are about twice as large in the frame.
- The camera is a Dutch-rolled, water-skimming lens instead of a level one.
- It is still a shot across the water: no burst stands between the tanks, the K2 is a static shooter on the bank, and the hero is on the right.

The light is golden hour: the sun at azimuth 140°, elevation 9°, low behind the lens's left shoulder. Both fronts take the warm key, at 26° and 50° off their noses. The warm grade (temperature +18, an amber split tone) carries the water, which fills the lower-left lockup corner.

The K2's turret necessarily faces the far tank. Its hull front reads, and the turret is seen side-on with the gun across the frame.

Behind the K2's turret body is the grass bank. Only the very top of the turret meets the large waterworks building 109 m back.

The lenses:
- Lens **a** is the pick: eye (75.5, −62), 0.9 m up, yaw 334.5, fov 30, roll −10.
- Lens **b**: the same spot 1.8 m up, roll +7.

The check, run on the 226 CPU dumps, is clean with no `!` lines:

```
lens a: hero k2_x 26° off its nose at 21 m, box x -0.04..0.89 y -0.27..0.49
        foe0 type99a 18° off its nose at 33 m, box x -0.87..-0.32 y -0.42..0.14
lens b: hero 26° at 21 m, box x -0.04..0.88 y -0.54..0.18; foe0 18° at 33 m, box x -0.87..-0.29 y -0.03..0.49
```
