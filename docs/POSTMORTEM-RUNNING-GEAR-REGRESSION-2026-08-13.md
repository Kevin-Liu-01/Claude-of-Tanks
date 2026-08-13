# Running-Gear and Authored-Model Regression Postmortem

Date: 2026-08-13

Rollback boundary: `68c20cc773fb71864c2106b8e47d33d64be803b7`

Boundary description: `Correct Abrams ghillie scope and track clearance`

## Executive summary

After `68c20cc`, a fleet-wide running-gear standardization campaign modified
many already-authored vehicle families at once. The campaign attempted to
enforce one terminal-wheel silhouette and one track-clearance strategy across
vehicles whose hull sections, skirts, fenders, wheel order, and terminal
geometry were intentionally different.

The most damaging operation was a broad suspension-corridor transform applied
to generic merged `hull` buckets. Those buckets contained pressure-hull
sections, side skirts, mudguards, fenders, lights, service fittings, and visual
backers. Moving or clamping vertices by bucket name therefore did not isolate
the underside. It raised, collapsed, narrowed, or detached visible side and
front geometry. Tanks could pass a numerical track test while looking hollow,
losing their original hull silhouette, or showing skirt seams separated from
their panels.

At the same time, several already-authored turret families were replaced or
reshaped to satisfy generalized family targets. Armor and equipment were then
re-seated against the replacement shapes. Some parts were technically in the
rotating group but did not have credible visible contact with the new shell.
This degraded T-72, T-80, T-90, Challenger 1, Ariete, Merkava, Type 10, Patton,
and other previously stronger authored designs.

The correct recovery is not another fleet-wide geometry pass. `main` is being
returned to the exact tracked state of `68c20cc`, with this postmortem added as
the only new file.

## Impact

- Visible pressure-hull and side-armor sections disappeared or became hollow
  in side and elevated-profile views.
- Side skirts and mudguards moved upward while their seams, lips, or backing
  remained at the original height.
- Some bows became thin, incomplete, or visually detached from the fenders.
- Some idlers were forced into a generalized raised layout even when the
  vehicle's authored geometry required a different terminal relationship.
- Several family turrets were replaced or morphed unnecessarily; armor,
  sights, smoke launchers, machine guns, baskets, and antennas no longer read
  as naturally seated on the new shell.
- Regenerated icons and cached model assets propagated these regressions well
  beyond the source files that introduced them.
- Graduation notes and hashes overstated quality because they relied on stale
  evidence or collision receipts after the visible geometry had changed.

## Root causes

### 1. A generic bucket was treated as a semantic component

`hull` is a render/material bucket, not a pressure-hull component boundary.
Applying `raiseTrackCorridor(['hull'], ...)`, broad scaling, or broad offsets to
it also transformed skirts, guards, fenders, and service details. The code
could not distinguish the inboard underside from the visible vehicle skin.

### 2. A fleet preference became an incorrect universal law

The desired order—front idler, road wheels, return rollers, rear final-drive
sprocket—is a useful default, not permission to overwrite real exceptions or
already-correct authored layouts. Enforcing a single raised-terminal amount
across every modern tank changed silhouettes and wheel courses that should
have remained family-specific.

### 3. Numerical clearance was allowed to outrank live pixels

Band, shoe, and sweep receipts are necessary mechanical checks, but they do
not prove that the hull still exists, that the skirt remains at the correct
height, or that the vehicle retains its authored silhouette. A zero-overlap
receipt cannot graduate a visibly hollow tank.

### 4. The review loop accepted stale evidence

Some certification decisions reused earlier paired/yaw judgments after the
candidate changed. Other reviews inspected only selected views or treated a
technically shared parent as proof of physical seating. This allowed the live
garage model to diverge from the evidence described in documentation.

### 5. Authored models were unnecessarily rebuilt

Models already authored in this repository were discussed as if they needed
provenance recovery or wholesale replacement. That framing encouraged broad
rebuilds instead of narrow regression fixes. The correct statement is simple:
these are our authored models, and reference assets are visual targets only;
their geometry is not copied or shipped.

### 6. Change size and asset regeneration amplified mistakes

Dozens of families were edited and regenerated before a stable visual baseline
was re-established. Small commits did not make the program safe because they
shared the same flawed global assumption. Generated icons and manifests then
made rollback and attribution harder.

## Escape points

- No immutable before/after elevated side profile was required for every tank.
- The track gate did not fail on lost pressure-hull silhouette or displaced
  skirt panels.
- The parenting gate verified membership more readily than visible load path.
- Family-wide helpers could mutate generic material buckets without an exact
  component allowlist.
- Documentation could claim graduation without proving that all images were
  fresh for the exact candidate hash.
- There was no stop-the-line rule when multiple families regressed in the same
  visual pattern.

## Corrective actions

1. Restore the tracked tree to `68c20cc` before doing more vehicle work.
2. Treat every restored model as authored here. Do not relabel it as imported,
   recovered, donor-derived, or source-derived.
3. Make future fixes per tank or tightly related family, never through a broad
   generic-hull transform.
4. Preserve the existing primary hull and turret unless live evidence proves
   that a specific authored component is wrong.
5. Require the same fresh comparison set for every meaningful geometry change:
   direct left/right, elevated left/right, front, rear, quarters, top, close
   roof, and yaw 0/90.
6. In the elevated side view, explicitly verify pressure hull, bow, side skirt,
   idler, road wheels, return rollers, final drive, and both terminal runs.
7. For turret changes, explicitly verify that armor and every decoration has a
   broad visible seat at yaw 0 and yaw 90. Shared parenting alone is not a pass.
8. Separate pressure-hull underside, skirts, mudguards, track guards, and
   running gear into explicit component buckets before any mechanical edit.
9. Keep terminal order and height family-specific, with documented real-world
   exceptions. A default must never become an automatic geometry mutation.
10. Require both mechanical receipts and live visual approval. Either can block
    graduation; neither can substitute for the other.
11. Freeze the exact candidate hash before rendering and reject any packet if
    code, assets, or hashes change during review.
12. Commit and push only after one complete family is visually and mechanically
    verified. Regenerate only that family's assets.

## Validation for this rollback

- The staged tracked tree was compared directly to the tree object of
  `68c20cc` before this document was added.
- Both tree hashes were `d4e360e124f35684952728a1fde894a54fe159c3`.
- Therefore all tracked runtime code, vehicle profiles, generated tank assets,
  and pre-existing documentation are restored exactly to the requested
  boundary; this postmortem is the only intentional addition.
