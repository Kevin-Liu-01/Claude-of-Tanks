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

Receipts adjusted: `t72b3mXSideMounts` (closed shoulder, rail backing, structural paint set on
hull or turret), `challenger3RunningGear` (paired wheel, axle 0.51, 0.44 m axial, UK pattern, no
face layers), `battleAtmosphereRuntime` and `worldActivationRuntime` (night values),
`battleAtmosphereAccess` (mission-brief binding), `roadLookupGrid` (trench-plan history delta),
`sourceXSecondWaveMarkings` (T-72B3M X follows the sided-anchor rule; anchor moved to
`turret`/right, designation aft), and the whole-model / native-buffer / wreck-bake hashes
(`sourceXWesternAuxArmor`, `sourceXSovietAuxArmor`, `strv122XSuppliedCupola`, `wrecks`) repinned
from the build. `mobileLayout` forbids width media queries in UI modules; the new campaign CSS uses
fluid grids and `clamp()` instead.

Regen chain for the batch ids (`t72b3m_x`, `challenger_3`, `challenger_3x`, `challenger2`,
`challenger2e`, `fv4034`, `ua_challenger2`, `challenger1_x`, `strv122_x`, `t90a_burlak_x`):
presentation anchors, combat anatomy, marking seats and icons regenerated; anatomy check 181/181,
centering 208 tanks at 0.00 px residual, sealed ledger holds for all ten (T-72B3M X now reads
SEALED with 0 open px). Two no-fail-fast sweeps: 977 receipts, 9 failures repinned, then 977/0.

Gate 25 (commit `88f235a41`): all-map world-build smoke exit 0 (30 maps), pre 315/315, core
662/662 — no garage-architecture flake now that the dev server restarts after the receipts —
post 42/42, private build. Deploy 17 via `deploy-prod.sh 17 "…"`: production serves
`main-BHi1e83C.js`; live smoke enters battle on verdant, frontier and urban with no errors; the
production night on verdant measures median luminance 30 / dark 87.6 % (deploy 16: 14 / 95.8 %);
the play-menu ladder renders six operations with Operation First Light ready; a frontier sortie
places its three sectors at distinct points (−30,−191), (−16,37), (−2,266); garage renders of
Challenger 3, Challenger 2 and T-72B3M X match the local build.

## Batch 18 — wheels read, tracks wrap, mobile boot and touch

Owner (2026-09-14, with two screenshots): "fix our road wheels that are now gray by default and
all just blend in … fix the rim rings and hubs that sit proud of their tires … do the wheel fixes
and reseat tracks — the cornered track in the bottom right; don't let wheels glitch into tracks".

### Wheels

- **Root cause of the grey wheels** (a batch-17 regression): `wheelInsetMaterialFor` handed the
  shared fleet wheel paint to the inset layer on dark dishes, and the appearance normaliser
  (`normalizeTankAppearance`) recolours every `wheelInset` mesh to tire rubber — through the shared
  material, so the dish itself turned `#292a28`. Browser probe before the fix: dish, tire and
  insets all `#292a28` on Leopard 2A4M, Ariete, AMX-40, KF51, T-72B3M, Leclerc, T-90M.
- **Fix**: fixed-colour gear roles (`wheelInset`, `wheelTire`, track roles) now get an isolated
  clone when the material handed in is not already tagged for that role
  (`isolatedGearMaterial`, applied in the wheel `mkInst` path), and the insets are tire rubber
  again.
