# vs07-autumn-ariete-t62-r6: the telephoto compression

C2 Ariete v T-62MV-1 on the autumn map, at golden hour. A 10° lens on a hillside looks down into a wooded fold. The
depth collapses, so the near T-62 (100 m), the Ariete on the rise 36 m beyond it (136 m, 5 m higher), and about 200
trees and 200 shrubs from 80 m out to the ridges at 450 m stack into one wall of autumn layers. No sky shows.

**The tanks.** They form a diagonal: the T-62 lower-left, the Ariete upper-right. Their boxes nearly touch in x, and the
two read the same size although one stands 36 m further: that is the subject.
- **The Ariete** stands front three-quarter (35° off its nose) and fires down the slope at the T-62, its muzzle blast
  coming toward the lens.
- **The T-62** stands front three-quarter (40° off its nose), its turret swung back onto the Ariete. It takes a
  ricochet hit (impact, sparks, hot spall), stowage debris comes down round it, and its engine deck smokes. The battle
  wind (bearing 71) carries that smoke left, away from the Ariete.

**The backdrop.** Two earlier HE bursts hang as lit dust behind the Ariete, and a field burns about 85 m deeper in.

**Why it is new.** There is no left-front tank driving in and no right-back tank holding. The hero is stacked above the
foe in a flattened, long-lens frame, and none of the other nine ideas is a telephoto.

**Lens and light.**
- Lens 'a': fov 10, eye (215.7, 2.5 m above ground, -240.6), looking at the pair's mid-point.
- The low sun (8°, bearing 288) rakes in from the right and 20° behind the lens's side. It lights the Ariete's visible
  flank and the T-62's front and catches the dust and smoke. The Ariete's own muzzle flash lights its front.
- Grade: `CLEAN` + `LIT`.

**The one deviation from the brief: hull size.** The heroes are smaller than the house size: the Ariete's box is 20% of
the frame width and the T-62's 23%. That is the price of the assigned long lens. I used the tightest end of the brief
(fov 10) and brought the lens to 100 m from the T-62, a little inside the suggested 120-250 m, so the hulls read at
thumbnail size. A larger hero would need about 80 m at fov 10, which loses the compression.

**Final check.** Clean, with no `!` lines:

```
lens a (eye 215.7,9.5,-240.6, fov 10)
  hero ariete_c2_x 35° off its nose (its left) at 136 m, box x -0.05..0.36 y 0.22..0.46
  foe0 t62mv1_x 40° off its nose (its right) at 100 m, box x -0.44..0.01 y -0.51..-0.20
```

My own census found no tree, record or shrub nearer than either hull overlapping its box, and the bottom-left corner is
free.
