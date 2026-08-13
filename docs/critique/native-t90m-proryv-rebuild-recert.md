# Native T-90M Proryv rebuild re-certification

Current authored candidate: `buildT90MProryvNative2026`.

## Provenance

- Runtime geometry is authored by the repository's procedural builder.
- `/models/tanks/t90m_minehffd.glb` is used only as a render and measurement
  oracle. No source vertices, converted arrays, generated mesh payloads, or
  runtime GLB nodes enter the playable.
- The complete hull is a repository-authored low V-bow loft with a raised,
  track-clear shoulder structure. The rotating package uses the mature welded
  Tagil fighting compartment, but its calibration-era rear boxes have been
  removed and replaced by one closed, continuously tapered asymmetric bustle.
- The authored Relikt, roof stations, supported rack and native six-wheel
  course are primitive-built at runtime. This complete native replacement is
  active; the older mask-shaped builder is retired because its slabby primary
  masses no longer represent the owner's accepted Proryv design.

## Quantitative receipt

- Procedural fidelity: **90.96**.
- Required-view floor: **90.02**; every standard view is at or above 90.
- Whole silhouette: **92.73**; hull: **91.67**; direct turret: **86.86**;
  native running-gear profile: **91.25**. The comparison export assigns only
  the forward gun tube to `Main_barrel`; its sleeve and root remain turret
  siblings, so the direct-turret component is not a valid acceptance law. The
  complete seated vehicle clears every required view.
- Exact track containment: front/rear smooth band **0/0**; front/rear
  individual shoes **0/0**; blind spots **0**.
- Reference/procedural overall boxes are 3.78×2.25×9.64 m and
  3.78×2.26×9.31 m. The authored hull is 6.71 m versus the published 6.86 m;
  the shorter overall box is the deliberate compact gun/bustle envelope, not
  a scale or registration error.
- The legacy geometry-gate minimum is an honest **27.1 FAIL**. That contour
  gate was fitted to the retired slabby builder and its source component tree;
  it conflicts with the independently reviewed native shape. The generated
  red row is retained and disclosed rather than reshaping our model back
  toward comparison geometry.

## Render-truth and articulation receipt

- Winding: **0 reversed, 0 mixed**; the four-pixel worst deficit is 0.01%
  and produces no visible surface wound.
- Muzzle probe: **PASS**; inner 12.6, surround 102.5, contrast 89.9, with a
  visible open bore and tagged rim/disc structure.
- Turret-parent audit: **PASS**, stranded 0 / abutting 0 / dangling 0.
- Evidence packet: `/tmp/critic-t90m-proryv-native-final-r4/t90m`, containing
  **42 PNGs / 42 distinct SHA-256 hashes**.
- Yaw0 to yaw90 is a genuine quarter-turn. Gun/mantlet, closed shell, all
  Relikt, bustle/lids/rack, both cupola stations, Sosna/periscopes,
  panoramic/Kord, smoke banks and antennas rotate together.
- Hull, glacis, engine deck, transom, skirts and native six-wheel course stay
  fixed. The departing turret exposes one continuous ring/deck surface.
- The mode-2 candidate `rig_hull/hullCloth#20` is the strapped fixed rear
  drum/service package visible in both yaw states, not stranded turret
  equipment. The spare-track links and tow cable remain supported fixed deck
  stowage.

## Preserve / next refinement

Preserve freeze **`a21894b8`**: 55 rendered meshes / 114,746 vertices, one
connected primary shell, exact native track corridor, calibrated 2A46M-5 axis,
supported bustle and roof ownership. Later refinements must be made on this
authored basis and cannot reactivate the retired mask-shaped builder, use
source geometry, or add another coarse wrapper.
