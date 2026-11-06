# Decoration System

Cosmetic external-stowage / fittings layer for the whole fleet.
Code: `src/vehicles/decorations.ts` (kit library + manifests + placement
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

## Kit inventory (29 builders, 61 catalog variants; release 269 adds 3 builders, 8 variants)

| kit | variants | eras | notes |
|---|---|---|---|
| cupola | ring / drum / split-open | all | vision-block ring, lens blocks |
| hatch | round / rect | all | hinge blocks, grab ring, periscope stub |
| aamg | M2 / M2+shield / DShK / DShK+ring | all | pintle or ring, stowed +7°; Garage dressing only since 2026-10-08: the vehicle decor seats no weapon (`DECOR_RETIRED_KITS`, the owner's field standard in 6763d7cc0) |
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
| crewkit | ammo-can stack / MRE pair / water case / foam mat roll / sleeping bag / assault pack; any fleet cargo name | cw, mod | release 269 (below): issue sizes, the crew's load at measured stations |
| cargonet | w × len | cw, mod | release 269: 12 cm webbing mesh laid tight over the load under it |
| coil | r, turns | cw, mod | release 269: a tow cable coiled on two J-hooks, hung on a rear plate |

Deliberately NOT included: tactical numbers/insignia (already the painter
system's decal layer) and barrel-mounted cosmetics (kill rings, travel-lock
engagement) — the architecture law limits decor to the two rig groups.

## Grading loop (marketing-shot style)

Catalog sheets: every builder × variant on a pedestal at 3 angles
(`shots/decorations-r1/catalog/*.png`, 1 m scale bar). Composition sheets:
8 tanks (tiger1, t34_85, m4a3e8 · m60a1 cold-war · kv2 · leo2a4 GLB, xk2_black_panther
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
| leo2a4 | modern | glb | 10 | 2344 | 7 |
| xk2_black_panther | modern | procedural | 10 | 1780 | 7 |
| isu152 | ww2 | glb (casemate) | 7 | 2026 | 4 |

(tiger1, t34_85, m4a3e8 and isu152 have had no builder since 2026-09-25 —
owner: delete the archived WWII / casemate tanks outside production; their rows
stay as the grading record.)

In-game auto-path spot check (real engine ctx, zero opts): garage pedestal
m1a1_abrams_hc (GLB) 6 decor meshes / 1048 tris; battle roster all dressed incl.
uncurated defaults — panther_g 984, is2 2654, leo2a7 1834, t90am 930 tris.
Evidence: `shots/decorations-r1/game/{garage,tank_closeup_ww2,battlefield,player_view,studio_*}.png`
plus the studio selftest scenes.

## Manifests

`TANK_MANIFESTS` carries curated loadouts (kv2, m60a1, type74, leo2a4, xk2_black_panther,
m1a1_abrams_hc, t90am and the Abrams / Challenger / Leclerc / KF51 / Type 10 family
entries; the tiger1, t34_85, m4a3e8, isu152, is7 and merkava4 loadouts
retired with those hulls on 2026-09-23); everything else takes
the era/nation default (`defaultManifest`) — interwar/ww2/cold-war/modern/next-generation tagged, with
a Soviet school (drums, unditching log, DShK) and US school (M2, sandbags,
helmet-on-antenna) flavor split. `COLDWAR_IDS` overrides the binary
`spec.era` for the transitional generation.

### Batch 2 — era hull kits (2026-09-15, triple-A program)

`appendEraHullKit` adds era-specific stowage to the default hull load: WW2 crews pile
bedrolls on the deck (`packs` on `rearDeck spread`) and non-Soviet hulls lash an unditching
beam (`log` on `hullRearLow`); Cold War fleets carry extra fuel on the rear deck (`jerry`,
corner −1 back), a rolled net on the turret side and a steel bin on the other side; modern
crews stow packs on the turret side, bolt a patch plate on the flank and carry more
rations. Every row reuses a kit / station pairing the curated manifests already place.
Source-study rebuilds (`*_x`) and the renamed Revolution original (`leo2_revolution_proto`)
keep the batch-1 rows exactly (`isSourceStudy`): their silhouettes gate against source
masks and the Proto's manifest / jitter streams are pinned. **Deferred:** letting X studies
inherit their base tank's curated manifest — it changes gated silhouettes and needs a
per-id fidelity A/B first. The garage floor gained the pedestal wear apron
(`garage_pedestal_wear_apron` in `garageDressing.ts`): scuffed grit ring hugging the
platform base, two faded tread lanes along the hero heading, drips by the ramp; the deck
and its painted rim stay masked clean.

### Release 269 — lived-in loads on the M1A1s and the Bradleys (lane abrams-bradley-269, builder K)

The owner, 2026-11-05: "add a bunch of extra decorations annd tank props and boxes and bags and other soldier
reuqipment onn all of these bradleys and m1a1s". `LIVED_IN_ROWS` (decorations.ts) appends each listed vehicle's crew load
after all of its own rows (`decorManifestFor` = `baseDecorManifest` + the rows; the M3A2 keeps the M2A2's rows and seed
through `DECOR_TWIN` and has lived-in rows of its own, its turret being the source-measured one). The rows are always
carried, draw nothing from the manifest's stream and seat under their own near budget, so everything the vehicle carried
before keeps its seat (the whole fleet's manifests before and after differ only on these ids, each by its appended rows).

**The budget exception.** These eleven ids (m1a1, m1a1ha, m1a1_abrams_hc, m1a1_abrams_sa, m1a1_abrams_aim,
m1a1_abrams_fep, m2a2_bradley, m3a2_bradley, m3a3_bradley, ua_m2a3_bradley, m6_linebacker; `ua_m1a1` carries none) are
the one exception to the fleet's 6,000-triangle near decor budget: their lived-in rows seat under `LIVED_IN_TRIS`,
16,000 triangles (11,000 for phase 1, accepted by the lane's coordinator on 2026-11-05 because the owner asked for "a
bunch"; raised for phase 2's fuller racks, turrets and noses). Every row before them still seats under 6,000. The
heaviest decor is the M1A1 AIM's, about 12,000 near triangles in four draws. Any other vehicle that wants more asks the
owner first (src/vehicles/SKILL.md).

The pieces (accessoryKits.ts, issue sizes): `crewkit` builds `ammo-can-stack` (two M2A1 .50 cans, 305 x 155 x 188 mm, an
M19A1 7.62 mm can, 280 x 95 x 178, laid across them), `mre-stack` (two 410 x 250 x 255 mm MRE cases, banded and
stencilled), `water-case` (24 half-litre bottles under film, 390 x 260 x 200), `mat-roll` (a closed-cell foam mat 580 mm
wide rolled to 170 mm under two bungees), `sleep-system` (a sleeping bag in its compression sack, 400 x 280) and
`assault-pack` (460 x 300 x 170); any other name builds that fleet cargo variant (`long-duffel`, `large-rucksack`,
`folded-tarp-pack`, `camo-net-bag` ...) with the same lashings. `cargonet` is a 12 cm webbing mesh, `coil` a tow cable
coiled on two J-hooks; the nose's net is the fleet's `camonet` roll.

The slots: every row lists its stations in order of preference and seats at the first one every guard passes. `stowAt`
seats a load at measured frame stations (`at`; a rigid load on its highest support points, a soft one sagging; `stack`
lets it rest on the decor seated before it, `floor` on a rack's open mesh floor); `netOver` lays a net over a footprint,
every node over the highest of the tank, the decor and the rack floor, its long sides hooked to the rails (`edge`) and its
ends lying on the load, pulled tight (no inner node more than 2.5 cm under its neighbours' mean) and every span lifted
clear of what it crosses; `gutterRoll` settles a roll in a hull side gutter (its section against the floor read at three
stations along it, never outboard of the upper side plate's inner face); `plateHang` hangs a piece flat on the rear
plate; `railHang` hangs a soft pack on the outside of a turret side rack's rails by its two shoulder straps; `troughRoll`
lays a roll in the trough between a turret wall and its side rack's rails (against the rail's inner face, on the wall
read at two heights); `slopeLoad` lays a roll on a plate along its plane (both ends within 2 cm of it). A roll in a
gutter or trough and a hung pack have no flat foot, so they carry no contact pad. Every commit keeps the fleet guards
(width, gun, sweep, dock, launchers, spare-track runs, keep-outs, suits).

What each carries (frames: turret or hull; x is the vehicle's left, z forward):

| id | where | what |
|---|---|---|
| m1a1 | bustle rack (turret z -2.6..-2.94); side racks | water case (x 0.62), .50/7.62 can stack (-0.2) with a folded tarp pack on it, rucksack (-0.76) with a foam mat on it, an MRE pair in the left bay (1.14), the net over x -1.0..0.78 (its drone dock's airframe over x 0.10..0.81 keeps the cases low there); on each side rack a sleeping bag in the trough of the first and third bays (z -0.56, -1.84) and an assault pack on the rails of the second and fourth (-1.24, -2.55) |
| m1a1ha | as the M1A1 | water case beside the cans (x 0.19), cans, rucksack with a foam mat, the net to x 0.36 (its dock's airframe is over x 0.43..1.14, nothing stands under it); the side racks as the M1A1 |
| m1a1_abrams_sa | as the M1A1 | water case, cans with a tarp pack on them, the MRE pair, the net; its rack's right bay is held clear by a keep-out (no rucksack or mat) and the bustle roof's loads overhang the rest; the side racks as the M1A1 |
| m1a1_abrams_aim | as the M1A1 | water case with a sleeping bag on it, two can stacks (-0.2, 0.2), rucksack with a foam mat, the MRE pair, the net to x 1.3; the side racks as the M1A1 |
| m1a1_abrams_hc | its tejas rack (x +-1.07) | a sleeping bag on the profile's rack duffel, a foam mat behind the dock's reach (z -2.88); the rack is full to 0.92 (its cans to 1.19) and its dock's airframe reaches over x -0.87..-0.15, so no net |
| m1a1_abrams_fep | its tejas rack | a can stack on the rack's free flat top (x 0.05) with a water case on it, a long duffel on the profile's bags (-0.6), a cargo net over the rack (its roof and left deck are under its field net) |
| m2a2_bradley | gutters, nose, ramp, turret | left gutter: long duffel (z -2.5), foam mat (-1.3), folded tarp pack (1.65); right gutter: foam mats (-2.58, -1.2, 1.7) (its classic turret's overhang and bustle sweep the gutters beside it, and its gun at full depression reaches tall bags at the rear corners and the right front); on the nose shelf a rolled camouflage net (x 0.12) and a long duffel (-0.7); the tow cable coiled on the ramp; turret: a duffel on the right flank's rear quarter, a sleeping bag and a can stack in the bustle rack under a net |
| m3a2_bradley | gutters, nose, ramp, turret | left gutter: long duffel, foam mats (-1.95, -1.3), sleeping bag (-0.7), camouflage net bag (0.45), foam mat (1.15), sleeping bag (1.65); right gutter: long duffel, sleeping bags (-1.95, -0.55), foam mats (-1.2, 1.7); the nose's net and duffel; the coiled cable; turret: a foam mat across its rack under a net (its flanks carry the source's own crew bags) |
| m3a3_bradley | gutters, ramp, turret | the M3A2's gutter load and coiled cable; on the 269 turret's open rack (on its bustle box's lid, x -0.66..0.52, floor 0.55) a sleeping bag and a can stack under a net, standing under 0.91 so the rear camera pods (0.905) and the commander's viewer (window 1.00) see over them; nothing on its flanks (both launchers and their BRAT tiles) or its nose (its drone dock) |
| ua_m2a3_bradley | gutters, nose, turret | left gutter: long duffel, foam mats (-1.95, -1.3, 1.15), camouflage net bag (0.55); right gutter: sleeping bag (-2.75), foam mats (-0.5, 1.7) (its unditching log fills z -1..-2); a can stack at the nose shelf's right end (its spare links take the rest); turret: a sleeping bag and a can stack in its railed rack under a net; no room on the ramp for the coil beside the fleet's racks |
| m6_linebacker | gutters, nose, ramp, turret | sleeping bags at the rear of both gutters (z -2.8), foam mats (-1.4, -1.3, 0.45), a folded tarp pack (-0.75), sleeping bags forward (1.15, 1.7); the nose's net and duffel; the coiled cable; a foam mat and a sleeping bag on its turret's bags (no net, nothing on its flanks: the Stinger pod and its bins) |

Not dressed: the M1A1 rear decks (behind the turret they are the gun's own path, held 0-3 degrees up from yaw 142 to 180
by `gunPitchByYawDeg` with its barrel 6 cm over the deck, and the bustle rack's sweep), the netted roofs (`m1a1_abrams_fep`'s
turret and left deck, `ua_m1a1`'s cage roof and its whole rear deck and skirts: decor under a field net raises it into a
hoop) and so `ua_m1a1` carries nothing new, the Bradleys' flat roof behind the turret (the 25 mm gun at full depression
crosses it), their trim vane's face (the gun at full depression passes 5 cm over its spare links, and the driver's
periscopes look out over its left half: the nose shelf 1.7 m ahead of them stays under their line to the ground), and
their hull sides above the skirts (outboard of the side plates every bag stands past the width guard, W/2 + 4.8 cm).
Jerrycans: the fleet's can racks are 0.39 m deep, wider than the M1A1 bustle rack (0.34), and stand over the docks' 0.76 m
limit, so none rides there.

### Asks for the fleet/profile agents (profiles are yours — no edits made)

1. **m60a1 / t34_85 / kv2 low fender shelves** (t34_85 and tiger1 deleted
   2026-09-25; m60a1 / kv2 still open) — the placement engine found
   only roofline-height fenders on tiger1 (its real track guards aren't
   modeled as horizontal shelves), so its tool/bin rows relocated to the bow
   and turret. If a profile ever adds true track-guard shelves, the default
   manifests will use them automatically — no decor change needed.
2. **isu152 roof anchors** (closed: the hull was deleted 2026-09-25) — the
   recovered GLB's roof never probes flat
   (baked clutter), so the DShK/aamg row skips. If the casemate profile
   exposes a flat commander's-ring pad, the manifest row will land. Not
   blocking; its hull kit reads fully dressed.
3. **Per-tank overrides** — profile agents wanting a different loadout for a
   graduated tank should request rows in `TANK_MANIFESTS` (decorations-owned)
   rather than building stowage into gate-measured geometry; anything baked
   into profiles becomes silhouette the gate must re-pass.
4. **Release 233 rows (2026-10-21, the distinct M1A1 marks and M60s lane)** —
   `m1a1ha` keeps the default draw minus its bow shackles and tow chain (its
   new track-width mine plow fills the bow); `m60a3` gets its own loadout, since
   its new open fenders and rear bins differ from the A1's (see
   `docs/history/research/abrams-m60-distinct-233.md`).
5. **Release 240 (2026-10-22, the vehicles polish lane)** — `c2_ariete_proto`
   keeps the default draw, but the fleet cargo's twin-can cradle never takes the
   turret roof: the roof net (`ghillieFleetSuits.ts`) is drawn up over every load
   under it (`ghillieDrape.ts`), and the 0.45 m cradle pulled it into an arch off
   the roof beside the commander's sight. The cradle is a fleet cargo row, drawn
   after the curated manifest, so the filter runs on the merged manifest at the end
   of `decorManifestFor`; the cradle keeps its bustle, deck, side and fender seats.

## Scratch probes kept from this round

`tools/tmp-decor-probe.mjs` (fidelity-page console probe),
`tools/tmp-decor-game-verify.mjs` (in-game auto-path proof + captures),
`tools/tmp-decor-studio-retake.mjs` (studio composition retake).
