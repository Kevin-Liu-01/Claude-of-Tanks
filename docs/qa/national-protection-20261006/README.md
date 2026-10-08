# Ukrainian and Polish field-protection upgrades — 2026-10-06

Owner request: much more cages, ghillie and ERA for Zoria, Hetman, Sich and Hetman II. The owner explicitly confirmed the same scope for Husarz, Wilk, Zubr and Zubr II, with distinct Polish layouts. No new roster slots.

## Change

Ukrainian vehicles receive connected, supported flank and bustle screens, densely divided ERA courses and leafy suspended camouflage. Polish vehicles receive ordered modular ERA banks, independent removable screens and fitted ULCANS-style scrim. Both retain their existing primary hulls, turret shells, native running gear/fenders, mantlets, roof weapons and equipment. Cages do not cover the central roof, hatches, optics or drone launch sites. Open cage stock uses the existing OpenLattice buckets so it does not become solid interior fill.

| Vehicle | ERA cassette bodies |
| --- | ---: |
| Zoria | 84 |
| Hetman | 100 |
| Sich | 86 |
| Hetman II | 118 |
| Husarz | 190 |
| Wilk | 200 |
| Zubr | 164 |
| Zubr II | 254 |

Each cassette binds to the existing gameplay ERA sectors; these are geometry counts, not new independent gameplay sectors or a claim of real-world armor effectiveness. Fitted width metadata includes the outboard screens and foliage without moving the underlying armor planes.

## Native evidence

Independent HIGH and LOW review passed for all eight: 50,688 main-gun poses, 24,192 roof-gun poses and 1,152 whole-turret yaw poses have no finite triangle crossings. All 16 native drone support, parked and 12 m launch checks pass. Every cage component has a contact path to permanent armor, every ERA body contacts permanent stock, and spending/resetting all six ERA sectors preserves the cage structures. The primary hull/turret/gun/mantlet and running-gear buffers and local transforms remain equal to the pre-upgrade baseline. See the four final JSON reports and exact authored hashes.

Author regressions additionally cover continuous yaw/pitch/recoil envelopes. Initial Sich, Hetman II and Zubr II cage corners conflicted with fully depressed/recoiling main guns; fitted lower end-bay headers eliminate those contacts while retaining all cage bays. Initial Ukrainian failure evidence is retained here; the Zubr II witness is a negative control in the focused selftest.

New registered tests: src/vehicles/profiles/nationalUkraineProtection.selftest.mjs and src/vehicles/nationalPolandProtection.selftest.mjs. Shared ghillie, national physical integration, TypeScript and the public production build also pass. A separate six-case native drone search (HIGH/LOW × three camouflage seeds) passes all 48 cases; it supplies a newly qualified Husarz seat for the refreshed receipt. The fitted overall widths were also verified against all 16 native builds.

## Unfinished qualification

Native screenshots, refreshed all-fleet anatomy and technical diagrams, final all-fleet drone receipts, the private build and the complete release gate remain pending in the shared capture/generation pipeline. The eight changed vehicles already have fresh interior fills and drone records, and the full control inventory was regenerated. This packet is not a publication approval or a full release pass. Earlier screenshot receipts do not cover this change. The interactive local Gallery exposes the actual new procedural models while those checks are pending.

Added near-view geometry is 17,658–32,330 triangles per vehicle in both quality levels, with 3–9 additional visible meshes. Final totals are 116,552–132,328 HIGH and 86,456–102,232 LOW. These are measured counts; frame-time and selection-performance approval is still pending with the actual Garage captures.
