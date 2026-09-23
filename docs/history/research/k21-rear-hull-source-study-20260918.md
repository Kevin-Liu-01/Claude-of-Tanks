# K21 rear hull and receiving stock — 2026-09-18

The approved assembled source exposed an overbuilt procedural rear shoulder. The source roof is about 1.953–1.954 m high, with a narrow lower tub and beveled shoulders; the previous procedural rear roof was flat at 2.075 m. This revision corrects that rear body, its hatch, ramp, side channels, fenders and their real supports. A second bounded revision restores the measured open rear lamp guards and asymmetric front headlamp covers and receivers. Turret, gun, running gear, material settings and source registration stay unchanged.

## Frozen source and author revision

- Approved target: `public/models/community-candidates/k21_x_assembled_20260918.glb`, SHA256 `e2103e87628337778107ba4beec0fb5f6ad9e29136eab65ba27aa7f8bfdd956b`.
- Original canonical source: SHA256 `ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8`. Its detached Object_7 was rigidly assembled in the earlier [source-only study](bmp-k21-source-reassembly-20260918.md). Neither source changed in this revision.
- Profile: `src/vehicles/profiles/k21X.ts`, SHA256 `9e800d5f744999d73bf2c86c6ebc33999b6a9599fc47421b4262f2c140cc6791`.
- Focused test: `src/vehicles/profiles/k21RearHullStock.selftest.mjs`, SHA256 `da9c78990bbfc777649826c8fa457417fc3cdcd10b5db9e4551b0224c4bd82b0`.
- Original profile remains authenticated in `.qa-dev/tank-run/k21-rear-hull/profile-before.ts`, SHA256 `ceb4848453657d9acc6ff7dfc8ec8cdf99e3a3cd74e1b658e2a9f15c8353c5f2`.

## Source calipers and authored construction

Object_6 establishes a lower tub at Y .6053 m, X −.9544..+.9563 m; the rear outside shoulder extends to X −1.4861/+1.4885 m, rises to Y1.8612 m, then bevels into the narrower roof. Its rear wall slopes forward toward the floor. The native body uses independent scalar sections and closed caps, without imported source vertices or topology.

The thin outboard rail is an open inverted U channel, with top Y1.8553 m and underside Y1.8495 m. The replacement preserves this air instead of treating its entire bounding box as stock. Its hidden inboard wall seats by approximately .5 mm.

The stepped hatch is centered near Z−3.09475 m, with a 1.0254 × .6973 m upper cover at Y1.9813 m, clipped corners, the measured rear hinge and four U retainers. The lower step has about 1.1 mm of hidden receiving engagement. The broad ramp has the source 1.3613 m width and approximately 8.26° rake; the assembled rounded access door retains its own front-to-back separation. Full-scene rays include the hinges as first occluders.

Rear fender roofs run from approximately Z−3.9375/Y1.1717 to Z−3.5996/Y1.3729 m. Their real inboard/outboard webs and rear lips seat the lower flaps at Y1.038..1.1542 m. The paired Object_20 rear stowage cases replace the earlier low bumper boxes. Their exposed rear faces retain their measured station; a 12 mm extension of the hidden receiving face closes the approximately 9–11 mm source-export clearance, leaving measured native overlaps of 1.34 and 3.11 mm with the wall.

## Proven source overlap and mechanical receiving relief

The supplied model intersects its own upper track stock. At X−1.228/Z−3.20 m, Object_6's underside is Y1.227400 m while Object_9 track traction stock reaches Y1.235633 m. At Z−3.10 m that track stock reaches Y1.242270 m. These are actual source surface hits, not an inference from bounding boxes.

Native moving shoe vertices similarly reached Y1.248387 HIGH /1.249410 LOW over five phases. Raising the visible hull or shifting its wheels would lose measured datums. The parent approved a bounded hidden receiving relief: the inward underside rises from Y1.2274 to1.2700 m over X .9563..1.474 and −1.472..−.9544 m across the corrected rear section. The measured outer wall rim, lower tub and all running-gear datums remain. This 42.6 mm local relief is an explicit physical assembly correction to the source overlap, not a claimed source surface.

The focused test also checks generated `hullInteriorFill` triangles against moving shoes, so later generation cannot silently fill this pocket. An intrusion negative deliberately closes it and must fail.

## Historical first revision evidence

Private originals, failed experiments and hashes are retained under `.qa-dev/tank-run/k21-rear-hull/`; `freeze.json` inventories the evidence. Source studies include `source-study.json`, `source-attachments.json`, `guard-source.json`, `shoe-source-clearance.json` and `shoe-envelope.json`.

The first author revision passed type checking and cold/unfilled construction checks in HIGH and LOW:

