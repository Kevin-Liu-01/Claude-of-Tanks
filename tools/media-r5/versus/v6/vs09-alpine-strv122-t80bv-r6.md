# vs09-alpine-strv122-t80bv-r6: the wide-angle hero (pass 2)

The owner asked on 2026-10-16 for "tank fronts more ... tanks should be more % of frame" and "more interesting camera rotation and angles". The shipped pass is kept in `archive/vs09-alpine-strv122-t80bv-r6.shipped-20261015.*`.

A wide lens now stands 3.4 m over the snow of Glacier Pass's northern cross road. It is rolled +10° (a Dutch angle) and looks down past both tanks to the saddle and the mountain wall. The Strv 122 (winter) charges up at it at 12 m/s, 9 m off, nose on at 32°, filling the right half of the frame (48 %) with a rooster tail of snow behind it. Its turret is swung left onto the T-80BV, and it fires a live `muzzle_flash` at T-42 with recoil, the bore about 60° across the view. The T-80BV (winter) stands 18 m off on the left, nose to the lens at 16°, at 24 % of the frame, its gun laid back on the Strv. It has just been hit: its engine deck is smoking and spall and sparks from 0.7 s earlier are still flying. Its spilled fuel burns on its far side (fire, smoke, embers and fragments behind it, nothing on it), so the backlit hull reads against it.

This keeps the wide-angle hero archetype, but with both noses on the lens, seen from above at a tilt; it is not the old template. The low morning sun at 105°/15° stands 72° off the view to the left, out of frame: raking light on the Strv's glacis, a grey shadow side to the powder, and a morning glow in the sky.

Lens a: 3.4 m, rolled +10°, fov 66. Lens b: 2.4 m, rolled +13°, fov 66. The picture is CLEAN plus LIT, with the lockup corner open snow.

Checked on the 226 CPU dumps (`features-cpu-75f9d52e7`): the terrain sightlines and the route are clear, no shrubs are in frame, and no effect is later than T-8. The check is clean, with no `!` lines:

```
vs09-alpine-strv122-t80bv-r6 (alpine morning, sun 105/15, still 7000 ms)
  lens a (eye 145.7,4.7,193.6, fov 66)
    hero strv122_x 32° off its nose (its left) at 9 m, box x -0.10..0.85 y -0.81..0.11
    foe0 t80bv 16° off its nose (its right) at 18 m, box x -0.87..-0.38 y -0.07..0.30
  lens b (eye 145.7,3.7,193.6, fov 66)
    hero strv122_x 32° off its nose (its left) at 9 m, box x -0.09..0.86 y -0.60..0.23
    foe0 t80bv 16° off its nose (its right) at 18 m, box x -0.88..-0.38 y 0.01..0.41
```
