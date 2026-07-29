# Carryover from critique round 5 (verifier notes)

All eight r5 handoffs were applied and deleted (camo_spotting, content_breadth,
gameplay_feel, killcam_shotinfo, lighting_post, performance_budget grassLOD
patch, tank_models). Items below were deliberately NOT applied, or are known
issues preserved from the deleted docs.

## Deferred (owner call / budget risk)

1. **Far-tree shadow casting (lighting_post r5 §5, minor)** — re-enabling
   `castShadow = true` on the far-canopy pair in vegetation.js (`farMeshes`
   builder) costs ~0.5M tris/frame. With the grassLOD patch the merged tree
   measures ~6.67M on verdant vs the FROZEN 7.0M gate — only ~0.33M headroom,
   so the verifier did NOT take it. Middle option if a future round wants it:
   cast canopy only (not trunks), re-measure with
   `node tools/perfprobe.mjs --seconds 20 --dsf 1 --no-trend`.

2. **pziii_konserwa flat-grey material (content_breadth r5 §2, minor)** —
   spec already has `paintUntextured + stripBakedTextures` (specs.js ~1759)
   yet the r5 critic saw untextured clay. Not verifiable from the 16 contract
   shots (the vehicle appears in none). If still grey in the garage carousel:
   route through the `newc_pziii` panzer-grey + AO branch
   (modelLoader.js ~1344) or drop it from AI battle pools / techtree gold.

## Known pre-existing regression (documented by lighting_post r5 §6)

3. **Harness-SEQUENCE explosion capture renders the victim's hull deck as a
   near-black slab** while a DIRECT `__SHOTS.set('explosion')` after boot
   renders the same wreck correctly. Repro tools:
   `node tools/tmp-lp5b-seq.mjs out.png` (sequence) vs
   `node tools/tmp-lp5b-exshot.mjs out.png` (direct);
   `tools/tmp-lp5b-luma.mjs` samples boxes (deck box `"deck,1020,640,60,40"`).
   Reproduces with pre-r5 light constants, so it belongs to the burn-clone /
   setDestroyed restage path (tankFactory.js/effects.js), not to the r5
   lighting patches. Still visible in shots/explosion.png this round (turret
   reads fire-lit; hull deck black).

## Perf certification bookkeeping (performance_budget r5 §2/§5)

4. The round-close merged tree must be certified by
   `node tools/perfprobe.mjs --dsf 1` and `--dsf 2` PASS pairs with valid
   quiet stamps in docs/perf-after.json. `tools/quietcert.mjs` automates the
   wait (log: docs/quietcert-r5.log). If the runner fired before this commit
   landed, relaunch:
   `cd <repo> && nohup node tools/quietcert.mjs >> docs/quietcert-r5.log 2>&1 &`
   Tasks #194/#226/#251 close when perf-after.json carries the merged-tree
   PASS pair.