- 36 independent complete-source rear-body first-hit/air witnesses, maximum residual .362794 mm, including two air witnesses. Four additional source rays hit unchanged turret equipment; they remain in the source receipt and are not counted as precise rear-body comparisons.
- 12 finite shared-stock attachment seats, actual channel air and source flap ground clearance.
- 1,760 actual moving shoe envelopes per quality over five phases, each expanded by10 mm, clear the corrected rear stock.
- Wrong flap seats, deleted rail, filled channel and track-pocket intrusion negatives are rejected.
- Cold selected geometry:55,342 HIGH /34,646 LOW (62.60%). These are construction costs before the new generated fill record.
- Exact preservation replay:31 unaffected native meshes retain world transforms, geometry attributes, UV/colors, material behavior and instance data. All original gun/turret/gear primitives and front fenders are exact. Two derived marking transforms move; their stock/materials do not change.

`focused-live-cold.log` is explicitly a cold construction rehearsal. The committed focused test requires loaded interior records and includes their actual stock. Root owns the fresh fill, anatomy, centering, assets, strict HIGH/LOW reports, source fidelity and final independent14-view review. Those post-generation results supersede these preliminary costs and do not follow merely from this author receipt. The earlier91.716 minimum-view failure remains historical evidence until the new filled comparison passes.

## Second revision: measured end fittings

The first filled preflight passed whole shape (94.286) and floaters (100), but failed dimensions (89.466): the filtered body length was 7.293795 m against 7.466786 m. Complete-source endpoint sections identified missing raised stock at both ends. The source rear includes an open lamp guard at Z−3.8203 m; the front includes thin, asymmetric headlamp hoods reaching Z3.6191 m. These are separate fittings, not evidence for stretching the already measured hull. The original failed receipt remains in `.qa-dev/tank-run/final-approved-targets/k21-filled-preflight-failure.json`.

Object_6 rear guards use a thin cap and folded side webs, retaining their open centers. Their width is .1582 m, with the measured roof rising from Y1.8280 to1.8397 m. Their forward feet physically receive the native rear wall. The source-only calipers and actual seats are recorded in `rear-guard-check.json`.

Independent front measurements are retained in `.qa-dev/tank-run/k21-front-fold/README.md`, `sections.json`, `lamp-sections.json` and `contact-distance.json`. Object_6 components0/1 establish different hood widths: starboard X1.060665..1.488465 m and port X−1.485135..−.871435 m. The 5.8 mm caps lie at Y1.6503..1.6561 m, with thin folded side/rear webs and short forward tongues. Their underside and mouth remain open. The native rear web has finite contact with the existing native bow roof; this is an actual native attachment, not a claim of identical source contact. In the source, the starboard hood touches its upper receiving sheet and has a separate thin support. The port source retains a measured .500023 mm lateral seam to that sheet. No mirrored support leg or solid hood filler was invented.

The previous generic light boxes were about .30 m aft of the measured receivers. They were replaced by round annular main receivers, attached side lobes, smaller outboard lights and their real narrow top tabs. Main lamp centers are X1.24237/−1.16394, Y1.57605 m, with .1465 m outside diameter and the .1075 m front recess at Z3.5879 m. The small lamps are centered at X1.422065/−1.417835, Y1.6092 m. Their actual top tabs engage the cover; finite tests check both receiver-to-tab and tab-to-cover stock. `end-fittings-check.json` records the source rays and seats.

## Current author checks and remaining generation scope

The r2 profile and focused test above are frozen. `geometry-r2.json` pins the profile, test, source, comparison page and actually loaded fill before and after the official comparison; all those hashes match across acquisition. That preflight used the earlier fill record SHA256 `2193c54ba2d8d9b588051930708ecab3cd7141cf95bb02087f6ae91e8053a67e`. Root owns the subsequent r2 fill regeneration, so its later results supersede this fill identity.

- Type checking passed (`typecheck-r2.log`).
- HIGH and LOW loaded tests passed 50 complete-source first-hit witnesses, maximum residual1.899958 mm, and26 finite seats. Two source-air rays and additional channel/hood occupancy checks remain clear. Source widths/locations are independently measured; the2 mm witness tolerance is not a silhouette adjustment.
- All1,760 actual moving-shoe bounds per quality remain clear with10 mm expansion over five phases, including actual generated fill triangles. Negative mutations remove a guard/channel, fill a hood/channel, unseat a flap or intrude into the receiving relief; each is rejected.
- Loaded costs were56,918 HIGH /35,902 LOW (63.08%), below the fixed budgets.
- The official fixed-source comparison passed: minimum94.129537, dimensions100, floaters100. Filtered body length is exactly7.466785925 m on both source and native masks. Full physical dimensions remain separately checked; no registration, camera, mask rule or threshold changed.

The r1 exact-preservation replay remains evidence for the rear-shell revision only. R2 intentionally changes the named front light stock and adds the measured end fittings; it does not claim those edited meshes are byte-identical. Root's fresh fills, anatomy, assets, strict track reports, final release checks and independent14-view review remain required before publication. `.qa-dev/tank-run/k21-rear-hull/freeze-r2.json` pins this author checkpoint and its prior failed receipts.
