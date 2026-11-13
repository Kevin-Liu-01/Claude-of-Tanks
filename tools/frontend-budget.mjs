#!/usr/bin/env node
// frontend-budget.mjs — the frontend's budgets on every surface (UI-LOCKDOWN E, 2026-10-25; the owner: "i want the frontend
// to be totally perfect and performant as well").
//
// Scores recorded runs, surface by surface, on both rigs (desktop at 1440; a 390x844 phone at 4x CPU):
// - public pages (tools/nav-timeline.mjs steps in a 'public' journey): LCP, CLS, total blocking time, INP;
// - app screens (tools/click-timeline.mjs presses, and nav-timeline's 'game' steps): the shell within a frame of the
//   press's paint, useful content, INP p98, no long task over 50 ms, dropped frames;
// - everywhere: console errors and warnings (click-timeline --census) and memory over twenty open/close cycles
//   (click-timeline's memory-cycle path).
// - bundles (a built dist, --dist): each route's brotli bytes and requests before its entry runs, and the game entry's
//   own brotli bytes, against BUNDLE_BUDGETS (2026-10-25, Main: "so growth needs a named ruling").
// A surface's value is its worst sample (INP: the 98th percentile). Each miss names the lane that owns the surface.
//
//   node tools/frontend-budget.mjs --nav=<run>/<label> [--click=<run>/<label> …] [--dist=<dir>]     the table, misses first
//   node tools/frontend-budget.mjs … --check     exit 1 on a miss tools/frontend-budget.json does not list, or on a listed
//                                                miss that got worse than its recorded value (by 25 % and the metric's slack)
//   node tools/frontend-budget.mjs … --write     record this run's misses as the known list (a reviewed decision; a
//                                                bundle miss is never recorded: it needs a named ruling, written by hand)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET_PATH = fileURLToPath(new URL('./frontend-budget.json', import.meta.url));

/** UI-LOCKDOWN.md part E, per surface class and rig. */
export const BUDGETS = Object.freeze({
  public: { lcpMs: { desktop: 1200, phone: 2500 }, cls: 0.01, tbtMs: 100, inpMs: 100 },
  app: { shellMs: 100, contentMs: { desktop: 200, phone: 600 }, inpP98Ms: 100, longTaskMs: 50, droppedFrames: { desktop: 0, phone: 1 } },
  everywhere: { consoleErrors: 0, consoleWarnings: 0, heapGrowthMb: 5, nodeGrowth: 100, canvasViolations: 0 },
});
/** Lower is better for every metric; a regression is past the known value by 25 % and this much. */
/**
 * Each route's boot bytes (brotli, quality 11) and requests before its entry runs, and the game's entry chunk (tools/
 * bundle-budget.mjs measures them). Pinned at a reviewed build with no headroom: a route that grows past its pin fails
 * check:frontend until the known list carries the miss with a `ruling` (who decided, when, why). Lowering a pin needs
 * nothing; raising one is that same named ruling, here on the line above the number.
 */
