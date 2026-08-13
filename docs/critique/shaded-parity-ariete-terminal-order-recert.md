# C1 Ariete terminal-order re-certification

Freeze: `151906a0` (50 meshes / 76,599 vertices)

- First-party procedural playable only. The active route is the stronger
  repository-authored `buildArieteNative2026`; historical comparison binaries
  and active oracle routes remain unavailable to runtime.
- Running order: front idler, seven road wheels, four return rollers with
  suspension arms, rear final-drive sprocket.
- Exact strict clearance: band 0/0, shoes 0/0, moving sweep 0/0.
- Parent audit: 0 stranded, 0 abutting, 0 dangling.
- Winding: 0 reversed, 0 mixed; 31 px / 0.04% null deficit.
- Evidence: `/private/tmp/ariete-native-final-r3/ariete`, 45 PNGs / 45 unique
  hashes (15 paired, 15 yaw0, 15 yaw90, including elevated-left profile).
- Fresh standard vector:
  `[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.1,9.2,9.1,9.2,9.1,9.2]`.

Verdict: PASS / KEEP. The free idler is visibly separate ahead of all seven
road wheels, the final drive is separate at the rear, and neither terminal,
bow shoulder, sponson nor skirt enters the sole linked-shoe course. The low
cast-form turret and its complete combat/basket suite remain seated through a
genuine yaw quarter-turn.

## 2026-08-13 outboard terminal-face supersession

The previous clearance repair was mechanically correct but the exterior
terminal faces remained behind the outer shoe plane. In the mandatory
elevated profile that made both ends read as black knots instead of an idler
and drive assembly. The active first-party builder now adds concentric olive
dishes, dark recessed rings and hubs at both ends, plus a bolted rear drive
cadence. These are wheel faces only; the existing native loop remains the
sole moving track course.

Freeze **`96d3d9e8`** reproduces twice at 51 meshes / 83,799 vertices.
`/private/tmp/ariete-leclerc-track-final-r1/ariete` contains 15 authored
standard views, 15 yaw0 views and 15 yaw90 views: 45 PNGs / 45 distinct
hashes. Exact band/shoe/sweep clearance remains 0/0/0, parent audit is
0/0/0, winding is clean, articulation passes and bore contrast is 124.5.
The elevated profile now reads, without ambiguity, **front free idler ->
seven road wheels -> four return rollers / torsion arms -> rear bolted final
drive**. **KEEP `96d3d9e8`; retire `151906a0`.**
