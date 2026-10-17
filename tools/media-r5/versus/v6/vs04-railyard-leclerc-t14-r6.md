# vs04-railyard-leclerc-t14-r6: the night tracer duel down the rails

Leclerc SXXI v T-14 Armata on Cinder Junction (railyard), at night, re-staged for the owner's 2026-10-16 direction: "i
think i want to see tank fronts more in the other versus, and tanks should be more % of frame" and "and more
interesting camera rotation and angles".

**The frame.** The lens stands 5 m up over the gap between the main-line tracks at the yard's west throat, rolled +13°
for a Dutch tilt. It looks east straight down the rails to their vanishing point, where the tank wagons burn.

**The tanks.** Both hulls face the lens.
- **The Leclerc** fills the left foreground at 14 m and 48% of the frame width, 20° off its nose. It charges down the
  corridor at 11 m/s, throwing FX-RECIPES track dust. Its turret is swung right onto the T-14, about 94° from the lens,
  so the turret shows side-on with the gun across the frame, not its rear. It fires a live `muzzle_flash` 42 ms before
  the still, with a recoiled barrel. The bore lies 80-90° across the view, so the blast reads as a big orange fireball.
- **The T-14** stands across the corridor at 25 m, in front of the G 10 vans, 25° off its nose and 26% of the width.
  Its turret is laid on the Leclerc, 34° from the lens, so it shows its front. The Leclerc's round glanced off its left
  cheek 0.3 s before the still. The spark fan is laid level toward the Leclerc with a small upward part, so it flies
  into the gap, not up over the T-14's face as the 85 ms spike-star did in the GO render.

**The backdrop.** The burning wagons throw embers and falling fragments at the vanishing point. Two illumination flares
hang in the strip of night sky above the horizon (y 0.70 and 0.81). Their intensities are 0.7 and 0.4; at 2.4 and 1.2
they rendered as two full moons. A low moon behind the lens keys both fronts.

**Why it is new.** The old template had the hero driving across and the foe small and far behind. Here both tanks face
the camera from a raised, tilted lens down the rails, the hero big and charging, the foe's turret front-on, with no
burst between them.

**Lens and light.**
- Lens 'a': fov 48, 5 m up, roll +13°.
- The moon is at 15°, bearing 286.
- Grade: `CLEAN` + `LIT`, exposure +0.35, gamma 1.12.
- Still exposure: 4 ms (`meta.stillExposureMs`).

**The coax is dropped this round.** The two hulls stand 20 m apart, so their muzzles are 8 m apart on one line, and
the Leclerc's fireball fills the first 4.6 m of it. Any coax round would fly into the fireball, or land as an orb over
the Leclerc (film 1 QA). Holding the 24 m spacing the coax needs fails the owner's sizes; no such layout exists. The QA
lessons allow dropping it.

**Final check on the GO dumps** (`rerender-226/features-go`). Clean, with no `!`, FRONT, SIZE or TERRAIN lines:

```
lens a (eye -192.0,7.1,-13.1, fov 48)
  hero leclerc_xlr 20° off its nose (its left) at 14 m, box x -0.93..0.03 y -0.39..0.41
  foe0 t14_x 25° off its nose (its left) at 25 m, box x 0.42..0.94 y -0.35..0.13
```

No wires are flagged, and the bottom-left corner is free. Every effect is timed at T-8 or earlier.
