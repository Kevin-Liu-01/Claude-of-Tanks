# vs02-verdant-challenger-t80u-r6: the village street-corner ambush (pass 2)

The owner asked on 2026-10-16 for "tank fronts more ... tanks should be more % of frame" and "more interesting camera rotation and angles". The shipped pass is kept in `archive/vs02-verdant-challenger-t80u-r6.shipped-20261015.*`.

At the same real Verdant corner, the west lane of the east-west road between the granary and the red-brick schoolhouse, the duel now comes to the lens. The Challenger 3 bursts round the granary's corner out of its side lane at 11 m/s, throwing a rooster tail of track-end dust. It is nose to the lens at 25° and fills the right half of the frame (49 %). Its turret is swung across onto the T-80U, and it fires a live `muzzle_flash` at T-42 with recoil, the bore about 60° across the view and the muzzle 0.19 clear of the T-80U in the frame. The T-80U pushes down the lane along the schoolhouse wall, nose to the lens at 20°, at 24 % of the frame, its gun laid back on the Challenger. Sparks from the Challenger's last round (0.26 s old) fly off its front, with no fresh glow on it. Its own HE round burst on the granary corner behind the Challenger 1.4 s earlier, so smoke and masonry rise and fall behind the hull. A doubled cook-off column stands at the lane's end between the two guns, and a fire burns on the T-80U's far side.

This is still the street-corner ambush, with the schoolhouse, the granary and the lane framing the duel, but it is now a nose-to-lens meeting at a low Dutch angle, not the old drive-in layout.

Lens a sits 0.55 m off the dirt, rolled -8° (the frame's right side down), fov 58. Lens b is at 0.8 m, rolled -12°, fov 60. The telephone line is behind the lens. The sun is a fair-weather day sun at 31°/36°, on both fronts. The picture is CLEAN plus LIT, with the lockup corner open lane.

Checked on the 226 CPU dumps (`features-cpu-75f9d52e7`): the terrain sightlines and the route are clear, no shrubs are in frame, and no effect is later than T-8. The check is clean, with no `!` lines:

```
vs02-verdant-challenger-t80u-r6 (verdant day, sun 31/36, still 7000 ms)
  lens a (eye -12.0,2.9,70.0, fov 58)
    hero challenger_3x 25° off its nose (its left) at 13 m, box x -0.17..0.81 y -0.15..0.77
    foe0 t80u_x 20° off its nose (its right) at 21 m, box x -0.85..-0.36 y -0.34..0.01
  lens b (eye -12.0,3.1,70.0, fov 60)
    hero challenger_3x 25° off its nose (its left) at 13 m, box x -0.16..0.77 y -0.17..0.75
    foe0 t80u_x 20° off its nose (its right) at 21 m, box x -0.81..-0.35 y -0.43..-0.06
```
