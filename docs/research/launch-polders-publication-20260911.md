# Polders publication — 2026-09-11

Live production: `v1.0.0+g32c2d0dbc`, normally pushed to main and deployed with
the authenticated CLI. Deployment `dpl_GsPDAJpUPiAMcij7gggzqtBP4DVK`:
https://claude-of-tanks-fzhnfvsup-kl01s-projects.vercel.app

Public https://cot.kevinliu.studio/ returns HTTP200 and the expected version;
index SHA256 `486df87bf22c836ec773750bece8228fa0f8d4c1ee42bf3b0d5e462f162e13da`
matches the authenticated hosted response. The public build passes. Its chunks
differ from local output because Vercel injects public deployment metadata and
the production signaling URL into `import.meta.env`; this is not claimed as a
byte-identical local build. Initial unpromoted deployment omitted the revision
label; the corrected deployment explicitly sets `COT_BUILD_REVISION=32c2d0dbc`.

Fresh native public two-context multiplayer smoke test passes create, invite,
Ready, map selection, Start, both active battles, input/snapshot progression,
exit and verified room closure. Six new snapshots per peer;16/13new input
messages; zero page errors. No browser background overrides. Receipt retained
at `.qa-dev/launch/water-live-native-r1.log`; HTTP/build/promotion receipts use
the `water-*` prefix in the same directory.

This publishes the Polders material change and verification tools/evidence
described in `launch-water-review-20260911.md` and
`launch-night-verification-20260911.md`. It does not include the in-progress
Challenger1 X repair or the new cliff/horizon material experiments. The earlier
checkpoint's resource, fleet, Studio grounding, source-adjudication, broader
environment and CI credential gaps remain open.
