# Projected muzzle annulus — independent review, 2026-09-18

**Scoped code-review PASS; no concrete blocker found.** This review covers the projecting-rim correction, not final rendered muzzle acceptance or the queued 26-model/quality native regression. No runtime edits or competing native jobs were made.

Reviewed exact files:

- `src/vehicles/physicalMuzzleBore.ts`: SHA-256 `a5321cc00ed6b143b1d654470ff96ff21c81064fc1322dffa86cef7cd85603e4`.
- `src/vehicles/physicalMuzzleBore.selftest.mjs`: `4fdb1fc14f964c6e7e266ffe5b269123d028a248328e7f654ebdddc1db8df844`.
- CV90 source profile context: `38ad6cee8359afdda5f544cfb2d91ac46164208fa0a4db99744c969003c40a5c`.

Compared the runtime implementation against the saved pre-correction complexity candidate. Only axial hit collection and annular-rim verification change. Radii validation, terminal stock metrology, visible-material eligibility, five aperture/backstop witnesses, twelve inward-wall witnesses, and their tolerances remain unchanged. The existing declaration is bounded by actual terminal vertices and measured projection; an undeclared lip still fails.

## Why the new witness is valid in this scope

Ordinary mouths still require the first hit at each midpoint-ring sample to be within 5 mm of the mouth. Only a positive declared projection and a first hit more than 5 mm forward activate the alternate path. That hit must remain within the declared projection plus the existing 1.5 mm metrology tolerance. Another actual FrontSide hit on the same ray must reach annular stock within the unchanged 5 mm seat. The projecting lip itself therefore cannot supply the seating result.

If any midpoint is occluded, four additional rays at one quarter of the annulus width must each hit seated annular stock first. This rejects a brake covering the entire mouth face. Aperture rays still start ahead of all actual stock and independently require the recessed backstop, so the new search for a seated rim is not used to excuse an aperture cap. In CV90 the nominal 50 mm throat retains the measured outer brake and 65 mm recess; the changed midpoint crosses a legitimate projecting lower brake. No larger rim-seat tolerance is introduced.

## Negative-fixture inspection

The test retains an outer cylinder when removing the annular face, so missing-rim failures reach the annular check rather than accidentally failing outer-radius metrology. It separately rejects: displaced rims on both sides at 6 mm; missing face behind the real lip; exposed inner stock without midpoint stock; midpoint stock without exposed inner stock; transparent zero-opacity rim; an added cover over the inner annulus; and an overlong crossing bar whose vertices lie outside the metrology window. Restoring real stock restores the original seat result. Existing capped aperture, missing backstop, missing/wrong-winding wall, undeclared projection and oversized declared radius negatives remain present.

These fixtures were read independently; the author's reported passing execution and pending actual filled HIGH/LOW census are separate receipts, not executions performed by this review.

## Limits

This remains a finite witness contract, not a proof that every angular point on the annulus or aperture is unobstructed. Partial stock between sample rays can remain undetected, as in the prior contract. Actual native bore rendering and final independent views remain required. The additional work is construction-time: four extra raycasts only for projected/occluded mouths and transformation of returned axial hits; no per-frame work was added. Exact construction-cost impact was not benchmarked here.