- **Wheel-paint floor** (`src/vehicles/wheelPaintFloor.ts`): painted dishes never drop below
  linear luminance 0.075 (~3× the tire's 0.023). Applied once, centrally, in the appearance
  normaliser to every material tagged `wheelPaint` (the fleet paint and every profile clone of it —
  KF51 `#2e2c22`, Leopard 2A5/Strv 122 `#3c3c2e`, PT-91M `#403f31` were all below it) and in
  `materials.ts` to the camouflage-derived paint. Camouflage-mapped paint is left alone.
- **Proud dressing seated on the tire face** (tool: `tools/wheel-review.mjs`, PROUD default now
  0.025 m, new FLAT flag = dish/tire luminance ratio < 2.2): Ariete dish/hub/rim (0.24 m proud →
  flush/7 mm), AMX-40 (0.20 → flush/8 mm), KF51 forged face stack (`wheelFaceOutsetM` 0.152 →
  0.088), T-80U X steel shells (0.082 → 0.019; receipt cuts repinned), T-72 and T-90 hub packages,
  T-90 X source bolts, Challenger 1 dressing, KV-2 facet rim, Sheridan rim/hub. Fleet review after:
  181 tanks, 0 flagged.

### Tracks

- **Road-wheel wrap** (`roadWheelWrap` in `trackLoopPoints`): the loaded run leaves the ground
  tangentially around the outer road wheels and rises on the common external tangent to the end
  wheel wrap ((B−A)·n = R_A − R_B), instead of kinking at an authored contact pin and cutting a
  chord through the last wheel. `buildTrackCourse` passes the outer wheels (`endRoadWheels`); the
  18 profiles that author their loop through `KIT.trackLoopPoints` pass them too. Ground-level end
  wheels (dead-track WWII rigs) keep the flat run to their own crossing. Opt-out per unit:
  `wrapEndRoadWheels: false`. The wheel arc's chords are graded from 1° at the ground (1, 2, 4,
  8 …°): a rigid shoe centred on a 12° chord tilted 6° and drove its pad corner 9 mm under the
  floor (Ariete X photo-draft receipt); at 1° the corner stays within a millimetre.
- The AMX-40's hand-authored polygon (the tank in the owner's second screenshot: pale dish, dark
  hub) rose from z −2.075 to −2.314 straight through the aft wheel at −2.15; it now uses the kit
  course with `botY 0.10` (the authored seat).
- Fleet review tool `tools/track-wrap-review.mjs`: ramp radius vs flat-run seat radius per end;
  after the batch 181 tanks / 184 units, 0 cut a wheel, 0 gaps.
- Departure receipts (Type 89 Light Tiger, Puma S1, CV90, Abrams spacing, K2 seat, T-90 sprocket
  tier, Type 10 reseat) now record the aft axle as the departure station; the Challenger 3 receipt
  measures the band body against the wheel instead of shoe boxes (guide horns pass between the
  paired halves).
- Rigid shoes on the wrap: a straight shoe centred on the wheel's circle tilts with its chord, so
  the shoes leaving the ground sit 1–5 mm under the flat pad plane on tanks whose grousers already
  ride within millimetres of the floor (Ariete X photo-draft, Type 90 X, Leopard 2A5 X). The
  ground receipts bound that to the ground plane (4–6 mm) instead of the flat plane; the arc's
  6° chords are circumscribed so no chord cuts inside the tire.
- Runtime fitting (`fitLoadedTrackContact`): with the run wrapping the outer wheels, a wheel at
  full droop pulled the short wrap cells straight down and the band rejoined the fixed ramp at a
  kink; a rigid shoe across that kink cut 8 mm into the tire (Type 10 X wave fixture). Drops now
  spread along the lower run at no more than 0.8 m per metre (~39°); the fixture reads +1.1 mm.
- Source-contract ledgers restated with authenticated reasons: the T-90M lamp history hashes the
  whole `t90.ts` (hub package seated), the T-72B3M X side-mount preservation ledger
  (`COT_UPDATE_LEDGER=1` mode added to its receipt), the Merkava return-roller helper hash, and
  the Chieftain Mk10 X published-foundation protocol, which gains a `laterTrackWrap` successor
  record whose non-track draw-vertex multiset the receipt re-derives (unchanged before/after:
  199 716 / 173 316 vertices, same SHA) — the wrap changed exactly the two band meshes (−240
  draw vertices each) and the shoe positions.