export const BUNDLE_BUDGETS = Object.freeze({
  // 2026-10-25 (nav-perf, UI-LOCKDOWN E): first pinned at the lane's public build of release 252 (the turret seat plane, the
  // tier table and the deterministic math in one boot chunk, the Garage's equipment preview lazy).
  // 2026-10-25 (integrator 253, re-pinned at the release build of 253 after its npm ci, under these named rulings):
  // - Main: "253: riding-parts prebuild trigger, moves into a lazy chunk in 254" (frontend-budgets-252 e297944861 +
  //   8cc6be8301: +170 B brotli on the game, +259 B on its entry, accepted for 253);
  // - Main's no-extra-request ruling: canvas-ui's uiCanvas and equipment-rules' vehicleEras ride in the turretSeatPlane
  //   chunk and equipmentRules with vehicleActions (vite.config.ts), so the game is at 129 requests, cn 130, the Gallery 75;
  // - home +714 / docs +1,361 / 404 +545 brotli over the lane's pins: the Premiere lead's /home and 404 rounds 17 and 18
  //   and the mode hues (brand-ui-home-252 024b0c5ff6, c6ebdd8eec), primitives' Field Manual r13/r14 with its mode glyphs
  //   (brand-ui-primitives-250 2c6c740125), the registry's data-datum markers (surface-registry-253 6837baa487).
  // 2026-10-25 (integrator 254, re-pinned at the release build of 254 after its npm ci; each share is the local build of
  // its merge commit against the one before, and main 253 built that way reads its release pin within 4 B):
  // - battle-spikes-253 100114d1e4 (the entry and Garage world-build slices, the footprint point index, the shadow
  //   cache's scoped re-renders, the minimap chrome cache): +1,410 B game, +94 B entry, +367 B Gallery;
  // - Main: "stage 2b pass 1, the decor worker's plan/attach split and planner" with 253's riding-parts trigger relabelled
  //   in fleetFactory (decor-worker-254 22213d3b33, which carries frontend-budgets-252 b7f7e781b8): +546 B game,
  //   +166 B entry, +442 B Gallery (the lane's known-list rows, folded in here);
  // - rust-support-solve-253 65f8688d36 (the kernels' fallback report; the solo-host entry stays lazy): +105 B game, +40 B entry;
  // - brand-ui-battle-242 4074630480 (gauntlet round 8, the Frontline hostiles datum, the touch contract): +801 B game
  //   (+747 B cn), +104 B entry; home +6 B and 404 +4 B; docs -4 B. tech-tree-view-252 -2 B; media-home-r2-252 none.
  // Requests unchanged.
  // 2026-10-26 (integrator 254, the forwards, re-pinned at the release build of d0186c3164):
  // - Main: "owner /home sections and hero text (2026-10-25)" (brand-ui-home-252 235ce8ba78 then 4d0b30d296: the hero's
  //   headline, line and per-clip caption on a measured scrim; Head to head, In battle and The fleet as lazy sections):
  //   home +1,093 B (the lead measured 25,923 at 235ce8ba78), docs +17 B, game +33 B;
  // - canvas-ui-253 b4aa00359b (the phone livery swatches' retained surface): +173 B game, +163 B Gallery;
  // - Main: the owner's Garage asks, accepted and re-pinned at the release build (brand-ui-garage-redesign-245
  //   64ca0557d5: the hero on the measured free stage, the roster as one kit row; with integ's equipment-tip fix):
  //   +1,376 B game, +1,077 B entry, +473 B Gallery, home -25 B. Requests unchanged.
  // 2026-10-26 (integrator 255, re-pinned at the release build of f015b17209; shares as 254's, main 254 local within 107 B):
  // - battle-spikes-253 c8f5bdb152 (the memory fixes, the MP entry's structure mask before the compile): +606 B game, +566 B
  //   entry; its forward dc4c2df7b3 (the MP opening warm batches, gated link polls, the impostor bake under the cover):
  //   +848 B game, +529 B entry;
  // - decor-worker-254 c496fd9a45 (the Studio's first-frame links): -37 B game, -187 B entry;
  // - Main's step 5 flip, rust-support-solve-253 b0bf08e3df (a free sortie on a local host Worker): +626 B game, +613 B entry;
  // - vehicles-diagrams-camo-253 365ade19dc (the diagrams' DOM labels; their tones a lazy token module): +180 B game,
  //   +331 B cn, +344 B Gallery, home +9 B, docs +7 B, 404 +3 B; media-maps-r1-254 -3 B; integ's fleet wall +99 B game;
  // - Main: "owner map/camo picker (interaction redesign A)" (interaction-picker-254 2c11b57f98): game -69 B, entry -311 B,
  //   Gallery +261 B, home +173 B, docs +272 B, 404 +311 B; no extra request (its sheet in the game's CSS, its facts' tags
  //   in the playMode chunk). Requests unchanged.
  // 2026-10-26 (integrator 256, Main's ruling 'hotfix: solo default back to page', the release build of 60b664f11f):
  //   soloAuthorityFor's default back to the page: -170 B game and cn, -170 B entry. Other pages and requests unchanged.
  // 2026-10-26 (integrator 257, re-pinned at the release build of 97371edb3a after its npm ci; each share is the local build of
  // its merge commit against the one before, main 256 local within +223 B of its release measure):
  // - Main: "owner Garage asks + camo picker (interaction redesign B)" (brand-ui-garage-redesign-245 dbd9941cdd: the camera
  //   lowered, class glyphs on the hero cards, the staging plate, stat-panel titles, the camo picker and try-on, the kit
  //   picker menus): +5,011 B game, +790 B entry, +6,930 B Gallery; its kitPicker group folds one game and cn boot request;
  // - Main: "load card team lists + no letterbox" (brand-ui-battle-242 ce619fabd2, then 317d96c2c9's flyby grade): +1,047 B
  //   and +338 B game (+253 B and +338 B entry), Gallery +67 B, home +10 B, docs +15 B, 404 +11 B;
  // - interaction-picker-254 c10c8f3834 (favicon set, hover loops, modal kit, toasts in the Tab ring, rooms-kind, Jev switch):
  //   +352 B game (+202 B entry), Gallery +221 B, home +30 B, docs +31 B, 404 +18 B;
  // - decor-worker-254 b51f51974b (the kit's own camo entry): +261 B game (+75 B entry); 4e0eaf6f40 (the Studio's second
  //   entry) with integ's programWarm group: +134 B;
  // - battle-spikes-253 2e0dd5066c: +122 B game (-16 B entry); its lazy post passes split engine/gpuCatchUp.ts into one more
  //   game and cn boot request, which integ groups back into programWarm's chunk (97371edb3a);
  // - retier-257 +56 B, t90-lineage-257 -78 B, image-fit-254 -266 B (entry -269 B), brand-ui-primitives-250 4bab44f1c4 with
  //   integ's image-fit reconcile -343 B (entry -330 B; Gallery +108 B, home +23 B, docs -246 B, 404 +4 B; docsPickers.css
  //   adds no docs request).
  // Requests: game 129 -> 128, cn 130 -> 129; the others unchanged. The pins are the final release build's (432767fd9e, after the
  // integ fixes: the Field Manual's Watch keys, the T-90 pair's matchmaking tier, the four hover loops, the try-on's seed
  // form): game -318 B and Gallery -291 B against 97371edb3a's build, 404 +16 B.
  // 2026-10-26 (integrator 258, re-pinned at the release build of 7d7d15e292 after its npm ci; each share is the local build of
  // its merge commit against the one before, main 257 local within -118 B of its release pin; Main approved the totals):
  // - Main: "owner Garage framing + Overview compare" (brand-ui-garage-redesign-245 5197bfc9c0: the tracks on the name line,
  //   the 14 degree look-down, the Overview readout's compare legend, Studio s17, the tier chip in the kitPicker chunk):
  //   +796 B game (+830 B cn), +402 B entry, +500 B Gallery, home +127 B, docs +39 B (approved: +858 / +899 / +435 / +499);
  // - Main: "no flags on the markers" (brand-ui-battle-242 37e25f7081, with gauntlet r14): +555 B game (+759 raw), +156 B entry;
  // - Main: "solo roster plan, phase 1" (solo-roster-plan-258 5eeb374220, planBattleSeats): +671 B game (+2,414 raw), entry
  //   -9 B (approved +866 / +2,413 raw);
  // - interaction-picker-254 3880af6939 (the boot lockup, the /home press cards, hover loops): +241 B game, +11 B entry,
  //   home +226 B (inline CSS +170 B), Gallery +289 B; its forward e9369a4258 (one selected state): -150 B game, +96 B entry,
  //   Gallery -156 B, home -15 B;
  // - mm-tiers-258 da835cd14b (matchmaking tier.ts follows the shown tiers): -717 B game, Gallery +419 B;
  //   vehicles-m48a5-mantlet-258 +47 B game (+74 B Gallery); vehicles-rear-drums-258 +386 B game (+433 B cn, +159 B entry,
  //   Gallery +172 B); brand-ui-primitives-250 07efeea37c (the 13 Deploy plates): -64 B game, docs +71 B, Gallery -61 B, home
  //   +5 B (approved -157 / +73 / +56 / +16); battle-spikes-253, media-deploy-panels-257 and motion-lint-253 none.
  // - Main: "boot-258 last" (nav-perf's boot fix, item/boot-258 2aef1bc70b: isBootCovering for every boot, the link waits
  //   before the first live frame, the Garage warm uncull'd at the scene's samples, the aux-armor rescans): +282 B game and cn
  //   (+630 raw; entry +45 B), Gallery +308 B (+502 raw, fleetFactory).
  // Requests unchanged. Over 257's pins: game +1,803 B (with the 128 B margin), entry +592 B, Gallery +1,545 B, home +334 B,
  // docs +94 B, 404 -18 B.
  // 2026-10-27 (integrator 259, re-pinned at the release build of 2324d9313a; each share the local build of its merge commit
  // against the one before, game brotli unless named; requests unchanged on every page):
  // - Main's named shares: consumables-260 +4,334 B in the merged chain (+4,079 alone against its base; entry +1,031 / +837
  //   alone, cn +5,007 / +4,738, docs +72 / +38; approved +4,020, entry +888, cn +4,664, docs +56); boot-259 +904 B (entry
  //   +838; approved +1,001 / +914).
  // - The heads' own: leo2a3-iv-260 (with tier-fairness-259) +413 B (Gallery +204); main-reds-hitmodel-259 +146 B (Gallery
  //   +217); greenery-settings-259 +578 B (home +107, docs +221, Gallery +299, 404 +110); brand-ui-battle-242 -293 B (cn -379);
  //   mp-room-leave-258 +260 B (entry +144); greenery-consumables-merge-259 -150 B; floating-decor-259 +106 B; hit-volume-fit
  //   +64 B (Gallery +119); mp-room-entry-258 +677 B (entry +522); killcam-capture-259 +160 B; strv103-gunport -215 B;
  //   drawings-overhaul-259 +41 B (its viewer a lazy chunk, no boot request); interaction-picker-254 +323 B (entry +382, inline
  //   CSS +171); main-reds-repins-259 -197 B.
  // Over 258's release build: game +7,176 B (entry +2,917), cn +7,719 B, Gallery +817 B, home +120 B, docs +314 B, 404 +120 B.
  // 2026-10-27 (integrator 260, re-pinned at the release build of 1b30e7fda4; requests unchanged on every page):
  // - Main's named shares: "consumables band: the slot fit and phone rows (with gallery-studio's 04c3954089)" +185 B game
  //   and cn (approved); "slot hint: the chevron (with gallery-studio's 9ca7e1da93) and the tip's count of kits" +374 B
  //   game, +392 B cn, entry +258 B; "Proving Ground mode, Deploy r40-r44, zh archive titles" (brand-ui-primitives-250
  //   3f4ce8a0e1; approved home +2, docs +78, Gallery +1).
  // - The heads' own: brand-ui-battle-242 e92b4bc2ab (UI-LOCKDOWN B14, gauntlet r17) then 25355f1b24 (gauntlet r18, +167 B
  //   game and cn between the two release builds, entry -23 B); garage-rail-end-loop 73b1dd157c and interaction-picker-254
  //   4c781561fc (the boot card's 1 px fixes, inline) small; integ's --ring-hot token.
  // Over 259's release build: game +1,200 B (entry +59 B), cn +1,261 B, Gallery +17 B, home +32 B, docs +124 B, 404 +15 B.
  // 2026-10-27 (integrator 261, re-pinned at the release build of 63279ead2f; requests unchanged on every page):
  // - the coordinator's named shares: "one surface stack, tank portraits in every list, kit pickers everywhere"
  //   (interaction-picker-254 89f90bfe88); "consumable icons on the equipment badge" and "badge hues and paper hues"
  //   (badge-hues-261 f46775977d); "Proving Ground plate, Deploy r45-r52, Manual r36-r40, Random's shuffle"
  //   (brand-ui-primitives-250 569e626421); "Owner's T-90 names" (t90-names-261); "boot-261: stepped Garage boot" (+698 B
  //   game); "battle-spikes: merged near-hull shadow casters and fracture caster profiles" (+941 B game); "iPad Garage:
  //   docked tablet layout, tablet.css, touch camera" (ipad-ui-262 0757457b36).
  // - the heads' own: brand-ui-garage-redesign-245 843dffd291, brand-ui-battle-242 f37467dc4c (a name line on every plate),
  //   the room guard and leave (integ groups engine/programReceipt.ts into programWarm's chunk: no boot request), the
  //   world slices and camera guard, the PL-01 gun fits, aps-flash-261 (lazy) and tier-fairness-261.
  // Over 260's release build: game +8,456 B (entry +2,692 B), cn +8,464 B, Gallery +4,864 B, home +759 B, docs +803 B, 404 +769 B.
  // 2026-10-28 (integrator 262, re-pinned at the release build of 42d8b603fa; requests unchanged on every page: the one new
  // game and cn boot request, app/lazyImportRetry.ts split out by loading-states-262's garageReturnFailure.ts as its third
  // importer, is taken back by that lane's own 69a7e3d79c, cherry-picked). By chunk, game brotli over 261's release build:
  // - main.css +977 B: "iPad tablet sizes" (ipad-ui-262 3c8adf97cb, tablet.css and techTree.css, about 60 %), "Garage
  //   round D1-D18 from the iPad critics" (brand-ui-garage-redesign-245 1cca4edbdf, garage.css and showroom.css, about a
  //   third), the lead's spanning menus and nation chips (interaction-picker-254 9d098a73e0, pickers.css), loading-states'
  //   picture fades.
  // - main.js (the entry) +1,184 B: "solo Worker default for quick battles" (solo-worker-warm-pacing-262 befcdbed54,
  //   main.ts), the Garage round's garage.ts (+0.7 KB raw), mp-room-leave-262's cooperative optimizeGarageDressing,
  //   loading-states' self-retrying battle entry.
  // - i18n.js +335 B (every page): docs-home-262's Every tank topic, the kit's reveal primitive (loading-states-262 and
  //   docs-home-262), the lead's surface stack; i18nCatalogEnUS +173 B: the heads' new strings; kitPicker +151 B: the
  //   lead's spanning menus; testDriveLink +111 B: the kit's chips and segmented control (the lead, gallery-studio);
  //   materials +98 B: the solo Worker's material keys; contextInfo +50 B (gallery-studio, lazy preload table);
  //   battleLoad +13 B (loading-states' load card ARIA); botCallsigns +20 B (the sortie's callsigns from the page).
  // - Gallery: gallery.js -488 B (the layers on the kit's segmented control) against the shared chunks above (+665 B).
  // - home, docs, 404: i18n.js +335 B and publicNav +70 B on each (docs-home-262's quiet catches); home.css +259 B and
  //   publicPages +180 B ("/home versus films" and the public loading states, media-home-versus-262 d390abce47 with
  //   docs-home-262); docs.css +1,496 B and docs.js +131 B ("Every tank" fleet grid and canvas-ui's print stylesheet,
  //   docs-print-261 f10680b6d0); notFound.js +47 B and notFound.css +26 B.
  // Over 261's release build: game +2,944 B (entry +1,184 B), cn +3,136 B, Gallery +150 B, home +807 B, docs +2,225 B,
  // 404 +477 B.
  // 2026-10-29 (integrator 263, the tank release, re-pinned at the release build of 442c60d574; requests unchanged on every
  // page: christian2Armor and leopard2HullDatums ride in the fleetLayouts chunk, vite.config.ts). Fifteen new tanks and
  // three rebuilt families. By lane, game brotli over 262's release build (each head's own chunks, local builds):
  // - armor-highlight-262 + its zones (the armour highlight, flag off by default; the zone weights module): +2,815 B,
  //   entry +90 B;
  // - cr3td-262 (the Challenger 3 TD and its RWS field fit): +1,763 B; t64bm1m-262 (the four true T-64s and the PT-64
  //   Tur): +1,461 B; oplot-262 (the BM Oplot-M and Oplot-T, oplotFlankLayout): +1,447 B;
  // - vickers-cr1-262 (a3b7d3f661: the Challenger 1 Mk 1/Mk 2 on the Mk 3's build, the FV4030/5 and FV4030/6, the
  //   Vickers Mk 1 restored to main): about +700 B game, Gallery +714 B, cn +447 B, entryRaw +75 B (the lane's measure);
  // - christian2-262, ztz20-262, cn-type59-longwei-262 (the T-55A, the Type 59 rebase, the Longwei hull), kv2-262,
  //   patton-family-262 (pattonCast), kf51/leo1a5: the rest of fleetFactory (+4.6 KB in all), materials (+2.4 KB: the
  //   new camo and coat keys), specs, decorations, tankFactoryCore and the generated presentation anchors;
  // - orphan-reds-264's painted collar +147 B; the integration's fixes (the KV-2 bead, the ZTZ-20 barrel, the T-54
  //   cradle, the M46 collar, the balance levers) under 100 B together.
  // Over 262's release build: game +12,463 B (entry -65 B), cn +12,525 B, Gallery +12,615 B, home +40 B, docs +3 B, 404 0.
  // 2026-10-29 (integrator 264, the combined 263+264 release, re-pinned at the release builds of e93c4a67dc and 89b62a1454,
  // the larger of the two (the entry carries the commit stamp: 123 B between them); requests
  // unchanged on every page: leopardA6UaLayout rides in the fleetLayouts chunk, vite.config.ts). By lane, game brotli over
  // 263's release build (each chunk's delta, 263's and this release's builds):
  // - ghillie-render-264 c053e825af (the suit's shade baked on the armour under it, the Strv 121's cover boughs):
  //   decorations +4,326 B, tankFactoryCore +1,041 B (the suit-occlusion bake), materials +111 B;
  // - battle-camera-264 8736e9555e (chase framing, the sight datum, Settings > Gameplay > Camera): the chunk holding
  //   vehicleActions +1,815 B, the entry and the en-US catalog about +1.2 KB with premiere-battle's b8e8050af7 phone
  //   markers (entry +1,018 B over A in all);
  // - premiere-battle 87827bc352 (boot-loading, diagnostics on F9, one action one key, live key caps), load-failure-264
  //   1328554575 (the loadFailure kit, gallery-studio 87a2c42d93), nav-reds-264 and fallback-metrics-264: the entry
  //   +1,154 B, i18n +221 B and the en-US catalog +428 B, main.css +159 B, components.css +62 B; Gallery's gallery.js
  //   +205 B and gallery.css +117 B; on home, docs and 404 i18n.js +220 B and each page's stylesheet +46-72 B;
  // - leo2a6-ua-264 4a05165a7a/128e35403e and ztz85-iii a4f7986470: fleetFactory +1,069 B, fleetLayouts +570 B;
  // - armor-zone-panels-263 39cd535a02: materials -518 B, tankFactoryCore +173 B; balance-263, orphan-reds-264,
  //   ground-stripes-264 and the integration's fixes under 300 B together (rosterState, turretSeatPlane, markings, specs).
  // Over 263's release build (at e93c4a67dc): game +12,278 B (entry +2,172 B), cn +12,981 B, Gallery +7,516 B, home +317 B,
  // docs +335 B, 404 +288 B.
  // 2026-10-29 (integrator 264c: B 8f37dee995 plus the owner's preview fixes; requests unchanged): game, cn and Gallery
  // re-pinned at 264c's build of 490b3e0c60 (Node 24.22.1), game and cn at the release (preview) build of afcffcd358, the
  // larger (the entry's commit stamp: +170 B brotli). Over B's local build: game and cn +565 B (entry +100 B), Gallery
  // +281 B, by lane: battle-camera-264-lens 067f28f029 (engine/cameraLens.ts in the vehicleActions boot group, the aerial
  // and contact rays' lens shift, the cascade refit on a lens change, ?chaseFraming=0), shadow-bake-fixes-264 5f8189f900
  // (the armour panels' on-demand bake) and solo-local-feel-264 ab5efb500d (the page sim by default, SOLO_WORKER_MODES gone).
  // 2026-10-29 (core-two-drivers-265, the owner's one core and two drivers; pins kept at 264c until the 265 integration build):
  //   main.ts's solo authority routing and the solo sim Worker's and the solo host's composition gone: game and cn -1,980 B,
  //   entry -1,806 B, Gallery -134 B, docs -2 B (the lane's build against its base 4a6261fb00 on one node_modules); requests
  //   unchanged.
  // 2026-10-31 (integrator 265, the single end re-pin at integ 88f37331ea's build; Node 24.22.1; requests unchanged at 128 /
  //   129 / 75 after the 2A4 family's armour tables joined fleetLayouts): game +14,740 B brotli (boot chunks +15,029 B over
  //   main's build in i265-runs/dist-main), cn +14,865 B, Gallery +16,058 B. By chunk and lane: fleetFactory +5,669 (the
  //   fleet's new ids registered at boot: the Centurion family's six, the four M48s, the Longwei family's four, the Leopard
  //   1A2A1, the fourth-batch 2A3, the three PT-84s; the 2A4 family's envelopes), fleetLayouts +4,158 (the 2A4 family's
  //   Kontakt-1, 2A3 batch-4, family and cheek armour tables; the T-62M-V1 X study's ERA zones), decorations +1,986 (the
  //   launcher keep-out and sweep guard, the Twardy's and T-84U's own banks, the Leopard 1s' kit filter), tankFactoryCore
  //   +1,056 (local-fps-265/266: the gear LOD, the running gear's cheaper pass), specs +724, flags +720 (South Africa,
  //   Australia, Poland's new hulls), camoPolicy +612 (the Centurion family's and the PT-84s' paints, the 265 Signatures),
  //   vehicleMarkings +411, presentation anchors +320, roles/taxonomy/i18n +500; main -1,400 (core-two-drivers: the solo
  //   routing gone). Inline CSS +6-16 B a page: the PT-84 font's ł/Ż (accepted, Main 21:40).
  // 2026-10-31 (integrator 266, the single end re-pin at integ/266 0df7b32811's build; Node 24.22.1; requests held at
  //   128 / 129 / 75 after the Leopard 2 wedge leaf joined fleetLayouts): game +15,365 B brotli (boot chunks +15,416 B over
  //   265's production build dd53e635f8), cn +15,836 B, Gallery +14,581 B. By chunk and lane: fleetFactory +6,292 (the
  //   21 new ids registered at boot: the Danish Leopards and M41s, the T49, the CV9035 DK, the Brazil line's eight, the
  //   Magach 6B and 7C, the Ukrainian CV9040C; the T-90 family's frames), turretSeatPlane +1,696 (the gun-face split and
  //   cell facets, the shot card's hull points reader), fleetLayouts +1,492 (the Leopard 2 wedge fit, the M41 and Brazil
  //   tables), vehicleMarkings +1,079 (the Brazilian insignia, the Ukrainian triangle, the Danish flags), decorations +1,051
  //   (the suit-roof rule, the Proryv bow plate, the new ids' loads), camoPolicy +804 (the Danish, Challenger 1, Brazilian
  //   and M41 coats), specs +603, tankFactoryCore +570 (local-fps-266's opaque program order and lit set), main +429,
  //   i18n +413, presentation anchors +358, materials +271 (the armour paint's damage-only read), roles/taxonomy/teams +300.
  // 2026-11-01 (integrator 266, re-pin at integ/266 30eab409ee's build; requests unchanged): game +194 B brotli, cn +194 B
  //   over the 0df7b32811 pins: the shot card's one-line rows (item/shot-card-fit-266, +93 B, inside the slack alone) and
  //   Brazil's flag-icons br.svg in flags.ts's FLAG_URL (+101 B: the Brazilian flag chips were broken images); Gallery
  //   +49 B stays inside its slack.
  // 2026-11-02 (integrator 267, the single end re-pin at integ/267 80bc20be95's build; Node 24.22.1; Main's brief: one bundle
  //   re-pin with attribution): game +2,951 B brotli over the 266 pins (boot chunks +3,006 B over 266's main 950a4acc85 built
  //   here on the same node_modules, which reads its pin within -144 B), cn +2,985 B, Gallery +2,786 B; requests DOWN to
  //   127 / 128 / 73 (the Type 10 armour and gun-seat chunks and mapPalette fold away; the entry -89 B). By chunk and lane:
  //   type90bArmor +1,474 (new: the Japan line's Type 90 (B) and Type 10 family tables, replacing type10DozerArmor -598 and
  //   type10GunSeat -239), vehicleMarkings +1,232 (the 2A7 DK's and Centurion DK's Danish marks, the Type 90 (B)'s),
  //   fleetFactory +843 (the three new ids registered at boot; Leclerc round 5, the Magachs, the Leopard 1 outlets, the T-90
  //   family's rebuild), materials +712 (the bevel class's plate planes; the 2A7 DK's Barracuda coat), collision +244 (main's
  //   plane fit), camoPolicy +190 (paint_leo2a7dk, paint_centurion5_2dk, paint_type90b, paint_type10), franceSpecs +146 (the
  //   AMX-40's depression curve), decorations +137, mapNames +124 (new) against mapPalette -1,276 (main's og-cards), the rest
  //   under 65 B each. Home +8 B, docs +58 B and 404 +120 B stay inside their slack.
  // 2026-11-06 (integrator 268, the single end re-pin at integ/268 ef6dc8f8bd's build; Node 24.22.1; Main's brief: one
  //   bundle re-pin with attribution): game +10,487 B brotli over main 2cd74ad446 built here on the same node_modules
  //   (1,165,629 B, within its pin), cn +10,736 B, Gallery +8,928 B; requests held at 127 / 128 / 73 (17ca8fa2b5 folds
  //   twin-aa's frames into fleetLayouts and camoPaint into vehicleActions); the entry +657 B stays under its pin. By chunk
  //   and lane: fleetFactory +5,698 (the seven new ids registered at boot: bmpt_terminator, tunguska_m, pantsir_s1,
  //   gepard_1a2, pgz95, pgz09, m3a2_bradley; the M1A1s on the owner model, the T-80UK, the KF51 and IFV rebuilds),
  //   fleetLayouts +1,642 (gepardFrame, gm352Layout, chineseAirDefenseLayout, challenger1XSuppliedFrame), main +657
  //   (core-parity's shared sim stages and bots' construction, couch mode and phone feel's boot wiring), specs +530,
  //   vehicleActions +522 (camoPaint, core-parity's hull actions), decorations +462, tankFactoryCore +313, the en-US
  //   catalog +220 and zh-CN +249 (the new names, couch strings), presentation anchors +140 (portrait envelope),
  //   matchRuleset +103, camoPolicy +93 (the Kaitaku coat, the AA paints), crewVoice +68 (da, pt-BR, en-AU, af),
  //   roleProfiles +66; materials -185. Home +9 B, docs +11 B, 404 -5 B stay inside their slack; pad's 14th request
  //   (padProtocol) is phone-feel-269's own pin in tools/bundle-budget.json.
  // 2026-11-07 (the implicit state machine fixes' integration, round five merge, item U3; Kevin: "id like you to resolve
  //   all of them"; the round's brief re-pins the byte rows alone, with attribution against origin/main's
  //   build): re-pinned at item/sm-fix5-merge 809bb9cb28's build (Node 24.22.1, vite 8.3.5, rolldown 1.2.15) over main
  //   baff0f6924 built beside it on the same node_modules (game 1,176,072 B, entry 249,403 B, within the 268 pins).
  //   Requests unchanged at 127 / 128 / 73 / 8 / 12 / 7, and every page's boot chunk names equal main's. Game +14,543 B
  //   brotli, entry +6,797 B, cn +14,564 B, Gallery +2,883 B, home +144 B, docs +152 B, 404 +210 B: the audit's owners
  //   from rounds one to five (app lifecycle, battle entry and Garage return, input and pointer lock, the result and
  //   death-flow runtimes, holds, battle mode). By boot chunk, brotli [raw]: main +6,797 [+22,103] (the entry), playMode
  //   +2,479 [+7,398] (round four's grouped boot leaves: app lifecycle, battle input owner, battle mode, kill-cam claim,
  //   pre-battle countdown), turretSeatPlane +1,310 [+3,259], tankFactoryCore +783 [+2,899], garageStage +649 [+1,632],
  //   collision +433 [+1,229], vehicleActions +431 [+1,387], materials +364 [+1,309], terrainDeformation +212, brandMark
  //   +206, programWarm +178 (named holds), quality +131, i18n +121 (the chunk every page loads: with publicPages +18 and
  //   notFound +84 it is the whole of home's, docs' and 404's growth), the rest under 100 B each. Round four's head
  //   f60d0aa200 read game 1,190,261 and entry 255,828: round five adds game +354 B and entry +372 B (main.js carries
  //   flow's Q2 pointer-lock hold, soloBattleEntryRuntime.ts, and input.ts's withdrawn request), Gallery -77 B (noise).
  // 2026-11-07 (integrator 269, the single end re-pin at integ/269's build; Node 24.22.1; Main's brief: one bundle re-pin
  //   with attribution): game +13,296 B brotli over 268's measured build (1,176,116 B, its pin), cn +13,318 B, Gallery
  //   +11,949 B; requests held at 127 / 128 / 73 (the Redback's datums, redbackDatums.ts, fold into fleetLayouts; alone
  //   they were one more boot request); the entry +1,212 B (main) is re-pinned. By chunk and lane: vehicleMarkings +4,716
  //   (glacis-269's Glacis 1.100 outlines; the new ids' marking rows), fleetFactory +3,630 (the thirteen new ids
  //   registered at boot: the M113A3 and the M113A1 FSV, MRV and AS4, the Leopard AS1, the M1A1 AIM SA and M1A2 SEPv3
  //   (Aus), the Redback, the Olifant Mk 1, 1A and 1B, the Semel, the TTD; kf51u-r17's KF51-U), main +1,212
  //   (dev-battle-freeze, impact-materials' audio stack, second-battle-reveal), wreckDents +866 and tankFactoryCore +117
  //   (wreck-barrels' bent-barrel cut), specs +754, camoPolicy +630 (plain-coats, the Australian three-tone, the South
  //   African coats), decorations +583 (the M113 kit's manifests), fleetLayouts +229 (the Redback's datums), presentation
  //   anchors +214, the en-US catalog +134, structureGroundOcclusion +129, roleProfiles +109, turretSeatPlane +98,
  //   garageStage +66; materials -158, crewVoice -121. Gallery adds vehicleFacets +105. Home +8 B, docs -10 B and 404 +5 B
  //   stay inside their slack; pad's row is phone-feel-269's in tools/bundle-budget.json, held.
  // 2026-11-08 (the implicit state machine fixes' round eight, item Y0; Kevin: "id like you to resolve all of them"):
  //   integ/269 21d5c7fd30 merged into item/sm-fix-integration b03868e697 (round five's re-pin above, over 268) carries
  //   both re-pins above; neither fits the merge, since each side grew the same pages over 268. Re-pinned at
  //   item/sm-fix8-269's build (Node 24.22.1, vite 8.3.5, rolldown 1.2.15; the same node_modules) at the measures, the
  //   byte rows that missed only. Against both parents' pins: game 1,204,277 B brotli (+13,662 over ours 1,190,615,
  //   +14,865 over 269's 1,189,412), entry 257,684 (+1,484 over ours 256,200, +7,025 over 269's 250,659), cn 1,249,096
  //   (+13,754 over ours 1,235,342, +14,956 over 269's 1,234,140), Gallery 759,827 (+12,259 over ours 747,568, +3,193
  //   over 269's 756,634). Each is the two sides' own growth over 268's measured build summed (game: ours +14,543, 269's
  //   +13,296; entry +6,797 and +1,212; cn +14,564 and +13,318; Gallery +2,883 and +11,949) plus 366, 272, 436 and 310 B:
  //   both sides edit the same chunks (main, the audio engine, the fleet), and brotli does not add across them.
  //   Requests unchanged at 127 / 128 / 73 / 8 / 12 / 7 (check:bundle PASS, tools/bundle-budget.json untouched). Home
  //   28,756, docs 37,096 and 404 18,677 measure within the larger of the two pins (ours), which they keep.
  // 2026-11-08 (the implicit state machine fixes' round seven merge, item V11, after origin/main 21d5c7fd30 (269) merged in;
  //   Kevin: "id like you to resolve all of them"): both re-pins above kept; the byte rows re-pinned at item/sm-fix7-merge
  //   e71b3e5ee9's build (Node 24.22.1, vite 8.3.5, rolldown 1.2.15). The local build and the release way (the build with
  //   VERCEL_GIT_COMMIT_SHA set, as vercel build sets it for tools/appVersion.ts) are byte-identical: a clean worktree
  //   stamps the same commit from git, and the stamp (__COT_MATCH_BUILD__) rides only in browserComposition (lazy) and the
  //   host Worker, 0 B on every row here. Over main 21d5c7fd30 built beside it on the same node_modules (game 1,189,441 B,
  //   entry 250,688 B, within 269's pins): game +14,685 B brotli, entry +6,845 B, cn +14,776 B, Gallery +3,193 B, docs
  //   +119 B, 404 +203 B; home +114 B stays inside its slack (its row held). Requests unchanged at 127 / 128 / 73 / 8 / 12
  //   / 7, and no page's boot files changed. By boot chunk, brotli [raw]: main +6,845 [+22,093] (the entry), playMode
  //   +2,474 [+7,398], turretSeatPlane +1,323 [+3,259], tankFactoryCore +1,024 [+2,896], garageStage +605 [+1,632],
  //   vehicleActions +457 [+1,387], materials +439 [+1,306], collision +324 [+1,229], brandMark +216, terrainDeformation
  //   +212, programWarm +178, quality +131, i18n +120 (with publicPages -11 and notFound +78, the whole of home's, docs'
  //   and 404's growth), medalArt +94, rosterState +81, the rest under 70 B each; the Gallery's gallery.js +223. It is the
  //   branch's share named in round five's re-pin above (rounds one to six; round six's own +4 B: main.ts's result
  //   presentation releasing through input.releaseLock), now over 269's code. The stamp reaches these rows one way: the
  //   entry names the stamped chunks (browserComposition, browserHostPort, matchHostWorker) by their hashes, which move
  //   with every commit (32 bytes of main.js, raw equal). Three commits of the same code read the entry at 257,533 B
  //   (e71b3e5ee9), 257,562 B (99e46f93c9) and 257,710 B (e09e561ed2): a 177 B spread, past BUNDLE_SLACK's 96 B on the
  //   entry (264c's "+170 B" was this). The game, cn and entry rows take the largest build's (e09e561ed2: game
  //   1,204,303 B, cn 1,249,122 B, entry 257,710 B), as 264c took the larger.
  // 2026-11-09 (the implicit state machine fixes' round eight, item Y0b; Kevin: "id like you to resolve all of them"):
  //   round seven's integration 3e4bf3c4db merged into round eight's H0 d8a6b5e623, each of which merged 269 with its own
  //   re-pin (the two entries above). The merged build (item/sm-fix8-y0b 8ef46d8770; Node 24.22.1, vite 8.3.5, rolldown
  //   1.2.15, the same node_modules) reads game 1,204,144 B brotli, entry 257,551 B, cn 1,248,963 B, Gallery 759,827 B,
  //   home 28,756 B, docs 37,096 B, 404 18,677 B; requests 127 / 128 / 73 / 8 / 12 / 7 (pad 14), unchanged. No row
  //   missed the larger of the two parents' pins: the merge adds no code of its own over them (round six's main.ts
  //   releaseLock is inside round seven's figures; the audio engine is a lazy chunk). Game, cn and the entry keep round
  //   seven's largest-of-three-builds pins (1,204,303 / 1,249,122 / 257,710): this build sits 159 B under each, inside
  //   the entry's commit-hash spread (201 B over five commits) that BUNDLE_SLACK's 96 B does not cover. Home, docs and 404
  //   re-pinned at this build (stable at 28,756 / 37,096 / 18,677 over every build of either parent since 269).
  // 2026-11-09 (integrator 270, the single end re-pin at integ/270's build; Node 24.22.1): game +5,200 B brotli over 269's
  //   measured build (21d5c7fd30, equal to main 72addd0635 for the bundle; 1,189,441 B), cn +5,651 B, Gallery +273 B;
  //   requests held at 127 / 128 / 73 (Air Support's three boot leaves, sim/playerActions, game/strikeViewState and
  //   engine/strikeMarks, fold into vehicleActions; alone they were three more game and cn boot requests); the entry
  //   +886 B (main) is re-pinned. By chunk and lane: vehicleActions +2,612 (air-support-270's action bits, strike view
  //   and the terrain's strike marks), main +886 (the five merged lanes' boot wiring),
  //   matchRuleset +611 (the Air Support mode's rules), the en-US catalog +350 and zh-CN +451 (cn; the mode, pad and
  //   strike strings), crewVoice +222 (the 21 world packs), gameModeCatalog +109 (the fourteenth mode), battleLoad +93,
  //   icons +87, icon +70 and the design tokens +68 (on every page). Home +143 B, docs
  //   +123 B and 404 +57 B (the same shared chunks) are re-pinned at their measures; pad's row is held.
  // 2026-11-09 (the implicit state machine fixes' round eight merge, item Y11; Kevin: "id like you to resolve all of
  //   them"): the ten round-eight clusters over H8 1bf9654a97 (the Y0b entry above) with origin/main 1b10803a6b (270, the
  //   entry above it) merged in; both histories kept. Re-pinned at item/sm-fix8-merge 4a9a1f14f7's builds (Node 24.22.1,
  //   vite 8.3.5, rolldown 1.2.15, the same node_modules; package-lock.json unchanged by 270): the local build and the
  //   release way (VERCEL_GIT_COMMIT_SHA set, stamp v1.0.0+g4a9a1f14f) are byte-identical, so the larger is either: game
  //   1,210,986 B brotli, cn 1,256,211 B, entry 259,227 B, Gallery 760,044 B (5b1a68e304's build read the entry at
  //   259,062 B, the commit-hash spread). Over 270's measured build (its pins): game +16,345, cn +16,391, entry +7,653,
  //   Gallery +3,137. Over H8's (Y0b's 8ef46d8770): game +6,842, cn +7,248, entry +1,676, Gallery +217, of which 270's
  //   own growth over 269 is game +5,200, cn +5,651, entry +886, Gallery +273, so round eight's clusters add about
  //   +1,642 / +1,597 / +790 B on game / cn / entry and nothing on the Gallery (brotli does not add across shared
  //   chunks). By boot chunk, raw over H8's build (vite's report): main +4,840 (270's boot wiring; round eight's couch
  //   opener, phone pause rule and visibility rule in main), vehicleActions +9,650 (270's three Air Support leaves; the
  //   couch session owner and the body-class reasons, which joined it to hold the requests), matchRuleset +2,100 and the
  //   en-US catalog +1,950 (270's mode), crewVoice +470 and gameModeCatalog +350 (270), stateCore +150 (the couch session's
  //   reads), phonePause +70 (H8's battleTimeChoices chunk, which phonePause.ts joined). Requests held at 127 / 128 / 73
  //   / 8 / 12 / 7 (pad 14): couchSeats and bodyFlags, alone two more game and cn boot requests, ride vehicleActions
  //   (vite.config.ts). Home 28,923, docs 37,228 and 404 18,739 measure within their slack over the held pins.
  // 2026-11-11 (integrator 271, the single end re-pin at integ/271's build 8612b0e164 + CSP; the owner's skip-all-tests
  //   ruling, 272 folded in): game +26,562 B brotli, cn +26,573 B, Gallery +25,085 B; requests +8 on game, cn and Gallery
  //   (new boot leaves from the folded 272 lanes and improve plans, not folded under the ruling: attribution and the fold
  //   are owed post-deploy); the entry +229 B. Home +148 B, docs +150 B and 404 +57 B re-pinned at their measures.
  // 2026-11-11 (integrator 271.1, the patch re-pin at integ/271.1's build 580fb07d28): game +858 B brotli, cn +1,547 B
  //   (the loading stills' rotation on the boot path, the Couch/Watch/Deploy button family, the camo sheet layout and
  //   the Air Support plate; cn also their zh strings); requests and the entry held. The other rows inside their slack.
  // 2026-11-11 (integrator 271.2, the Air Support fix's re-pin at integ/271.2's build): game +1,501 B brotli, cn +1,483 B;
  //   requests +4 on both (air-support-runs-272's strike order, strike runs and strike call modules on the boot path, not
  //   folded under the live-fix ruling: the fold is owed with 271's); the entry +172 B.
  // 2026-11-12 (integrator 272, the single end re-pin at integ/272's release build 465cd86573): game +10,800 B brotli,
  //   cn +10,962 B, Gallery +5,215 B; requests game and cn +7, Gallery +2. The new boot chunks against live 271.2:
  //   chaseStart (couch-panes-272 0669e4783f), fireCycleFloor (m163-rotary-272 db35064ff4; on the Gallery too), and five
  //   modules already on main that now split into shared chunks of their own under 272's new importers: weaponHitKind
  //   (fire-fx-debounce-272's audio cadence), lodDistanceScale (also on the Gallery), aerialVision, droneMotion and
  //   battleHudFrameRuntime. The entry -9,572 B (those modules left it), pinned at its measure.
  game: { brotliBytes: 1250707, requests: 146, entryBrotliBytes: 250056 },
  cn: { brotliBytes: 1296776, requests: 147, entryBrotliBytes: 250056 },
  gallery: { brotliBytes: 790344, requests: 83 },
  home: { brotliBytes: 28933, requests: 8 },
  docs: { brotliBytes: 37250, requests: 12 },
  notFound: { brotliBytes: 18734, requests: 7 },
});
/** Byte noise between two builds of the same code (chunk hashes in import specifiers); requests have none. */
const BUNDLE_SLACK = { brotliBytes: 160, entryBrotliBytes: 96, requests: 0 };

