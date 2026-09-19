# Ares APC (`ares_apc_x`) — source-fidelity packet

**Exact configuration:** the owner's supplied Ares APC reference, carrying an L111A1 12.7 mm remote weapon
station, four roof hatches, four smoke banks (16 tubes), modular side armor, seven road-wheel pairs and the rear
troop ramp. The source is `ares_apc.glb` by 42manako, CC-BY-NC-4.0, raw SHA-256
`6898ae8fd7a65f3b5012657635bcca5ac6c8a82a14ebdb1b8ed2ffbc5015983e`. It is an offline comparison oracle only.

## Assembly and measurements

The raw Sketchfab graph is already one coherent vehicle assembly: 63 mesh nodes, 9,533 triangles, no animation,
skins, camera, or detached duplicate vehicle. The complete source was retained for study; nothing was silently
omitted. `source-x-oracle` baked the reviewed right-handed mapping `[-z, y, x]`, scale 1, translation
`[0.00945018, 0.00130025, 0.00259995]` into the ignored local oracle
`public/models/community-candidates/ares_apc_x_source.glb`. Its canonical SHA-256 is
`f43fce5b07bcd04f6089aa23338ed3c4114ff75866eec0ce98e1800171891ff1`; bounds are 3.9099 m wide × 3.2387 m high
× 7.2120 m long, grounded at y = 0. The source graph does not establish honest complete moving-owner masks, so
QA uses whole-source fixed comparison and never fabricates articulation.

The scalar record [ares_apc_x.source-measurements.json](ares_apc_x.source-measurements.json) contains the canonical
envelope, roof/floor profiles, running-gear stations, ramp, side armor and RWS anchors. It contains no source
vertices, indices, textures, materials, or topology.

## Independent procedural construction

`src/vehicles/profiles/aresApcX.ts` builds the playable from original primitives:

- a closed station loft for the troop hull and sloping bow;
- separate aft shoulder pods around a recessed, hinged troop ramp, preserving the real stern air and seams;
- seven measured road wheels per side, separate end wheels, four covered return rollers, articulated suspension
  and linked British rubber-pad tracks through `KIT.buildRunningGear`;
- continuous closed side-appliqué lofts with shallow authored seams and skirts, plus an open rail-built front brush guard;
- four separate roof hatches with hinges and handles, and 16 blind-bore smoke tubes with real open mouths;
- a true hull → RWS yaw → L111A1 pitch chain. The source-measured machine gun is an original receiver, feed,
  ammunition box, cradle, barrel, muzzle bore and optic assembly stamped through the fitting integrity census.

No source geometry, material, texture or runtime model loader is imported by the profile. The singleton
`aresApcX` lazy group prevents this vehicle from forcing unrelated British/AFV builders into browser boot.

## Authoritative public facts and gameplay treatment

British Army and General Dynamics UK material identifies ARES as the AJAX-family APC for specialist and support
teams, with a two-person crew plus four carried personnel, a remote weapon station, 800/810 hp family powerpack,
42 t gross vehicle rating and 70 km/h family road speed. The source configuration names the L111A1; MOD material
identifies it as the 12.7 mm Browning/M2 derivative. Sources:

- [British Army — AJAX](https://www.army.mod.uk/learn-and-explore/equipment/combat-vehicles/ajax/)
- [General Dynamics Land Systems UK — AJAX](https://uk.gdls.com/ajax/)
- [General Dynamics UK — AJAX variants](https://generaldynamics.uk.com/wp-content/uploads/2021/09/Ajax-Variants-Super-Diary.pdf)
- [General Dynamics UK — AJAX family data sheet](https://generaldynamics.uk.com/wp-content/uploads/2018/12/GDUK3046-AJAX-data-sheet.pdf)

Protection figures are not public. The tier-VII spec therefore labels its deliberately modest armor values as
gameplay abstractions, preserves the authentic .50-caliber armament rather than inventing a cannon or missile,
and balances the platform through mobility, hit points and fast belt-fed fire.

## Quality contract

The target is the 92/100 exemplar fidelity bar. HIGH and LOW retain identical 3.910 × 3.240 × 7.212 m envelopes;
HIGH uses 19,138 profile triangles and LOW uses 12,226 (63.9%); the native Gallery render census is 75,962 versus 56,602 triangles (74.5%). LOW reduces radial segments, the linked ready-use belt, shallow appliqué fasteners, and secondary suspension detail while retaining the exact envelope, defining silhouette, equipment, and material roles.
The final whole-vehicle fidelity pass scores 95.5, with every cardinal/diagonal view at 93.7 or better and the
previous rear-view weakness corrected to 94.8. The generated geometry artifacts and the independent visual review below cover
those checks. They do not establish the pending combined release result.

## Final visual acceptance — 2026-09-19

A fresh independent review by the `ares_visual_critic` subagent inspected all 14 newly acquired native
source/procedural comparisons plus actual Garage HIGH and LOW neutral/oblique pairs. All required comparison
views score at least 9/10 (9.0–9.3); `close-roof` is the weakest at 9.0 because the procedural RWS sensor/cradle is
slightly more angular than the oracle, while retaining every defining component in the correct organization.
No view has a blocking identity, proportion, closure, running-gear, ramp, roof-fitting, smoke-bank, RWS or gun
failure. The independent recommendation is **PUBLISH** with no blockers.
This recommendation covers the inspected visuals; combined release qualification
and publication remain separate and pending.

The actual Garage review passes both quality levels. HIGH has coherent camouflage and material roles, closed
geometry and credible contact/shadows. LOW preserves the envelope, seven-wheel silhouette, ramp, hatches,
smoke banks, RWS, gun and material separation without popping, missing equipment, closure regression or shadow
regression. The acquisition records an enabled shadow map, mapped casting lights, a receiving vehicle/stage,
zero browser or resource errors and zero runtime/source/tool drift. HIGH/LOW roots are exact-transform pairs;
the largest natural showroom-camera settle between a pair is 0.000174 m.
The LOW pair uses a capture-wrapper substitution of the production LOW factory
model at the HIGH pedestal transform in the actual Garage. It certifies that
model's appearance, not the ordinary renderer's LOW-settings selection behavior.

Private regenerable evidence is stored under
`.qa-dev/tank-run/ares-final-review/`: `official14/ares_apc_x` contains the authenticated comparison images and
input identity; `garage` contains the four HIGH/LOW images and renderer receipts; and
`independent/ares_apc_x-review.json` records critic authorship, per-view grades and findings. The first Garage
attempt, which rejected a stricter byte-exact live-camera assertion, remains preserved as
`garage-failed-camera-drift` rather than being overwritten.

The capture exposed the internal camouflage label `SIG_ARES_APC_X`. A subsequent UI-only localization change
renamed it to “Ares NATO Woodland” / “阿瑞斯 北约林地迷彩”. That follow-up changes no vehicle geometry, materials,
lighting, camera, or source registration, so it does not invalidate the model evidence. The final production
selection probe still needs to verify the displayed label separately.

### LOW Garage acquisition correction — 2026-09-19

A later independent audit found that the historical LOW substitution called the
factory without the live engine context, so it omitted the production cascaded
shadow material registration. Enabled lights and shadow maps in that receipt
do not establish the missing material setup. Its geometry observations and
canonical fourteen-view review remain historical evidence; the old LOW Garage
shadow verdict is superseded for qualification. Final acceptance requires fresh
HIGH/LOW Garage images with the actual live setup/release context, verified
material registration and independent review. This corrects the private capture
procedure; it is not evidence of a production LOW renderer defect.
