# Focused horizon evidence

`tools/map-environment-audit.mjs` supports `--horizon-view=en|es|wn|ws`
to select one quadrant, and `--horizon-scope-ndc=x,y` to centre the real x8
scope on a chosen ray in the wide image. Quadrant selection requires `--shots`;
NDC requires `--horizon-scopes` and two finite coordinates in [-1,1].
Omitting these options preserves the existing views, order and default rays.
The establishing and whole wide images remain part of a focused capture.

For a 1440×900 frame, convert pixel coordinates using
`x = 2 * pixelX / 1440 - 1`, `y = 1 - 2 * pixelY / 900`.
The Coastal ES review uses `--horizon-scope-ndc=0,0.08`, corresponding to
wide pixel (720,414). This fully exposes the grove previously clipped at the
bottom-right of the default scope frame. It does not crop, relocate the
camera, override quality or replace the production sniper state.

Camera helpers are included in the acquisition hash. Explicit quadrant/NDC
choices are retained in the report and acquisition packet; the emitted scope
contract records the actual projection and target ray. Paired performance
runs remain timing-only: screenshots do not become a timing gate.

## Verified checkpoint

CPU camera/acquisition tests pass, including exact default nine-pose/four-
contract output, optional ES three-pose output, invalid/duplicate arguments,
real Three.js ray projection and scope restoration. The selftest registry
discovers all 789 checks. New/changed functions pass strict complexity/type
metrics; two unchanged legacy function violations are not claimed fixed.

The native launcher `8f7e22cab860eeee4a47f90ba996db89e9ac78ac` produced
`forest-finite-focused-before-r1` and `forest-finite-focused-after-r1` under
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907`.
Its acquisition hash is
`34b6a09a99e7597fc476371ad323d84892c058997a342407bfaffa843808edc4`.
Both runs have exact matching full pose/contract/acquisition packets and
observed Apple M5 Max ANGLE Metal, with no page errors/context loss.

This is a tools-only publication. The separate finite-grove runtime trial
`344ac35f0` was rejected by native review: its opaque raised patches resemble
boulders rather than forests. It is deliberately excluded from main, as are
earlier rejected shell experiments. Accepted map/day-night work is untouched.