const SLACK = { lcpMs: 150, cls: 0.005, tbtMs: 50, inpMs: 24, shellMs: 24, contentMs: 50, inpP98Ms: 24, longTaskMs: 30,
  droppedFrames: 2, consoleErrors: 0, consoleWarnings: 0, heapGrowthMb: 2, nodeGrowth: 50, canvasViolations: 0 };

/** The screen a recorded press or step belongs to. */
export function surfaceOf(kind) {
  const canvas = /^canvas:([^:]+)/.exec(String(kind));
  if (canvas) return canvas[1];
  const id = String(kind).replace(/^(sweep|pick|memory):/, '$1-');
  if (/^(home|cn-home)/.test(id)) return 'home';
  if (/^(docs|manual|home-to-docs|gallery-to-docs)/.test(id)) return 'docs';
  if (id === 'not-found') return '404';
  if (/^(gallery|home-to-gallery)/.test(id)) return 'gallery';
  if (/^(studio|home-to-studio)/.test(id)) return 'studio';
  if (/^(settings|garage-settings)/.test(id)) return 'settings';
  if (/^(deploy-launch|garage-to-battle)/.test(id)) return 'battle-load';
  if (/^(deploy|garage-battle-setup|battle-setup)/.test(id)) return 'deploy';
  if (/^record/.test(id)) return 'record';
  if (/^(garage-private-lobby|lobby)/.test(id)) return 'rooms';
  if (/^(end-to-garage|battle-end)/.test(id)) return 'battle-end';
  if (/^watch/.test(id)) return 'watch';
  if (/^battle-steady/.test(id)) return 'battle-hud';
  if (/^(game-boot|gate-to-garage)/.test(id)) return 'boot';
  if (/^memory-/.test(id)) return id.slice('memory-'.length);
  if (/^(recover|context-restore|chunk-)/.test(id)) return 'recovery';
  return 'garage';
}

