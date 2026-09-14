# Owner rulings batch — tanks, night, horizon smoke, fills to zero (2026-09-14)

The owner answered every open question from the September passes (recorded in the session
memory as "owner decisions 2026-09-14"). This note covers the tank, atmosphere and fill work
that shipped in the first batch after those rulings; the campaign slice, the triple-A water
and decoration program and the codebase cleanup follow in their own notes.

## Rulings applied

| ruling | change |
| --- | --- |
| T-72B3M X: close the gaps between fender and side skirts | `t72b3mXSideMounts.ts` — a shoulder cover (2.4 cm, `t72b3mShoulderCover`) bridges the folded deck return (x 1.786) and the skirt lane's inner face (x 1.9395) from z −3.153 to 2.702, its top following the deck edge and capped by the skirt top (`shoulderCoverTop`); the two open rail fields between ERA cassettes carry a backing sheet (`t72b3mRailFieldBacking`). The verified marking-seat solver moved the insignia pair from the (now covered) hull tub wall to the turret cheeks; the side-mount receipt verifies the paint quads structurally instead of pinning the tub footprint. |
| T-90M X: accept | no change |
| Nation wheel patterns, no per-tank overrides | `wheelPattern:'pressed-six'` removed from `challenger1XSuppliedGear.ts` and `strv122XSuppliedGear.ts`, `'deep-dish-eight'` from `t90BurlakX.ts`; `fv4034` joins the UK family rule in `wheelPatterns.ts` (its 'dished' builder style had resolved to deep-dish-eight). |
| New Challenger wheels; "goofy and too large" | Challenger 2 family (`challenger2`, `fv4034`, `challenger2e`, `ua_challenger2`) and Challenger 3 / 3X move to the paired hollow road wheel (`hollowRoadWheelStock.ts`, new `axialWidthM` and `fastenersAsInsets` options): CR2 0.38 m at 0.34 m axial, CR3 0.40 m (was 0.45 m open-rib discs) at 0.44 m axial with the axle 50 mm lower so the tires keep their seat. The former dished bowls, rim tori, hub drums and bolt rings are gone. |
| Wheel details must not blend in | `tankFactoryCore.ts wheelInsetMaterialFor`: hub wells, bolts and lightening holes take the fleet's dusty wheel paint when the dish paint is dark (linear luminance < 0.065 — T-80U/T-80BV `0x3b3f31`, Challenger 3 `#3f4438`, Merkava `0x3f4837`, …) and keep rubber-black on light dishes. |
| Fills: chase every residual to 0 L | `tools/gen-interior-fills.mjs`: `--all` now covers the 207-id fleet manifest (80 tanks had never received fills because it read the 27 legacy spec ids); the fill iterates (`--rounds`, default 4) until the residual stops shrinking; pockets closed by the gun or mantlet fill as turret stock when the turret body encloses them and otherwise as **gun-frame** stock (new `gun` component / `g` origin, applied under `rig_gun` by `applyInteriorFills`); a final greedy remesh over the union cuts box counts. Result: 205 tanks, 94,940 boxes (1.14 M tris, heaviest leo2a6_ua 32 k), residual 0 L of 117,774 L. `m1a1_aim` and `merkava3b` are manifest ids without builders (cleanup list). |
| Night "really really dark" | `battleAtmosphereRuntime.ts` night preset: moon 0.42 → 0.60, sky 0.05 → 0.08, hemisphere 0.46 → 0.60, fill 0.20 → 0.30, environment 0.85 → 1.0, horizon dim ×0.12 → ×0.20, vehicle readability scale 0.24 → 0.34. Verdant night spawn pose: median luminance 14 → 30, dark pixels 95.8 % → 87.9 %. |
| Horizon smoke "a lot better" | `frontlineAtmosphere.ts`: 96×384 domain-warped fBm plume sheet (rolling lobes at the foot, rags at the top, dark core with lit crests) replaces the 64×256 blob sheet; the shader scrolls two taps at different speeds so the plume churns, brightens the sun-facing edge (`uSunDir`), leans each column a different amount with height, and glows an ember at a fresh column's root. |
| Frontline Assault sectors | `assaultLines.ts` / `terrain.ts` / `state.ts` / `matchPlacement.ts`: the trench plan keeps an index-aligned `sectors` list (null where a settlement dropped a trench), so sector 2 no longer inherits line 3's centre when line 2 is dropped (frontier had sectors 2 and 3 on one point). |
| garageArchitecture timing receipt | It was already exclusive-CPU; the flake came from the gate script restarting the dev server (vite cold compile) right before the core group. Gate 25+ restarts the dev server after the receipts. |
| Readable deploys | `deploy-prod.sh <n> "<title>"` (scratchpad) passes `title` and the `githubCommit*` metadata the Vercel list renders as the source line, and appends a row to `docs/DEPLOYS.md`. |

## Campaign slice 5 — the campaign the player can see

Owner: "build the campaign slice, I still don't see campaign gameplay". Frontline Assault was a
rule card with a progress line; it now reads as a campaign:

- `src/game/campaignOperations.ts` — a ladder of six named operations, each a Frontline
  Assault sortie on a fixed map (First Light / verdant, Iron Ridge / alpine, Steinburg / urban,
  Tarkhan / steppe, Frontier / frontier, Delta Crossing / delta). An operation is cleared when
  its last sector was held (the per-map `held` count campaignProgress already records); the
  first is always ready and each cleared operation opens the next. Receipt
  `campaignOperations.selftest.mjs` (ladder, unlock rule, bilingual copy).
- `src/ui/playMenu.ts` — the ladder under the battle rules: index, title, map, status
  (Locked / Ready / Cleared), best push, and a Launch (or Replay) button that starts the sortie
  on the operation's map (`onSolo` carries `mapId` and `campaignOperationId`;
  `playSurfaceRuntime` and `soloBattleEntryRuntime` pass them through).
- `src/ui/missionBrief.ts` — the mission brief card at battle start: operation number and map,
  title, brief, the three objectives and the opposing formation; free sorties on other maps get
  the map-named brief. Copy in both catalogs (`campaign.*`, `missionBrief.*`).
- `src/world/props.ts placeTrenchWorks` — the carved fire trenches get a sandbag parapet on
  the enemy-facing lip, ammunition and crates on the friendly lip and a drum or barrier at each
  end (existing destructibles, no colliders), so the sectors read as dug-in positions.
- Sector positions: see the sector-alignment fix above (frontier had sectors 2 and 3 on one
  point).

## Verification

Receipts adjusted: `t72b3mXSideMounts` (closed shoulder, rail backing, structural paint pair),
`challenger3RunningGear` (paired wheel, axle 0.51, 0.44 m axial, UK pattern),
`battleAtmosphereRuntime` (night values), `mapIntegration` unchanged. Gate and deploy details are
appended below once the batch ships.
