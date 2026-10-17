# vs06-coastal-type10-ztz99a2-r6: the beach charge (owner pass, 2026-10-16; GO-render fix)

This pass answers the owner's notes ("tank fronts more", "more % of frame", "more interesting camera rotation and
angles"). It was checked on the GO dump.

A lens stands on Saltmere Bay's pale strand at (320, -154), 6 m from the water, 1.5 m up, with a -10° Dutch roll (vs05
is +9°). It looks along the shore (bearing 114) with the bay behind the far tank, at fov 34, pitched 2.1° up. The
frame's foot is on the strand too.

The Type 10 charges up the sand straight at the lens, 16 m out, with its front 28° off the lens, and fills 51 % of the
width. Its turret faces the lens: the gun is laid 32° off it, to the frame's left, at a target out of frame past the
lens. Its 175 mm live blast, 42 ms old, sits over a 0.3 s-old blast whose ring and haze read; both stand at the frame's
left, clear of the ZTZ. The ZTZ-99A2 comes up out of the surf on the right, 23 m out and 2 m from the water, front-on
at 14°, and spans 37 %. It fires back at the Type 10: a 120 mm blast 65 ms old, its fire turned orange, in the gap
between the hulls. The Type 10's cheek facing the ZTZ takes its round as a 0.25 s-old ricochet, its fan thrown sideways
and down. Sand bursts trail from both tracks, with `dirDeg` set to each heading. There is no mg_burst, no
`firing_moment` bolt and no effect at T.

The sun at 294°/35° stands behind the lens and lights both fronts. The grade is `CLEAN` + `LIT`, labelled honestly as
day.

GO-render QA found three problems, now fixed. The Type 10 had aimed at the ZTZ 17 m deeper, so its turret showed its
right rear; its gun is now laid off-frame, so the turret face reads. The far water column did not read against the pale
sky, so it is dropped. The lens rose to 1.5 m for more surf and moved onto the pale strand.

This is the only head-on beach landing in the set.

Check (GO dump): no `!` lines. Hero box x -0.90..0.11, y -0.59..0.39. Foe box x 0.16..0.90, y -0.22..0.38. The boxes do
not overlap, and the logo corner is nearly clear.
