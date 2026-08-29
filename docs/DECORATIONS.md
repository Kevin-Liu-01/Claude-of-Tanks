# Decoration System

Cosmetic external-stowage / fittings layer for the whole fleet.
Code: `src/vehicles/decorations.js` (kit library + manifests + placement
engine), one seam in `src/vehicles/tankFactory.ts` (`dressTank`, end of
`createTank`). Quality bench: `tools/decoration-board.html`, driven headlessly
by `tools/decoration-eval.mjs` (own vite, 7xxx ports).

```
node tools/decoration-eval.mjs                    # catalog + 8 marquee tanks
node tools/decoration-eval.mjs --ids=a,b          # subset
node tools/decoration-eval.mjs --catalog-only
# sheets + report.json -> shots/decorations-r1/
```

## Architecture law (what every other agent can rely on)

- Every decoration mesh lives under `rig_decor_hull` (child of `rig_hull`) or
  `rig_decor_turret` (child of `rig_turret` — turret decor yaws with the
  turret). Nothing attaches to gun/recoil groups.
- **Metrology never sees decor.** Hard skip when `createTank` runs with
  `proceduralOnly`; auto-skip on measurement-stub engine contexts (any ctx
  whose `setupShadowMaterial` fails the USE_CSM probe — the fidelity lab,
  shaded-parity boards and rig-QA pages all pass stubs), so even the lab's
  GLB *reference* builds stay bare. Explicit override: `opts.decor`
  (`true`/`false`) — `proceduralOnly` still wins over `decor: true`.
- In-game surfaces (garage pedestal, battle, studio, icon generator) dress
  **by default** — zero call-site changes. GLB-sourced tanks dress *after*
  the model swap lands (`applySwap` hides every pre-swap render node, and
  anchors must probe the real geometry).
- Deterministic per vehicle: selection is seeded by **spec id only** (never
  camoSeed). Same tank, same kit, every build; variation lives across the
  fleet.
- Movement/contact metadata is computed **before** the seam runs — the
  support solve never sees decor.
- Wrecks: decor materials are per-visual `MeshStandardMaterial`s chained
  through the same ambient-floor hook pattern `createTankMaterials` uses, so
  `setDestroyed`'s existing traversal burn-wraps them — decor chars in
  lockstep with the hull (verified 6/6 … 9/9 materials hooked per tank,
  wreck sheets in `shots/decorations-r1/tank-*/wreck.png`). Listen-only: the
  burn driver itself is untouched.

### Exclusion proof (2026-07-31)

- `node tools/geometry-gate.mjs --ids=is3,tiger2` run twice — decoration seam
  ACTIVE vs seam neutralized — produced **byte-identical** per-id reports
  (`docs/geometry-gate/{is3,tiger2}.json`), re-confirmed after the final kit
  iteration. `npm test` green throughout.
- The mandated `--ids=m60a1,kv2` baseline (90.7 / 90.2) was captured and
  reproduced BEFORE integration. Mid-round, both ids **graduated the dual
  gate** (their recovered GLB oracles were retired by the fleet agents —
  `userdrops5.js` / `specs.ts`), so the gate can no longer *run* for them;
  their ledger rows carry the last-good pre-graduation measurements. A
  mid-transition gate invocation from this round briefly wrote error rows
  into `ledger.json`; the rows were restored to the last-good values (the
  per-id JSONs on disk were never touched and still match the baseline
  snapshots byte-for-byte).
- Belt and suspenders: the board build asserts `metrologyDecorNodes === 0`
  on a `proceduralOnly + decor:true` cross-build for every sheet tank
  (`proceduralOnly` must win) — all CLEAN.

## Placement engine

Anchors come from the tank's **real as-built geometry** by raycast probing
(hull/turret local frames, gear and shadow proxies excluded), never spec
fractions alone:

- 5-point seat probes reject uneven/occupied footprints — which also
  de-dupes against profile-authored greebles (the M60's baked searchlight
  simply keeps its roof spot un-probeable; no doubles).
