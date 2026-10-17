# vs10-steppe-chieftain-t64-r6: the night kill shot from above (rev 5)

**Composition.** A high lens (4.6 m), looking down 11.5° and rolled -11° (the opposite way from vs01), on open steppe north
of the village. The Chieftain Mk 10 is big on the right, 15° off its nose, 12 m out, its body 42 % of the frame's width (50 %
with the barrel). Its turret is swung 100° onto the T-64BV, so the bore runs into the depth onto it. The killing shot is a `muzzle_flash` 69-81 ms old
with no round and the barrel recoiled. Its fireball rolls out into the gap and stops about 0.07 short of the T-64BV.

The T-64BV is on the left, 24 m out, its body 26 % of the frame's width, 25° off its nose with its front toward the Chieftain
and the lens. It was killed 3.5 s before the still with its turret kept on, and is now a burning wreck with its fire-lit
column up. A medium cook-off, a second old, burns 13 m beyond it and 3 m to its left, so the hull's edge stands dark
against the fire. Debris falls, embers drift, and a doubled cook-off column with a fire field burns behind it. The tanks
run blacked out.

**Why it is new.** Here the shooter is above-the-shoulder big and nose-on, and the kill burns at mid-distance under a
Dutch high angle. The railyard idea is the other night scene, but it is a tracer duel. This one is a finished kill.

**Rev 4:** the owner asked for fronts, bigger tanks and more interesting angles.
- The Chieftain is 15° off its nose instead of 45°, and 46.5 % of the width instead of 38 %.
- The T-64BV is 25° off its nose and 24 % of the width instead of 15 %.
- The lens moved from 1.5 m to a 5 m high angle, looking down and rolled -11°.
- The layout is mirrored, with the Chieftain on the right.
- The ground wave is dropped, because that ground lies in front of the T-64BV.

**Rev 5 (GO QA):**
- The barrel was carrying the size, so the lens is 4.5 m nearer and both hulls are drawn in toward the middle. The
  Chieftain's body (hull and turret, no barrel) now fills 42 % of the width, 12 m out, and the T-64BV's body 26 %, 24 m
  out. The empty foreground is gone.
- The turret is at -100°, near its true aim of -92°, so the blast runs into the depth and clears the T-64BV.
- For the dark glacis: the moon is now 165° off the view, nearly behind the lens, with a picture lift of
  [0.02, 0.022, 0.03] and exposure +0.4.
- To trim the core's needle spikes, the shot is 75 ms old: the overpressure jets are spent and the fire is orange.

**Lens and light.** Lens a: 4.6 m lift, 4.5 m forward of the old eye, fov 40°, pitch -11.5°, roll -11°, looking at bearing 60. Lens b:
5.4 m, pitch -13.5°, roll -14°. It is night, with the moon at azimuth 225, elevation 34, at exposure +0.4.

**Check.** On the GO dumps, clean with no `!` lines:

```
lens a  hero 15° off its nose at 12 m, box x -0.08..0.92 y -0.82..0.49 (body 42 %)
        foe0 25° off its nose at 24 m, box x -0.93..-0.38 y -0.36..0.09 (body 26 %)
lens b  hero 16° at 12 m, x -0.08..0.88; foe0 25° at 24 m, x -0.90..-0.37
```
