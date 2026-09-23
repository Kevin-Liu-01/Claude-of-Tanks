# Autumn continuity publication — 2026-09-11

Production is `v1.0.0+g346ff83bb`, normally pushed to main. Deployment
`dpl_7kSetmcqMD4Q4HnubMdc3HyeGfsb`:
https://claude-of-tanks-dvkmqg7v2-kl01s-projects.vercel.app

The authenticated hosted response and public https://cot.kevinliu.studio/
return identical index bytes and the expected version, SHA-256
`0bf757bc3531ba48060306582be863dd4e0711bb9b80a5c57825079bc4b344a5`.
Source upload inspection includes no private comparison GLBs, local QA files,
or secrets. Public build and repository hygiene checks pass.

Fresh native public two-context multiplayer checks pass private room creation,
invite joining, Ready/map/Start controls, both active battles, progressing
input and snapshots, native exits and verified room closure. Both peers have
zero renderer crashes and app exceptions; rooms and browser close successfully.
Receipts are `.qa-dev/launch/autumn-live-native-r2.log`,
`autumn-hosted-verification-r2.json`, `autumn-deployment-r2.json`,
`autumn-promotion-r2.log` and `autumn-push-r1.log`.

This publishes only the Autumn ground/horizon continuity checkpoint and its
documented tests. The separate integration report records all timing results,
including the failed first mobile comparison and unchanged mobile decoration
minimum failure. No full mobile-map, global performance, fleet source-fit,
Challenger 1, Saltwind or Garage-buffer qualification is implied.

The first hosted build omitted revision metadata and returned `v1.0.0`; it
was held without promotion. The second build explicitly pins
`COT_BUILD_REVISION=346ff83bb` and is the verified production deployment above.
