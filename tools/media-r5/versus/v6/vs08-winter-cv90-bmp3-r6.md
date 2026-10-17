# vs08-winter-cv90-bmp3-r6: the banking drone, pass 3 (owner 2026-10-16: fronts, size, camera)

CV90 Mk 4 v BMP-3, both in winter paint, on Winter by day. A drone hangs 9.1 m over the open snowfield west of the village, ahead of both vehicles. It uses a long 24° lens, is tilted 23° down and is banked +10°. The snowy forest edge fills the top of the frame.

- **CV90:** races at the lens at 12 m/s, its front to the drone (28° off its nose), 46 % of the frame's width.
  - **Snow trail:** a rooster tail runs out to the right behind it. It follows the `FX-RECIPES.md` §1 recipe: bursts at both rear track ends where the hull was 90-1500 ms before the still, thrown back along its heading.
  - **Autocannon:** its turret is laid left on the BMP-3. The gun fires a `muzzle_flash` (calibre 100) at T−85, your take-3 timing, with the barrel recoiled.
- **BMP-3:** beside it, at rest at the end of a skid, its front to the drone (26° off its nose), 37 % of the width. It is hit in the flank that faces the CV90 and burning: a penetration, sparks, hot debris, and a young fire from T−2500 that burns on the hull.

How it differs from the earlier versions:
- Both fronts now face the drone. The earlier pass had them at 52° and 42° off their noses, at 30 % and 19 % of the width.
- The camera is a banked, long-lens drone instead of a level wide frame.
- There is still no backdrop column and no burst between the vehicles.

The tracer stream is dropped. At these sizes the BMP-3 sits about 3 m past the CV90's muzzle, inside the 10 m in which no tracer dash draws (`FX-RECIPES.md` §2).

The light is a low sun at azimuth 20°, elevation 22°, 112° to the left of the view. Both fronts take it, at 29° and 54° off their noses, and the spray's shadow side reads against the lit snow. The picture is `LIT` at exposure −0.03.

Lens **a**: eye (−196, 76), 9.1 m up, yaw 268, fov 24, roll +10, looking at the ground 21.5 m ahead.

The check, run on the 226 CPU dumps, is clean with no `!` lines:

```
lens a: hero cv90_mkiv_x 28° off its nose at 18 m, box x -0.02..0.91 y -0.83..0.43
        foe0 bmp3 26° off its nose at 21 m, box x -0.91..-0.16 y -0.29..0.80
```

**Take 4 (QA FIX on the GO render):**
- **The BMP-3's hit:** the spike-star of long rays from the 120 mm spark fans is gone. It is now an autocannon-size `impact` (penetration, calibre 30) at T−250, thrown low and level off the plate toward the CV90 and away from the turret. The extra spark fan is dropped, and the debris is a short, slow spall (16 fragments at 5 m/s).
- **The CV90's flash:** cut to calibre 45, autocannon size, so its light and glow stop blooming on the snow under the glacis. It stays at T−85.
- The layout is unchanged, and the check on `features-go` is clean.
