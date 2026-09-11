# T72B3M private finish lifetime — 2026-09-11

The T72B3M builder allocated a private turret-ring geometry/material and cloned dark gun finishes without adding them to its existing disposal owner. Their meshes rendered correctly, but disposing the vehicle left the three materials and ring GPU geometry alive. The fix registers those exact existing resources in `P.disposables`; it changes no geometry bytes, shader, material property, pose, or draw order.

## Actual identity and native evidence

Base: `d39045b688218d111896d8962c7a35ced6e62fb8`. Evidence: `.qa-dev/launch/t72-material-lifetime-native-r1/{report,identity-assertions}.json` in the isolated lifetime worktree. The native fixture constructs two T72B3M actors and a high-detail Type90 witness, then exercises warm/far/detail return, track/ERA spend, wreck/reset, Garage presentation, close views, dim lighting, one-actor disposal and final disposal. All 15 screenshot pairs are byte-exact against baseline; there are no console, GL, or cleanup errors.

The receipt follows six actual private material IDs and two ring geometry UUIDs. They retain their identities through spend/wreck/reset. Disposing the second T72 releases only its resources; the first remains live. Final disposal fires once for each candidate resource, versus zero for the corresponding leaked baseline resources. Final renderer geometries fall from 3 to 1 (the ground), and live material identities from 8 to 2 (ground and the existing global shadow proxy). These are disposal-fixture counts, not a claim that active battle material ceilings are fixed.

`src/vehicles/profiles/t72MaterialLifetime.selftest.mjs` exercises two actual procedural builders, destroys/resets them independently, and checks material/geometry disposal events and retained sibling identities. It is included in the pre suite. Focused test, typecheck and public build pass. Type/public build results are recorded separately in `.qa-dev/launch/t72-material-lifetime-type-build-r1.log`.

## Limits

This is an ownership repair for one existing builder. It does not establish full fleet visual approval, full game context-restore behavior, night-controller correctness, or frame-time improvement. The separate inherited Three.js context-restore disposal warning and unrelated profile leaks remain distinct findings.