- **WIDTH GUARD** — no piece reaches past `dims.widthM/2 + 0.048 m`
  (the loader's width clamp can never fire on cosmetics); turret pieces obey
  it at yaw 0 and may extend the existing bustle envelope ≤ 0.55 m
  (baskets), tracked live so later hull pieces clear the grown sweep.
- **GUN GUARD** — full-depression bore corridor swept across every turret
  yaw, resolved per PART box, the way a player sees it: analytic cone
  quick-accept, then a 5-ray bore bundle where a piece fails only if a ray's
  FIRST hit is decor (plates the hull already eats can't be worsened by
  decor behind them). The board re-verifies against the final meshes
  (36 yaws × 5 rays, `firstHitRule`), all 8 sheet tanks PASS, and the
  articulation sheets show the gun at full depression over the dressed bow
  for visual confirmation.
- **TURRET-SWEEP GUARD** — hull decor inside the swept annulus clears the
  lowest turret surface of the radial band it actually sits under (3 bands:
  mantlet-low near the ring, bustle-high at the rim), so sponson-line
  stowage lives under high bustles while nothing camps under a mantlet.
- Slots relocate before giving up (deck → rear-plate racks → fenders →
  side-hang → bow runs), every skip is ledgered with a reason
  (`report.json … skipped`), and a ~3000-triangle budget gate rides every
  commit.

## Perf contract

- Merged `BufferGeometry` per material family per parent group:
  **4–9 draws/tank** (median 7).
- **930–2992 added triangles per tank** (fleet spread incl. era defaults;
  cap 3000 enforced).
- `castShadow` OFF (the fleet's proxy shadows carry silhouettes, same as all
  greebles), `receiveShadow` ON; LOD-wrapped at the same 150 m greeble
  horizon tankFactory uses; decor geometry + materials ride the visual's
  `disposables` (die with the tank).
- Shared canvas detail textures (weave / wood / net / wire-grid, ≤128²) are
  module-cached across tanks; materials are always per-visual (burn-hook
  ownership).

## Kit inventory (29 builders, 61 catalog variants)

| kit | variants | eras | notes |
|---|---|---|---|
| cupola | ring / drum / split-open | all | vision-block ring, lens blocks |
| hatch | round / rect | all | hinge blocks, grab ring, periscope stub |
| aamg | M2 / M2+shield / DShK / DShK+ring | all | pintle or ring, stowed +7° |
| light | IR large / IR small / convoy | cw, mod | yoke, rim, glass face |
| antenna | whip short / long / star / +helmet | all | command star, US helmet gag |
| sight | periscope / doghouse | cw, mod | brow rail, lens slit |
| applique | rect / wedge | all | bolt studs |
| smoke | 4 / 6 / 8 tube | cw, mod | fanned, muzzle caps, cheek pairs |
| bin | wood crate / steel bin / long fender box | all | plank texture, hasps |
| tarp | fat / thin | all | sagged ends, cinch straps |
| camonet | roll / draped patch | all | net alpha wrap, garnish rags |
| log | unditching beam | ww2, cw | end cuts, straps (Soviet school) |
| packs | 2–4 rucks/bedrolls/duffels | all | soft-kit cluster |
| basket | bustle basket w=1.0/1.3 | all | rod frame, wire-grid mesh, contents |
| cable | 1.8 / 2.6 m | all | eye loops, clamp blocks; deck-lay → side-hang → bow-run fallbacks |
| tracks | 4 / 6 link runs | all | twin horns, connectors, alternating tone |
| tools | shovel+axe / shovel+sledge+crowbar | all | clamp blocks, fanned lanes |
| shackles | C-hook / D-shackle | all | bow pair, plate-flush |
| drums | single transverse / twin longitudinal | ww2, cw | rebased to bracket seat, width-aware twin spacing |
| jerry | 2 / 3 cans | all | X-stamp, fuel-tan + water-green, braced rack |
| wheel | flat / upright | ww2, cw | radius measured off the tank's own gear |
| exhaust | muffler / shielded pipe | ww2, cw | scorched tone |
| sandbags | 2 / 3 rows | ww2 | glacis stacks (US school) |
| patch | welded plate | ww2, cw | weld-bead border |
| slat | slats / wire mesh | modern | standoff struts (K2 rear cage) |
| travelLock | stowed A-frame | cw, mod | casemate rear decks (fixed bore) |
| rations | 2-box stack | all | |
| bucket | steel pail | ww2, cw | rear-plate hang |
| chain | 5–6 links | all | bow shackle dangle |

Deliberately NOT included: tactical numbers/insignia (already the painter
system's decal layer) and barrel-mounted cosmetics (kill rings, travel-lock
engagement) — the architecture law limits decor to the two rig groups.

## Grading loop (marketing-shot style)

Catalog sheets: every builder × variant on a pedestal at 3 angles
(`shots/decorations-r1/catalog/*.png`, 1 m scale bar). Composition sheets:
8 tanks (tiger1, t34_85, m4a3e8 · m60a1 cold-war · kv2 · leo2a6 GLB, k2
modern · isu152 casemate GLB) hero/rear, closeups, full-depression
articulation strip, dressed|bare pair, wreck burn check. Scored 1–10 on
shape fidelity / read-at-game-distance / material believability; every
piece scoring <8 was iterated (rounds below) until the catalog minimum
reached ≥ 8.

| kit | shape | read | material | fixed in loop |
|---|---|---|---|---|
| cupola | 8 | 8 | 8 | split lid re-pivoted to hinge edge; lens material |
| hatch | 8 | 8 | 8 | — |
| aamg | 8 | 9 | 8 | shield struts, gun-only stow pitch, steel tone |
| light | 8 | 8 | 8 | yoke arms stopped at axle line |
| antenna | 8 | 9 | 8 | — |
| sight | 8 | 8 | 8 | — |
| applique | 8 | 8 | 8 | — |
| smoke | 8 | 8 | 8 | muzzle cap discs |
| bin | 8.5 | 9 | 9 | wood color de-oranged |
| tarp | 8 | 9 | 8.5 | — |
| camonet | 8 | 8 | 8 | roll skin → half-cylinder wrap; drape tone/scale |
| log | 8 | 9 | 8 | weathered tone (was fresh-cut orange in sun) |
| packs | 8 | 8 | 8 | cream tones capped |
| basket | 8.5 | 8 | 8 | side mesh panels; dedicated wire-grid texture |
| cable | 8 | 9 | 8.5 | radius 23→32 mm, loops up-sized, lie lowered |
| tracks | 8 | 8 | 8 | link separation, twin horns, connectors, oily tone |
| tools | 8 | 8 | 8 | dull handles; lane fan |
| shackles | 8 | 8 | 8 | — |
| drums | 8.5 | 9 | 8.5 | origin rebased to bracket seat (was half-sunk) |
| jerry | 8.5 | 9 | 8 | tint deepened ×2 (read white); rack braces |
| wheel | 8 | 8 | 8 | — |
| exhaust | 8 | 8 | 8 | — |
| sandbags | 8 | 8 | 8 | — |
| patch | 8 | 8 | 8 | slimmed to fit width guard on flush side plates |
| slat | 8 | 9 | 8 | mesh variant on wire-grid texture |
| travelLock | 8 | 8 | 8 | claw lowered; relocated to casemate decks |
| rations | 8 | 8 | 8 | — |
| bucket | 8 | 8 | 8 | — |
| chain | 8 | 8 | 8 | — |

Material-family rounds: `steel` metalness 0.6 → 0.35 (drank the hemi sky and
read silver-blue), `wood` de-oranged twice, `lens` darkened, `cans`
authored-color family (kit paint is scheme-tinted and could never read
fuel-tan), wire-grid texture split from camo-net.

## Per-tank cost (board sheets, final)

| tank | era | source | pieces | tris | draws |
|---|---|---|---|---|---|
| tiger1 | ww2 | procedural | 11 | 2992 | 7 |
| t34_85 | ww2 | procedural | 9 | 2592 | 7 |
| m4a3e8 | ww2 | procedural | 10 | 2472 | 9 |
| m60a1 | cold-war | procedural | 9 | 2090 | 9 |
| kv2 | ww2 | procedural | 11 | 2832 | 7 |
| leo2a6 | modern | glb | 10 | 2344 | 7 |
| k2 | modern | procedural | 10 | 1780 | 7 |
| isu152 | ww2 | glb (casemate) | 7 | 2026 | 4 |

In-game auto-path spot check (real engine ctx, zero opts): garage pedestal
m1a2 (GLB) 6 decor meshes / 1048 tris; battle roster all dressed incl.
uncurated defaults — panther_g 984, is2 2654, leo2a7 1834, t90m 930 tris.
Evidence: `shots/decorations-r1/game/{garage,tank_closeup_ww2,battlefield,player_view,studio_*}.png`
plus the studio selftest scenes.

## Manifests

`TANK_MANIFESTS` carries curated loadouts (tiger1, t34_85, m4a3e8, kv2,
isu152, m60a1, is7, type74, leo2a6, k2, m1a2, t90m); everything else takes
the era/nation default (`defaultManifest`) — interwar/ww2/cold-war/modern/next-generation tagged, with
a Soviet school (drums, unditching log, DShK) and US school (M2, sandbags,
helmet-on-antenna) flavor split. `COLDWAR_IDS` overrides the binary
`spec.era` for the transitional generation.

### Asks for the fleet/profile agents (profiles are yours — no edits made)

1. **m60a1 / t34_85 / kv2 low fender shelves** — the placement engine found
   only roofline-height fenders on tiger1 (its real track guards aren't
   modeled as horizontal shelves), so its tool/bin rows relocated to the bow
   and turret. If a profile ever adds true track-guard shelves, the default
   manifests will use them automatically — no decor change needed.
2. **isu152 roof anchors** — the recovered GLB's roof never probes flat
   (baked clutter), so the DShK/aamg row skips. If the casemate profile
   exposes a flat commander's-ring pad, the manifest row will land. Not
   blocking; its hull kit reads fully dressed.
3. **Per-tank overrides** — profile agents wanting a different loadout for a
   graduated tank should request rows in `TANK_MANIFESTS` (decorations-owned)
   rather than building stowage into gate-measured geometry; anything baked
   into profiles becomes silhouette the gate must re-pass.

## Scratch probes kept from this round

`tools/tmp-decor-probe.mjs` (fidelity-page console probe),
`tools/tmp-decor-game-verify.mjs` (in-game auto-path proof + captures),
`tools/tmp-decor-studio-retake.mjs` (studio composition retake).