/** The lane a surface's misses go to (UI-LOCKDOWN Owners). */
export function ownerOf(surface) {
  if (['home', 'docs', '404', 'deploy', 'settings', 'record', 'rooms', 'boot'].includes(surface)) return 'premiere-site';
  if (['gallery', 'studio', 'garage'].includes(surface)) return 'premiere-gallery-studio';
  if (['battle-load', 'battle-end', 'watch'].includes(surface)) return 'premiere-battle';
  if (surface === 'battle-hud') return 'perf';
  return 'nav-perf';
}

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};
const worst = (values) => (values.length ? Math.max(...values) : null);
const rigOf = (file) => (/\.phone[.]/.test(file) ? 'phone' : 'desktop');
const listJson = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('programs.') && !f.startsWith('boot.')) : []);

/** Every measurable value by class/surface/rig/metric, from nav-timeline and click-timeline run directories. */
export function collect({ nav = [], click = [], bundle = null } = {}) {
  const values = new Map();
  const add = (cls, surface, rig, metric, value) => {
    if (value == null || Number.isNaN(value)) return;
    const key = `${cls}/${surface}/${rig}/${metric}`;
    if (!values.has(key)) values.set(key, { cls, surface, rig, metric, values: [] });
    values.get(key).values.push(value);
  };
  // a built dist's routes (tools/bundle-budget.mjs measureDist*: { route: { brotli, requests, entryBrotli } })
  for (const [route, page] of Object.entries(bundle ?? {})) {
    add('bundle', route, 'any', 'brotliBytes', page.brotli);
    add('bundle', route, 'any', 'requests', page.requests);
    // only the game documents start with an application entry (a public page's first chunk is arbitrary: bundle-budget.mjs)
    if (page.entryBrotli != null && (route === 'game' || route === 'cn')) add('bundle', route, 'any', 'entryBrotliBytes', page.entryBrotli);
  }
  for (const dir of nav) {
    for (const file of listJson(dir)) {
      const step = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (step.error || !step.step) continue;
      const rig = rigOf(file), surface = surfaceOf(step.step);
      // runs before 2026-10-25 carry no journey group: a public page by its surface
      const group = step.group ?? (['home', 'docs', '404'].includes(surface) || /^(home-to-gallery|gallery-dossier)$/.test(step.step) ? 'public' : 'game');
      if (Array.isArray(step.consoleErrors)) add('everywhere', surface, rig, 'consoleErrors', step.consoleErrors.length);
      if (Array.isArray(step.consoleWarnings)) add('everywhere', surface, rig, 'consoleWarnings', step.consoleWarnings.length);
      if (group === 'public') {
        add('public', surface, rig, 'lcpMs', step.lcp);
        add('public', surface, rig, 'cls', step.cls);
        add('public', surface, rig, 'tbtMs', step.tbt);
        add('public', surface, rig, 'inpMs', step.inp);
      } else if (group === 'game') {
        add('app', surface, rig, 'contentMs', step.content == null ? null : Math.max(step.content, step.fcp ?? 0));
        add('app', surface, rig, 'inpP98Ms', step.inp);
        add('everywhere', surface, rig, 'cls', step.cls);
      }
    }
  }
  for (const dir of click) {
    for (const file of listJson(dir)) {
      const run = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (!Array.isArray(run.samples)) continue;
      const rig = run.profile === 'phone' || rigOf(file) === 'phone' ? 'phone' : 'desktop';
      for (const sample of run.samples) {
        const surface = surfaceOf(sample.kind);
        // (UI-LOCKDOWN A) the canvas rule: each check's violations, from canvasProbe and from --canvas presses
        const canvasResult = sample.canvas ?? sample.census?.canvas;
        if (canvasResult && !canvasResult.error) add('everywhere', surface, rig, 'canvasViolations', canvasResult.violations?.length ?? 0);
        if (/^canvas:/.test(sample.kind)) continue;
        if (/^memory:/.test(sample.kind)) {
          if (sample.error) continue;
          add('everywhere', surface, rig, 'heapGrowthMb', Number((sample.heapDeltaBytes / 1048576).toFixed(2)));
          add('everywhere', surface, rig, 'nodeGrowth', sample.nodeDelta);
          continue;
        }
        if (sample.error) continue;
        const census = sample.census;
        if (census && !census.error) {
          add('everywhere', surface, rig, 'consoleErrors', census.consoleErrors?.length ?? 0);
          add('everywhere', surface, rig, 'consoleWarnings', census.consoleWarnings ?? 0);
        }
        // the recovery probes and the idle windows score their console only; a battle's live frames are the perf lane's
        if (surface === 'recovery' || sample.duration == null || /^battle-steady|^garage-idle/.test(sample.kind)) continue;
        add('app', surface, rig, 'inpP98Ms', Math.round(sample.duration));
        if (sample.shownMs != null) add('app', surface, rig, 'shellMs', sample.shownMs);
        add('app', surface, rig, 'contentMs', sample.doneMs ?? sample.shownMs);
        if (census && !census.error) {
          add('app', surface, rig, 'longTaskMs', census.worstLong ?? 0);
          add('app', surface, rig, 'droppedFrames', census.droppedFrames ?? census.frames33 ?? 0);
        }
      }
    }
  }
  return values;
}