### Geometry gate (standard check, step 1 of the release check)

Candidates and outcome, batch 17 → batch 18: t90a_burlak_x 94.7, strv122_x 96.0, leo2a4m_x 93.1,
kf51_x 93.3, t80u_x 95.0, amx40_x 92.3, leclerc_x 93.4, t90m_x 91.9/90 all PASS; challenger_3 and
challenger2 have no registered oracle; challenger1_x was 0 before and after (mg0, dims 0 —
pre-existing). Four X tanks moved: t72b3m_x dims 93.3 → 91.9 (the hub package pulled in 3 cm),
leo2a7v_x whole 92.2 → 91.9, type10_x dims 79.4 → 75.7 and m1a2_sepv2_x hull 87.6 → 76.8 —
the last two were already below the bar (their pre-batch shoes sat 87 mm and 43 mm under the
tank-frame floor; the presentation floor offset hides it in game). The mask oracles for the X
tanks are their source GLBs, whose track ramps start at the old contact pins; the owner-directed
wrap deviates from them by design. The release check ran on the eight passing ids; its fidelity
step put kf51_x's `component.turret.right` at 91.8 (92.8 at 88f235a41, 97.6 overall either way —
the wrap shifts the right-view registration against the GLB), recorded as a fleet bar in
`tools/west-x-reference-overrides.ts` per the owner-directed-change rule.

### Mobile and boot (outside QA at 390×844)

- Boot gate copy: "Tap or press any key to continue" (touch: `boot.gate.promptTouch`).
- Bots mode toggle 38×44 → 72×44 beside a 62 % BATTLE button on coarse pointers.
- Boot watchdog: stage notice 16 s (status line only), recovery 30 s — no RETRY button while the bar
  still moves. Receipt `chunkRecovery` repinned to the timers the stage arms.
- Touch layer: backgrounding releases the joystick and aim pad as well as the fire gesture.
  Harness `.qa-dev/touch-loop.mjs` (20 scenarios: boot gate, joystick, fire, two-finger, cancel
  mid-drag, second finger mid-fire, background/return, restart, orientation): 20/20 portrait and
  20/20 landscape, 0 page errors.

### Also in this batch

- Pre-battle countdown: a PREPARING BATTLEFIELD state while the warm-up is pending, so the numeral
  no longer sits on 3.
- Per-map water bodies beyond the turbidity field (`waterContact.ts`: cold sea, glacial lake,
  silt river, mud pool, obsidian lake …).

### Landed (2026-09-14 evening)

Gate 26 on 24b1a7b9c: pre 582 / core 800 / post 45 receipts green and the private build green; its
all-map smoke failed on polders with "Illegal invocation" — `awaitMapCaptureReadiness` handed
`setTimeout` over as the default clock's method, so the timeout promise rejected inside the race and
won it whenever a map's textures were still loading (twenty maps had settled first). Fixed in
4748e33f0 (bound wrappers, receipt drives the default clock through a late promise); gate 27 reran
the smoke (30/30), the receipt and the build. Release check runs 4 and 5 fell to machine load during
the fidelity capture and to an unregistered receipt left in the checkout; run 6 passed end to end on
t90a_burlak_x, strv122_x, leo2a4m_x, kf51_x, t80u_x, amx40_x, leclerc_x, t90m_x. Deploy 18
(main-CquDnnhm.js, claude-of-tanks-bn66bd817): production map smoke reached battle on verdant /
frontier / alpine with no errors; live wheel materials read dish #504e3d–#534d3c over tire #292a28
(the floor holds); garage renders of six tanks OK; touch loop 26/28 on production (portrait) — the
fire-tap miss was production latency (passes locally), the settings scenario looked for the garage
gear on the battlefield (probe fixed: the touch layer's own quick button), and two findings remain
for the next mobile pass: the quick settings button listens for `click`, which the browser withholds
while a steering finger is down, and a far up-right joystick drag in landscape read speed 0.
