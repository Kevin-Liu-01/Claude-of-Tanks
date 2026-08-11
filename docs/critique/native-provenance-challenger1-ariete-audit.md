# Challenger 1 and Ariete native-design audit

Date: 2026-08-11

## Scope

The active Challenger 1 and Ariete builders were compared against their
earlier in-house procedural builders across the same fourteen reference-guided
views. This was a code and rendered-pixel audit; no external asset was enabled
as playable geometry.

## Finding

Both generations are our own procedural work. Neither active builder imports,
samples, converts or packages the comparison GLB. The previous “owner-source”
terminology described the visual-reference campaign, not a source-mesh
transplant, but it was misleading and is retired.

A wholesale rollback was rejected because it visibly restores known defects:

- Challenger 1 regains wall-like deep skirts, obscured running gear, a boxier
  turret and a flatter rear service silhouette.
- Ariete regains a tall slab side, buried seven-wheel cadence, a large
  rectangular turret/bustle and a much less faithful roof plan.

The active native builders preserve the stronger in-house result: readable
native wheels and tracks, low connected primary masses, physically seated
equipment and cleaner hull/turret ownership. Their runtime symbols and records
now say `Native2026` / “native procedural, reference-guided” so provenance is
unambiguous.

## Policy

External models may inform visual comparison only. Shipped vehicle geometry
must remain authored in our profile code and shared primitive/fitting library.
No external mesh, vertex stream, texture, material, rig, animation or derived
conversion is accepted into these builders.