const budgetFor = (cls, metric, rig, surface) => {
  if (cls === 'bundle') return BUNDLE_BUDGETS[surface]?.[metric] ?? null;
  const value = BUDGETS[cls === 'everywhere' && metric === 'cls' ? 'public' : cls]?.[metric];
  return value != null && typeof value === 'object' ? value[rig] : value;
};

/** Scored rows: { key, cls, surface, rig, metric, value, budget, pass, samples, owner }, misses first. */
export function evaluate(values) {
  const rows = [];
  for (const [key, entry] of values) {
    const budget = budgetFor(entry.cls, entry.metric, entry.rig, entry.surface);
    if (budget == null) continue;
    const value = entry.metric === 'inpP98Ms' ? quantile(entry.values, 0.98) : worst(entry.values);
    rows.push({ key, cls: entry.cls, surface: entry.surface, rig: entry.rig, metric: entry.metric, value, budget,
      // canvas rule misses go to the canvas-ui migration (UI-LOCKDOWN A), not the surface's lane
      pass: value <= budget + (entry.cls === 'bundle' ? BUNDLE_SLACK[entry.metric] ?? 0 : 0), samples: entry.values.length,
      // canvas misses go to the canvas-ui migration (UI-LOCKDOWN A); bundle growth to the integrator, who splits it by head
      owner: entry.metric === 'canvasViolations' ? 'canvas-ui' : entry.cls === 'bundle' ? 'integrator' : ownerOf(entry.surface) });
  }
  return rows.sort((a, b) => Number(a.pass) - Number(b.pass) || a.key.localeCompare(b.key));
}

