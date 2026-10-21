# vs07-autumn-ariete-t62-r6: the telephoto compression

C2 Ariete v T-62MV-1 on the autumn map, at golden hour, re-staged on the 226 maps for the owner's 2026-10-16 direction:
fronts, bigger tanks, more interesting camera angles.

**The frame.** A 10.4° lens stands 12 m up, 38 m from the T-62, rolled -8° (the opposite tilt to vs04's). It looks up a
farm road, which runs 6° off the view and leads the eye up the frame.

**The tanks.** The long lens stacks them: the Ariete reads as big as the T-62 although it stands 12 m further, with
the autumn wood close behind. That is the compression.
- **The T-62** comes down the road toward the lens, 15° off its nose and 45% of the width. Its turret is forward, 15°
  from the lens, so its full front faces us. It takes the hit on its far side, low down: a short, low spall of hot
  fragments at 4.5 m/s, 0.3 s old, and a few slow embers. There is no spark shower; from 12 m up, sparks thrown away
  from the lens rose straight up across the Ariete in the GO render.
- **The Ariete** is on the road 12 m behind it, 25° off its nose and 50% of the width. It stands 1.5 m to its own
  right of its first spot, its outer track inside the road's feathered edge. Its gun is laid down onto the T-62's back,
  so its turret front faces us too. It has fired: the blast is 0.7 s old at the 45 mm scale, a thin wisp at the
  muzzle; the 80 mm gas cone sat over its glacis.
- A projection test finds none of the Ariete's nose, glacis, turret face, gun or muzzle points behind the T-62. The
  gun clears the T-62's turret by 0.23 of the frame height.

**The backdrop.** A patch of field burns on the slope behind the pair at the upper right (0.79, 0.83). Its smoke rises
out of the frame top, so no column top shows. There is no stowage debris: its landings kicked big gold puffs either
side of the T-62. A roadside cross, a map prop 4 m tall and 62 m out, touches the upper-left edge behind the Ariete.

**Light.** The low sun (7°, bearing 320) rakes in from 100° right of the view and lights both hull fronts, 52° and 65°
off their noses. The grade is warmed (temperature +18).

**Why it is new.** It replaces the old left-front/right-back pair with a vertical telephoto stack on a road, the hunter
above and behind the prey, both fronts to the lens. None of the other nine ideas is a telephoto.

**Lens.**
- Lens 'a': fov 10.4, eye (-312.9, 12 m up, -339.0), about 9 m above the T-62, turned 2.5° left and laid to centre
  the pair.
- Grade: `CLEAN` + `LIT`, temperature +18.
- Still exposure: 4 ms (`meta.stillExposureMs`).

**Constraints kept.**
- Both hulls sit on the road, so there is no grass at their tracks (film 1 QA).
- There is no live flash.
- There is no engine smoke: the T-62's deck faces the Ariete, so its smoke would rise across the Ariete's front.
- There is no HE dust: behind the Ariete it would haze its turret.

**Final check on the GO dumps** (`MEDIA_R5_FEATURES=…/rerender-226/features-go`). Clean, with no `!`, FRONT, SIZE or
TERRAIN lines. The overlap note is a slight, intended touch:

```
lens a (eye -312.9,14.0,-339.0, fov 10.4)
  hero ariete_c2_x 25° off its nose (its right) at 49 m, box x -0.78..0.22 y -0.04..0.80
  foe0 t62mv1_x 15° off its nose (its right) at 38 m, box x -0.13..0.76 y -0.79..0.27
  overlap: the two boxes share x -0.13..0.22
```

My own census on the GO dumps found:
- no bush hiding any hull sight point;
- no foliage within 34 m of the lens in frame;
- no meule in frame;
- every record sightline clear.

Both hulls sit inside |x| 0.97 and |y| 0.88. Every effect is timed at T-8 or earlier.
