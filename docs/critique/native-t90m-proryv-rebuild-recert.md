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
  course are primitive-built at runtime. The alternate experimental turret
  replacement remains inactive because it lost the required silhouette.

## Quantitative receipt

- Procedural fidelity: **91.38**.
- Required-view floor: **90.03**; every standard view is at or above 90.
- Whole silhouette: **92.80**; hull: **91.57**; direct turret: **88.73**;
  native running-gear profile: **91.22**. The direct-turret diagnostic is not
  the acceptance law; the complete seated vehicle clears every required view.
- Exact track containment: front/rear smooth band **0/0**; front/rear
  individual shoes **0/0**; blind spots **0**.
- Published dimensions remain within the gate: reference/procedural overall
  boxes are 3.78×2.25×9.64 m and 3.78×2.24×9.65 m.

## Render-truth and articulation receipt

- Winding: **0 reversed, 0 mixed**; the three-pixel worst deficit is 0.005%
  and produces no visible surface wound.
- Evidence packet: `/tmp/critic-t90m-native-proryv-r15`, containing
  **42 PNGs / 42 distinct SHA-256 hashes**.
- Yaw0 to yaw90 is a genuine quarter-turn. Gun/mantlet, closed shell, all
  Relikt, bustle/lids/rack, both cupola stations, Sosna/periscopes,
  panoramic/Kord, smoke banks and antennas rotate together.
- Hull, glacis, engine deck, transom, skirts and native six-wheel course stay
  fixed. The departing turret exposes one continuous ring/deck surface.
- The mode-2 candidates `rig_hull/hullCloth#20` and
  `rig_hull/hullDark#21` occupy world z -3.31..-3.04 and y 1.61..1.72. They
  are the strapped fixed rear drum/service package visible in both yaw states,
  not stranded turret equipment. The spare-track links and tow cable remain
  supported fixed deck stowage.

## Preserve / next refinement

Preserve the connected primary shell, exact native track corridor, calibrated
2A46M-5 axis, supported bustle and roof ownership. Later refinements must be
made on this authored basis and cannot reactivate the rounded-dome replacement,
use source geometry, or add another coarse wrapper.