/** --check: misses the known list lacks, and listed misses past their recorded value; and listed ones now passing. */
export function compare(rows, known = {}) {
  const regressions = [], fixed = [];
  for (const row of rows) {
    const was = known[row.key];
    if (row.pass) { if (was) fixed.push(row); continue; }
    if (!was) { regressions.push({ ...row, why: 'new miss' }); continue; }
    // bundle growth holds only under a named ruling, and only up to the bytes that ruling recorded
    if (row.cls === 'bundle') {
      if (typeof was.ruling !== 'string' || !was.ruling.trim()) regressions.push({ ...row, why: 'growth without a named ruling' });
      else if (row.value > was.value + (BUNDLE_SLACK[row.metric] ?? 0)) regressions.push({ ...row, why: `past its ruling's ${was.value}` });
      continue;
    }
    const slack = SLACK[row.metric] ?? 0;
    if (row.value > was.value * 1.25 + slack) regressions.push({ ...row, why: `worse than ${was.value}` });
  }
  return { regressions, fixed };
}

function table(rows) {
  const lines = ['| surface | class | rig | metric | value | budget | samples | owner |', '|---|---|---|---|---:|---:|---:|---|'];
  for (const r of rows) lines.push(`| ${r.pass ? '' : '**MISS** '}${r.surface} | ${r.cls} | ${r.rig} | ${r.metric} | ${r.value} | ${r.budget} | ${r.samples} | ${r.owner} |`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const many = (name) => argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => resolve(a.slice(name.length + 3)));
  const [dist] = many('dist');
  const bundle = dist ? (await import('./bundle-budget.mjs').then((m) => m.measureDistAsync(dist))).measures : null;
  const rows = evaluate(collect({ nav: many('nav'), click: many('click'), bundle }));
  if (!rows.length) { console.error('frontend-budget: nothing recorded (pass --nav=<run>/<label>, --click=<run>/<label> and/or --dist=<dir>)'); process.exit(2); }
  const misses = rows.filter((r) => !r.pass);
  console.log(table(rows));
  console.log(`\nfrontend-budget: ${rows.length - misses.length} within budget, ${misses.length} misses`
    + ` (${[...new Set(misses.map((r) => r.owner))].join(', ') || 'none'})`);
  if (argv.includes('--write')) {
    const kept = existsSync(BUDGET_PATH) ? JSON.parse(readFileSync(BUDGET_PATH, 'utf8')).known ?? {} : {};
    // bundle rows are never written here: each needs its ruling by hand (the ones already ruled are kept)
    const known = Object.fromEntries([...misses.filter((r) => r.cls !== 'bundle').map((r) => [r.key, { value: r.value, owner: r.owner }]),
      ...Object.entries(kept).filter(([key, row]) => key.startsWith('bundle/') && row.ruling)]);
    writeFileSync(BUDGET_PATH, `${JSON.stringify({ note: 'Known frontend budget misses (tools/frontend-budget.mjs --write); each names its owning lane. Remove a row when its surface passes.', known }, null, 1)}\n`);
    console.log(`frontend-budget: wrote ${misses.length} known misses to ${basename(BUDGET_PATH)}`);
  } else if (argv.includes('--check')) {
    const known = existsSync(BUDGET_PATH) ? JSON.parse(readFileSync(BUDGET_PATH, 'utf8')).known ?? {} : {};
    const { regressions, fixed } = compare(rows, known);
    for (const r of fixed) console.log(`  now within budget: ${r.key} (${r.value} <= ${r.budget}); remove its known row`);
    for (const r of regressions) console.log(`  REGRESSION ${r.key}: ${r.value} (budget ${r.budget}; ${r.why}) -> ${r.owner}`);
    console.log(`frontend-budget --check: ${regressions.length ? `FAIL (${regressions.length})` : 'PASS'}`);
    if (regressions.length) process.exitCode = 1;
  }
}
