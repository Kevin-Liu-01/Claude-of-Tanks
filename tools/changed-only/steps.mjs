// The changed-only step table: the single declaration the resolver (tools/changed-ids.mjs), the chain
// (tools/tank-regen-changed.mjs), the parity check and the selftests read. First-party tooling: Kevin B. Liu.
//
// A step is one fleet generator. Each declares its tool, its canonical flags (part of its key: a flag edit marks every
// id), how to run it on the whole fleet, on some ids and as a check, the per-id tables it writes and the files it writes
// whole. Nothing here is inferred at run time except the import graph; a tool's dynamic reads (directory reads, child
// processes, computed imports) must be declared below and pinned to the exact call sites that make them, or the
// resolver runs that step on every id.

/** The fleet's entry modules. Tools reach every builder through these. */
export const FLEET_ENTRIES = Object.freeze([
  'src/vehicles/tankFactory.ts',
  'src/vehicles/fleetFactory.ts',
  'src/vehicles/specs.ts',
  'src/vehicles/fleetRegistration.ts',
]);

/** Files whose imports of a group entry module register that group's builders (eager and demand-loaded). Any other
 *  import of a group module pulls it into the shared core, so it marks every id. */
export const LOADER_FILES = Object.freeze([
  'src/vehicles/tankFactory.ts',
  'src/vehicles/fleetFactory.ts',
  'src/vehicles/profiledProcedurals.ts',
]);

/** fleetFactory.ts holds GROUP_LOADERS: group name -> the modules that build that group's ids. */
export const GROUP_LOADERS_FILE = 'src/vehicles/fleetFactory.ts';

/**
 * Per-id tables. `module` tables are read by importing the file(s) and taking `exportName`; `json` tables by parsing
 * the file and following `path`; `jsonRow` tables hold one id's row per file, the file named <id>.json (266: the tank
 * asset manifest, tools/tank-assets-store.mjs). A row is the stable JSON of one id's entry ("absent" when it has none).
 */
export const TABLES = Object.freeze({
  auxiliaryInventory: { kind: 'module', files: ['src/vehicles/auxiliaryInventory.generated.ts'], exportName: 'AUXILIARY_INVENTORY' },
  auxiliaryRoofGuns: { kind: 'module', files: ['src/vehicles/auxiliaryRoofGuns.generated.ts'], exportName: 'AUXILIARY_ROOF_GUNS' },
  inertDrawnWeapons: { kind: 'module', files: ['src/vehicles/inertDrawnWeapons.generated.ts'], exportName: 'INERT_DRAWN_WEAPONS' },
  garageAuxiliarySummary: { kind: 'module', files: ['src/ui/garageAuxiliarySummary.generated.ts'], exportName: 'GARAGE_AUXILIARY_SUMMARY' },
  interiorFills: { kind: 'module', files: ['src/vehicles/interiorFillGroups/*.generated.ts'], exportName: 'INTERIOR_FILLS' },
  movingClearanceAir: { kind: 'json', files: ['docs/geometry-gate/moving-clearance-air.json'], path: ['tanks'] },
  missionAttachmentSeats: { kind: 'module', files: ['src/sim/missionAttachmentSeats.generated.ts'], exportName: 'MISSION_ATTACHMENT_SEATS' },
  missionDockSeats: { kind: 'module', files: ['src/sim/missionDockSeats.generated.ts'], exportName: 'MISSION_DOCK_SEATS' },
  spareTrackLedger: { kind: 'json', files: ['docs/geometry-gate/spare-track.json'], path: ['rows'] },
  spareTrackSeatPlan: { kind: 'module', files: ['src/vehicles/spareTrackSeatPlan.ts'], exportName: 'SPARE_TRACK_SEAT_PLAN' },
  combatAnatomy: { kind: 'module', files: ['src/vehicles/combatAnatomyGroups/*.generated.ts'], exportName: 'COMBAT_ANATOMY_CALIBRATIONS' },
  markingSeats: { kind: 'module', files: ['src/vehicles/vehicleMarkingSeatGroups/*.generated.ts'], exportName: 'VEHICLE_MARKING_SEATS' },
  geometryLedger: { kind: 'json', files: ['docs/references/fleet-geometry-ledger.json'], path: ['tanks'] },
  presentationAnchors: { kind: 'module', files: ['src/vehicles/presentationAnchors.generated.ts'], exportName: 'TANK_PRESENTATION_ANCHORS' },
  presentationProjections: { kind: 'module', files: ['src/vehicles/presentationAnchors.generated.ts'], exportName: 'TANK_PRESENTATION_PROJECTIONS' },
  tankAssets: { kind: 'jsonRow', files: ['public/icons/tank-assets/tanks/*.json'] },
  gunJunction: { kind: 'json', files: ['docs/geometry-gate/gun-junction.json'], path: ['tanks'] },
  // 230: the combat articulation frames measured from each builder's rig (finalizeCombatAnatomy applies a row).
  combatGunRigs: { kind: 'module', files: ['src/vehicles/combatGunRigs.generated.ts'], exportName: 'COMBAT_GUN_RIGS' },
});

/** Index and loader maps that import every shard of a table. Their bytes depend only on which shards exist, so they
 *  count as shared core: a change marks every id (and the roster rule already covers a new or retired group). */
export const AGGREGATES = Object.freeze([
  'src/vehicles/combatAnatomyCalibrations.ts',
  'src/vehicles/combatAnatomyLoaders.generated.ts',
  'src/vehicles/vehicleMarkingSeats.generated.ts',
  'src/vehicles/vehicleMarkingSeatLoaders.generated.ts',
  'src/vehicles/interiorFillLoaders.generated.ts',
]);

/**
 * Dynamic reads, per file: what the file's directory reads, child processes and computed imports touch beyond its
 * static imports, and the pin (sha256/16 of the normalised call sites, tools/changed-only/graph.mjs dynamicSites) the
 * declaration was reviewed against. A changed call site breaks the pin, and every step that reaches the file runs on
 * every id until the declaration is reviewed and re-pinned (tools/changed-only/fleet-partition.selftest.mjs prints the
 * new pin). `reads` globs are hashed into the reaching step's key. `modeOnly` names paths the file reads only in modes the
 * chain never runs (a --check audit): the edge to them is dropped. `covered` names paths the file reads that the fleet keys
 * already cover (with the reason beside it): the edge to them is dropped from the step's own key. `verdictOnly` globs
 * name files the tool reads in the chain's mode whose contents reach only its verdicts (printed problems), never a
 * written row: not keyed; the runtime read trace (tools/changed-only/trace-check.mjs) accepts them. `namesOnly` globs
 * name paths the file only names, never reads (route strings, URLs): the edge to them is dropped (266).
 */
export const DECLARED_DYNAMIC = Object.freeze({
  'tools/vehicle-controls-inventory.mjs': {
    pin: 'aa9097b373101a7b',
    reads: [],
    note: 'reads its own four generated files (the --ids merge and --check)',
  },
  'tools/barak-rear-bay-fill-policy.mjs': {
    pin: '4fd2707a1d932bbd',
    reads: [],
    note: 'reads BARAK_SOURCE_CONFIGURATION.source.path, the literal public/models/community-candidates/merkava4_barak_x_source.glb in tools/barak-source-openings.mjs, which the fills key already holds as a named input (and checks its sha256)',
  },
  'tools/moving-clearance-air.mjs': {
    pin: '8bfcaa7c14405742',
    reads: [],
    note: 'reads and merges the clearance record it is given: the fills step\'s own docs/geometry-gate/moving-clearance-air.json (or a part\'s scratch copy)',
  },
  'tools/gen-mission-attachment-seats.mjs': {
    pin: '4db346525b73f24e',
    reads: [],
    note: 'reads a --hints file only when the flag is passed; the chain refuses --hints in step flags (its contents would not be keyed)',
  },
  'tools/fleet-geometry-digest.mjs': {
    pin: 'e82a768b0c8ebc28',
    reads: [],
    note: 'reads the ledger step\'s own docs/references/fleet-geometry-ledger.json (partial updates, comparisons)',
  },
  'src/vehicles/materialPainterWorker.ts': {
    pin: '02080ee9df202934',
    reads: [],
    note: 'a page worker: fetches the painter font, public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2, inside the GPU steps\' public/** reads',
  },
  'tools/gen-interior-fills.mjs': {
    pin: '7ad1c72d6da8aede',
    reads: [],
    note: 'readdirSync/import of its own interiorFillGroups shards (the --ids merge and stale-family moves) and of the chain\'s own --merge-from parts (records this step measured with the same flags); git rev-parse/show and the data: import run only with --uniform-from, which the chain never passes',
  },
  'tools/mission-dock-seats.mjs': {
    pin: '216ec533c50b350d',
    reads: [],
    note: 'the computed import and the reads run only when the file is executed as a CLI (they read the seats generator\'s own outputs); the generator imports it as a library',
  },
  'tools/spare-track-placement-check.mjs': {
    // 229 re-pin: the new site is --rekey's read of the ledger (the step's own output); the chain never runs --rekey.
    pin: '28903754d573a67d',
    importHelper: 'imp',
    reads: [],
    // The run classifier reads the source lines of the stack frames that built each id's parts (src/<frame file>): code
    // the id's own build ran, so already in its builder key (core and its spec chain's groups). The lint reads
    // src/vehicles/profiles/*.ts and changes only --check/--gate verdicts, never an --update output.
    covered: ['src', 'src/vehicles', 'src/vehicles/profiles'],
    // What the lint reads (every profile, sourceLint): its findings go to the problems list only, never to the ledger
    // rows or the seat plan (tools/changed-only/trace-check.mjs accepts these reads as verdict-only).
    verdictOnly: ['src/vehicles/profiles/*.ts'],
    note: 'imp(<literal>) imports repository modules (followed as edges); node_modules imports are covered by the lockfiles; src source-line reads are covered (see covered)',
  },
  'tools/gen-combat-anatomy.mjs': {
    pin: 'd1f869f3a73b1713',
    reads: [],
    note: 'readdirSync and reads of its own combatAnatomyGroups directory and index (stale shards, --check)',
  },
  'tools/gen-vehicle-marking-seats.mjs': {
    pin: '435bca1cb685e50d',
    reads: [],
    note: 'readdirSync and reads of its own vehicleMarkingSeatGroups directory and index (stale shards, --check)',
  },
  'tools/presentation-centering.mjs': {
    // 229 re-pin (R4c): the Vite server comes from toolServerOptions (127.0.0.1, strictPort false); the page origin
    // from boundOrigin and its first load from loadReadyPage (tools/tool-page-load.mjs): where it serves, never what.
    // 266 re-pin: --sync-assets reads the manifest through tools/tank-assets-store.mjs instead of one JSON file.
    pin: 'd2a108825f11dc4e',
    reads: [],
    // public/icons is read only by --check (the exported-icon audit) and --sync-assets; the chain runs --update, which
    // renders live builds and writes the anchors file alone.
    modeOnly: ['public/icons'],
    note: 'a Vite dev server (configFile false) over the repository root serves tools/icons-page.html to Chrome; what the page can fetch is the step\'s declared reads (public/**); file reads are its own anchors file, and public/icons only under --check/--sync-assets (the chain runs --update)',
  },
  'tools/genIcons.mjs': {
    // 229 re-pin (R4c): the Vite server comes from toolServerOptions (127.0.0.1, strictPort false); the page origin
    // from boundOrigin and its first load from loadReadyPage (tools/tool-page-load.mjs): where it serves, never what.
    // 264 re-pin: 253 (bfb7e709e2) hashes the technical diagrams' label sidecar it has just written (technicalLabelsRecord):
    // its own output in outDir, like the images.
    // 266 re-pin: the manifest is a row file per tank, read and written through tools/tank-assets-store.mjs (declared
    // below); genIcons' own remaining reads are the images and sidecars it has just written.
    pin: '943e75f896468bd1',
    reads: [],
    note: 'a Vite dev server (configFile false) over the repository root serves tools/icons-page.html to Chrome; what the page can fetch is the step\'s declared reads (public/**); file reads are its own manifest (through tools/tank-assets-store.mjs), images and technical-label sidecars',
  },
  'tools/tank-assets-store.mjs': {
    // 266: the per-tank asset manifest. It names no repository path: every read and listing is under the icons
    // directory its caller passes, which is genIcons' own output in the icons step and presentation-centering's
    // --sync-assets input (a mode the chain never runs).
    pin: '011ee8c31cb47e59',
    reads: [],
    note: 'lists and reads <icons>/tank-assets/ (index.json, tanks/<id>.json) for the caller\'s icons directory: the icons step\'s own output; centering reaches it only under --sync-assets',
  },
  // 229: genIcons passes each published picture through the optional local master filter (owner attribution, 228).
  'tools/media-r5/master-filter.mjs': {
    pin: '9cc38542568f79c4',
    reads: [],
    // Not keyed: the filter is a machine-local executable (COT_MASTER_FILTER, read by name, or the untracked
    // shots/media-r5/master-filter) that rewrites the published images. Their bytes are the icons step's GPU output,
    // which is never an input key (rendered bytes differ across GPUs and drivers); keying a file most worktrees lack
    // would mark every id in every lane that has none (229, critic r2).
    note: 'an optional machine-local post-process of the published images (GPU output bytes, never keyed)',
  },
  // 229: the gun-line census (the gunLines step).
  'tools/gun-junction-census.mjs': {
    pin: '63939167b6ebdff6',
    reads: [],
    // the fleet ledger is read at each measured id's row: keyed per id by the step's rowReads, never whole
    covered: ['docs/references/fleet-geometry-ledger.json'],
    note: 'reads its own ledger (the step\'s output, to keep the other ids\' rows) and each measured id\'s fleet-ledger row, keyed per id by the step\'s rowReads (geometryLedger)',
  },
  // 229 (guards): gen-combat-anatomy checks each measured tank against the sim-floor ledger.
  'tools/anatomy-floor-ledger.mjs': {
    pin: '6d4a299856dae1bf',
    reads: [],
    // the floor ledger decides whether a regen passes (a drift exits 3 after the rows are written), never what the
    // generated anatomy rows hold; its accepts carry their own reason trail
    verdictOnly: ['docs/geometry-gate/sim-floors.json'],
    note: 'reads the anatomy step\'s own outputs (src/vehicles/combatAnatomyCalibrations.ts and its combatAnatomyGroups files, as data) and the sim-floor ledger (verdict only); writes the ledger\'s rows for new and retired tanks',
  },
  'tools/fleet-geometry-ledger.mjs': {
    pin: '1c72be85b54a8dbf',
    reads: [],
    note: 'spawns itself (--worker) for --jobs shards; the shards run this same closure',
  },
  // 264: the browser steps (centering, icons) launch through the guarded launcher (eee1c02179, 259) and queue on the
  // machine's capture lock; neither reads a repository input.
  'tools/browser-launch.mjs': {
    pin: '87d9d82caf048471',
    reads: [],
    note: 'runs ps over the launched browser\'s process tree for its memory watchdog: process state, never a file a step keys',
  },
  'tools/capture-lock.mjs': {
    pin: 'be03f207d16f52a7',
    reads: [],
    note: 'reads and writes the machine-wide /tmp/cot-shots.lock and queue (owner, tickets, logs) and runs ps on their holders: scheduling only, never what a step writes',
  },
  // World steps (WORLD_STEPS).
  'tools/capture-world-collision-manifests.mjs': {
    pin: '5ab42aa148cd82b8',
    reads: [],
    note: 'agent-browser runs only in the session capture mode (the chain runs --node); the reads are its own outputs: the index (a variant run keeps the other maps\' entries) and committed shards (--check)',
  },
  'tools/worldCollisionManifestFiles.mjs': {
    pin: '1ff7a5e33e9ec5ca',
    reads: [],
    note: 'reads its own outputs: the index and the sibling shards\' checksums before a partial capture rewrites the index',
  },
  'tools/headlessWorldCollision.mjs': {
    pin: '583b288273f86e49',
    reads: ['src/world/props-models.bin.gz'],
    note: 'serves the file: URL the props model store fetches (src/world/props-models.bin.gz) from disk',
  },
  'src/world/propsModelStore.ts': {
    pin: '02080ee9df202934',
    reads: ['src/world/props-models.bin.gz'],
    note: 'fetches new URL(\'./props-models.bin.gz\', import.meta.url)',
  },
  'tools/map-probe-runtime.mjs': {
    pin: 'ae2caa4c871631f4',
    reads: [],
    // The world steps import it for isMainModule (wreck-bake-plan) and behind --headless (collision); neither runs its
    // dev server, browser or git call.
    modeOnly: ['index.html'],
    note: 'the Vite server, Chrome and git rev-parse run only in withMapProbeSession (--headless captures); the chain runs --node',
  },
  // 266: the public route table names every page (index.html, 404.html, home.html, ...) as a route string. It has no file
  // access and reads none of them, yet the mention put the pages into the wreckPlan, collision, trenches, centering and
  // icons keys, so a document-head edit re-ran them on every map and id. A step that serves or reads a page names it in
  // its own closure, which stays keyed.
  'src/ui/localeRouting.ts': {
    pin: 'e3b0c44298fc1c14',
    reads: [],
    namesOnly: ['*.html'],
    note: 'route strings for the public pages; no file access, so it reads none of them',
  },
  'tools/viteI18nStudioCatalog.ts': {
    pin: '525a21e40aa0d260',
    reads: [],
    // 230 (foliage-shadow-sites-228): map-probe-runtime's probe server loads this Vite plugin; the world steps import
    // map-probe-runtime only for isMainModule and --headless, and run no dev server (its modeOnly above).
    note: 'a Vite plugin: reads src/ui/i18nCatalog.<locale>.json only when a dev server serves virtual:cot-i18n-studio/<locale>; the chain runs no dev server',
  },
  // 264: battle-spikes-253 (85d330ad12, 254) reads a sourced texture's file back from the HTTP cache to decode it off the
  // main thread; the world steps reach the module through the map graph.
  'src/world/sourcedTextureCompositionClient.ts': {
    pin: 'be3b9096d168902a',
    reads: [],
    note: 'browser only: fetches an <img> the page has already loaded (force-cache) to decode its bitmap; the Node world steps load no source image, and texture pixels never reach a wreck plan row or a collision shard',
  },
  'tools/wreck-bake-plan.mjs': {
    pin: '8fbacf8b8059103e',
    reads: [],
    note: 'spawns itself (--record) per tier: the children run this same closure; reads its own output (the plan) to keep the other maps\' rows and for --check',
  },
});

/** Environment variables that only bound a wait or a retry, never what a tool writes: left out of every key (any other
 *  variable a closure file reads is keyed with its value). */
export const SCHEDULING_ENV = Object.freeze({
  COT_NAV_TIMEOUT_MS: 'presentation-centering: how long the icons page may take to navigate',
  COT_READY_TIMEOUT_MS: 'presentation-centering: how long the icons page may take to report ready',
  COT_NAV_RETRIES: 'presentation-centering: how often a page load that timed out is retried',
});

/**
 * Tool-side modules that read a per-id table only at the id they are handed. A step that reaches a table through one
 * of these (and no other edge) keys that table per id instead of whole. `pin` is sha256/16 of the module's sorted
 * trimmed source lines naming the table's export (tools/changed-only/graph.mjs accessorPin): a new use, such as an
 * enumeration, breaks it and the table counts whole again until reviewed.
 */
export const PER_ID_ACCESSORS = Object.freeze({
  'src/vehicles/auxiliaryInventory.ts': {
    tables: ['auxiliaryInventory'], exportName: 'AUXILIARY_INVENTORY', pin: '60ffc036ad5f9c5a',
    note: 'auxiliaryCapabilities(spec) returns AUXILIARY_INVENTORY[spec.id]',
  },
  'src/vehicles/ghillieSuit.ts': {
    tables: ['missionDockSeats'], exportName: 'MISSION_DOCK_SEATS', pin: 'b290c053cb31034c',
    note: 'the cradle keep-out reads MISSION_DOCK_SEATS[specId] of the suit being built',
  },
});

/**
 * The fleet balance pass (266, Main: a balance merge re-keyed every generator step on every id through the shared core,
 * though ~19 ids' outputs moved). fleetRegistration.ts applies it to the registered specs and nothing else imports it,
 * so what it does reaches a tool only through those specs. It leaves the core, and each id's registered spec is keyed as
 * two per-id rows (tools/changed-only/rows-child.mjs): SPEC_COMBAT holds the `combat` leaves, SPEC_REST everything else.
 * Every step keys SPEC_REST; a step whose outputs follow the combat leaves keys SPEC_COMBAT too (its `rowReads`). A lever
 * on one id's armour, hp, mobility or gun stats marks that id on those steps alone; a lever on any other field marks it
 * on every step.
 *   entries   the balance modules; their closure beyond the core is checked like any executed fleet module
 *   importers the files whose imports of an entry apply it to the registry (any other import keeps it in the core)
 *   tokens    the importers' lines naming one are pinned (world.mjs tokenPin): a new use of the pass
 *             breaks the pin, and the pass counts as core until the use is reviewed and re-pinned
 *   combat    leaf paths of a registered spec (`[]`: every item of an array): what the levers set (measured, every field
 *             the pass moved on the 266 fleet). tools/changed-only/trace-check.mjs --combat moves them all and fails a step
 *             whose rows follow without SPEC_COMBAT in its rowReads.
 */
export const SPEC_COMBAT = 'specCombat';
export const SPEC_REST = 'specRest';
export const BALANCE = Object.freeze({
  entries: Object.freeze(['src/vehicles/fleetBalancePass.ts']),
  importers: Object.freeze({
    'src/vehicles/fleetRegistration.ts': { pin: '09848b33916b3875', note: 'applies the four passes to TANK_SPECS, once each, at registration' },
  }),
  tokens: Object.freeze(['fleetBalancePass', 'applyFleetBalancePass', 'applyModernEraFold', 'applyShownTierFloors', 'applySameTierFairness']),
  combat: Object.freeze([
    'hp', 'enginePowerHp', 'topSpeedKmh', 'reverseSpeedKmh', 'hullTraverseDegS', 'turretTraverseDegS',
    'gun.reloadS', 'gun.aimTimeS', 'gun.baseAccuracy', 'gun.autoloader.intraClipS', 'gun.autoloader.fullReloadS',
    'gun.shells[].name', 'gun.shells[].count', 'gun.shells[].dmg', 'gun.shells[].velocityMps', 'gun.shells[].reloadS',
    'gun.shells[].pen100Mm', 'gun.shells[].pen1000Mm', 'gun.shells[].pen2000Mm',
    'armor.hullPlates[].keMm', 'armor.hullPlates[].ceMm', 'armor.turretPlates[].keMm', 'armor.turretPlates[].ceMm',
  ]),
});

const ids = (list) => `--ids=${list.join(',')}`;

/**
 * The fleet steps, in chain order. Seats read the fills and the roof guns (controls), and missionDockSeats feeds the
 * spare-track dock keep-out, so the CPU order is controls, fills, seats, spare-track, anatomy, marking; the ledger
 * measures the settled builds; the GPU steps follow.
 *   flags   canonical flags (part of the step key)
 *   full    extra args for a whole-fleet run; scoped(list) for an id run; check/checkScoped for verification (run by
 *           checkTool when the generator has no check mode of its own)
 *   outputs per-id tables written; files: other files written whole (aggregates and reports are not keyed)
 *   gb      memory to ask headroom for; timeoutS per run (scaled by id count where noted); parts: the chain splits a
 *           run of 8 or more ids into --jobs parallel --out-dir parts that the tool merges (--merge-from)
 */
export const STEPS = Object.freeze([
  {
    name: 'controls', device: 'cpu', tool: 'tools/vehicle-controls-inventory.mjs',
    flags: [], full: [], scoped: (list) => [ids(list)],
    check: ['--check'], checkScoped: (list) => ['--check', ids(list)],
    outputs: ['auxiliaryInventory', 'auxiliaryRoofGuns', 'inertDrawnWeapons', 'garageAuxiliarySummary'],
    files: [], gb: 6, timeoutS: 3600, perIdS: 6,
  },
  {
    name: 'fills', device: 'cpu', tool: 'tools/gen-interior-fills.mjs',
    // The release flags (226: fills made at the old defaults 4/12 had to be redone); explicit, so a default change in
    // the tool cannot silently change what the chain generates.
    flags: ['--voxel=0.025', '--cell=2', '--rounds=8', '--min-fine=1'],
    full: ['--all'], scoped: (list) => [ids(list)], parts: true,
    // The generator measures and writes in one pass; its check measures into scratch with the same code and flags and
    // compares records (tools/changed-only/fills-check.mjs), so the generator's own bytes (and key) stay put.
    checkTool: 'tools/changed-only/fills-check.mjs',
    check: ['--all', '--jobs=4'], checkScoped: (list) => [ids(list), '--jobs=4'],
    outputs: ['interiorFills', 'movingClearanceAir'],
    files: ['src/vehicles/interiorFillLoaders.generated.ts'], gb: 8, timeoutS: 3600, perIdS: 60,
  },
  {
    name: 'seats', device: 'cpu', tool: 'tools/gen-mission-attachment-seats.mjs',
    flags: ['--seeds=4000,4242,8191', '--qualities=high,low'],
    full: [], scoped: (list) => [ids(list)],
    // 266 (trace-check --combat): the attachment seats follow the combat leaves
    rowReads: [SPEC_COMBAT],
    check: ['--check'], checkScoped: (list) => ['--check', ids(list)],
    outputs: ['missionAttachmentSeats', 'missionDockSeats'],
    files: [], report: '--report', gb: 8, timeoutS: 3600, perIdS: 60,
  },
  {
    name: 'spareTrack', device: 'cpu', tool: 'tools/spare-track-placement-check.mjs',
    // --force: the tool's own inputHash skip ignores tool code and flags; the chain's key covers both.
    flags: ['--ledger=docs/geometry-gate/spare-track.json', '--update', '--force', '--quiet'],
    full: ['--ids=all'], scoped: (list) => [ids(list)],
    check: ['--ids=all', '--check'], checkScoped: (list) => [ids(list), '--check'],
    checkFlags: ['--ledger=docs/geometry-gate/spare-track.json', '--quiet'],
    outputs: ['spareTrackLedger', 'spareTrackSeatPlan'],
    files: [], json: '--json', gb: 8, timeoutS: 3600, perIdS: 30,
  },
  {
    name: 'anatomy', device: 'cpu', tool: 'tools/gen-combat-anatomy.mjs',
    flags: [], full: [], scoped: (list) => [ids(list)],
    // 266: its rows ignored the moved leaves on the trace-check --combat sample, but the anatomy code reads the plates'
    // ke/ce and the gun's cadence and rounds (module layout): keyed, about 15 s per lever id
    rowReads: [SPEC_COMBAT],
    check: ['--check'], checkScoped: (list) => ['--check', ids(list)],
    outputs: ['combatAnatomy'],
    files: ['src/vehicles/combatAnatomyCalibrations.ts', 'src/vehicles/combatAnatomyLoaders.generated.ts'],
    gb: 8, timeoutS: 3600, perIdS: 15,
  },
  {
    name: 'marking', device: 'cpu', tool: 'tools/gen-vehicle-marking-seats.mjs',
    flags: [], full: [], scoped: (list) => [ids(list)],
    check: ['--check'], checkScoped: (list) => ['--check', ids(list)],
    outputs: ['markingSeats'],
    files: ['src/vehicles/vehicleMarkingSeats.generated.ts', 'src/vehicles/vehicleMarkingSeatLoaders.generated.ts'],
    gb: 6, timeoutS: 3600, perIdS: 15,
  },
  {
    name: 'ledger', device: 'cpu', tool: 'tools/fleet-geometry-ledger.mjs',
    flags: ['--update', '--jobs=4'], full: [], scoped: (list) => [ids(list)],
    check: ['--check', '--jobs=4'], checkScoped: (list) => ['--check', '--jobs=4', ids(list)], checkFlags: [],
    outputs: ['geometryLedger'],
    files: [], gb: 16, timeoutS: 3600, perIdS: 10, after: true,
  },
  {
    // 229: each id's gun-line census row binds the turret and gun digests of its ledger row, so it follows the ledger
    // (tank-release-plan's gun-junction --check fails an id whose ledger geometry moved without it).
    name: 'gunLines', device: 'cpu', tool: 'tools/gun-junction-census.mjs',
    flags: ['--ledger=docs/geometry-gate/gun-junction.json', '--update'], full: ['--all'], scoped: (list) => [ids(list)],
    check: ['--all'], checkScoped: (list) => [ids(list)], checkFlags: ['--ledger=docs/geometry-gate/gun-junction.json', '--check'],
    // the census copies each id's turret and gun digests from that id's fleet-ledger row (gun-junction-census.mjs)
    rowReads: ['geometryLedger'], outputs: ['gunJunction'],
    files: [], gb: 8, timeoutS: 3600, perIdS: 20, after: true,
  },
  {
    name: 'centering', device: 'gpu', tool: 'tools/presentation-centering.mjs', entries: ['tools/icons-page.html'],
    flags: ['--update'], full: [], scoped: (list) => [ids(list)],
    // 266: the page renders in a browser the combat proof (trace-check --combat) cannot reach, so it keys the combat row
    // unproven; a balance lever re-centres its own ids (about 1.5 s each)
    rowReads: [SPEC_COMBAT],
    check: ['--check'], checkScoped: (list) => ['--check', ids(list)], checkFlags: [],
    outputs: ['presentationAnchors', 'presentationProjections'],
    files: [], gb: 6, timeoutS: 1200, perIdS: 1.5, chunkS: 1100,
    // The page renders through Vite and Chrome: everything the dev server can serve from public/ is an input (source
    // models excepted: no playable build loads one, AGENTS.md).
    reads: ['public/**'],
    // --update renders live builds; the exported-icon audit (public/icons) runs only under --check/--sync-assets.
    excludeReads: ['public/icons/**', 'public/media/**', 'public/models/**'],
  },
  {
    name: 'icons', device: 'gpu', tool: 'tools/genIcons.mjs', entries: ['tools/icons-page.html'],
    flags: [], full: [], scoped: (list) => [ids(list)],
    // the armour, module and crew views draw each id's plates and stats (266: keyed through the combat row)
    rowReads: [SPEC_COMBAT],
    check: null, checkScoped: null,
    outputs: ['tankAssets'],
    // The images, silhouettes and side diagrams beside the manifest are this step's output too (genIcons writes them all
    // into public/icons): not inputs of its own key.
    writes: ['public/icons/**'],
    // The manifest's header, written whole beside the per-tank row files (266, tools/tank-assets-store.mjs).
    files: ['public/icons/tank-assets/index.json'], gb: 6, timeoutS: 1200, perIdS: 2.5, chunkS: 1100,
    reads: ['public/**'],
    // The manifest row is the keyed output: rendered image bytes are not deterministic across GPUs and drivers.
    excludeReads: ['public/icons/**', 'public/media/**', 'public/models/**'],
  },
]);

export const CPU_FIXPOINT_STEPS = Object.freeze(STEPS.filter((step) => step.device === 'cpu' && !step.after).map((step) => step.name));
export const stepByName = (name) => STEPS.find((step) => step.name === name);

/** Whole-fleet aggregates the chain regenerates before resolving (they feed the shared core) and after the CPU pass. */
export const PRE_AGGREGATES = Object.freeze([
  ['tools/gen-authored-paint-catalog.mjs'],
  ['tools/gen-legacy-fleet-specs.mjs'],
]);
export const POST_AGGREGATES = Object.freeze([
  ['tools/generate-manual-reference.mjs'],
]);

/**
 * Pages built from a step's outputs, run after it (266: the Field Manual's fleet chapter tiles come from the icons
 * step's public/icons/tank-assets.json, so every lane that regenerated icons left src/docs/topics red, and the 265
 * bootstrap left it stale for 209 ids). A dependent runs only when a step in `after` ran in this chain (or an earlier
 * dependent in `after` wrote); it runs its own check first and writes only when that finds its output stale, then
 * checks again. A chain where none of them ran touches none. The public shell inlines the symbols the prerendered
 * chapters reference, so it follows a prerender write.
 */
export const DEPENDENTS = Object.freeze([
  { name: 'docsPrerender', tool: 'tools/docs-prerender.mjs', check: [], write: ['--write'], after: ['icons'] },
  { name: 'publicShell', tool: 'tools/public-shell.mjs', check: [], write: ['--write'], after: ['docsPrerender'] },
]);

/** Fields of a step that decide what it writes. Scheduling fields (gb, timeouts, chunking, report paths) are not keyed. */
const KEYED_FIELDS = ['name', 'device', 'tool', 'entries', 'flags', 'full', 'scoped', 'outputs', 'files', 'reads', 'excludeReads'];
/** Keyed fields added after schema 1: part of the definition only when a step sets them (so adding one to the table does
 *  not move every step's key). */
const LATE_KEYED_FIELDS = ['writes', 'universe', 'donors', 'rowReads'];

/** The step's definition as data (functions applied to a fixed probe), for its key: any edit marks the step's ids. */
export function stepDefinition(step) {
  const probe = ['<id>'];
  const data = { ...step, scoped: step.scoped?.(probe) ?? null };
  return JSON.stringify(Object.fromEntries([...KEYED_FIELDS.map((field) => [field, data[field] ?? null]),
    ...LATE_KEYED_FIELDS.filter((field) => data[field] !== undefined).map((field) => [field, data[field]])]));
}

// ---------------------------------------------------------------- world (per map)

/** The map registry: its CONFIGS object maps each map id to the config module it imports. Its imports of config modules
 *  register maps (as the fleet's group loaders register groups); any other import of a config module pulls that module
 *  into the world core, so an edit to it marks every map. */
export const MAP_REGISTRY_FILE = 'src/world/maps/index.ts';

/**
 * Per-map world tables. A collision row is the map's index entry (bytes, sha256, counts) and its shard file's sha256; a
 * wreck plan row is the map's desktop rows and its `<map>@<variant>` rows. Read by tools/changed-only/rows-child.mjs.
 */
export const WORLD_TABLES = Object.freeze({
  collision: { kind: 'collision', file: 'server/world-collision-manifests/index.json', path: ['maps'], shard: '{map}.json' },
  trenches: { kind: 'collision', file: 'server/world-collision-manifests/index.json', path: ['variants', 'assault-trenches'],
    shard: '{map}@assault-trenches.json' },
  wreckPlan: { kind: 'wreckPlan', file: 'src/world/maps/wreckBakePlan.ts', exportName: 'WRECK_BAKE_PLAN',
    variantsExport: 'WRECK_BAKE_PLAN_VARIANTS' },
});

/** Everything the world steps write. None of it is an input of a world step's key: the tools read their own outputs
 *  only to merge a partial run (the other maps' rows), to keep the index's variants and to --check. */
export const WORLD_OUTPUTS = Object.freeze(['server/world-collision-manifests', 'src/world/maps/wreckBakePlan.ts']);

/**
 * World files that reach the fleet through its entry modules, pinned like dynamic reads (sha256/16 of their sorted
 * trimmed lines naming a fleet entry or the per-id API: graph.mjs accessorPin over FLEET_API_TOKENS). The world keys
 * stop at the fleet entries and take, per map, the fleet core and roster (every map) and the builder keys and build-read rows of
 * the map's donors: the ids the wreck plan bakes and any roster id its config names. tools/changed-only/world-trace.mjs
 * checks at run time that a map's build loads no builder group outside its donors' chains. A new or changed use breaks the
 * pin and the world steps run on every map until it is reviewed.
 */
export const FLEET_API_TOKENS = Object.freeze(['fleetFactory', 'tankFactory', 'specs.ts', 'fleetRegistration',
  'ensureTankBuilder', 'createTank', 'TANK_SPECS', 'PRODUCTION_TANK_IDS', 'ALL_TANK_IDS', 'SAVED_TANK_IDS', 'getSpec']);
export const FLEET_API_USERS = Object.freeze({
  'tools/headlessWorldCollision.mjs': {
    pin: 'bebf312f124077f7', note: 'ensureTankBuilders(config.props.tankWrecks.ids): the authored donors, named by the map config',
  },
  'tools/wreck-bake-plan.mjs': {
    pin: '0f155842c8103143', note: 'ensureTankBuilder(specId) for each bake the props build requests: the plan\'s own donors',
  },
  'src/world/props.ts': {
    pin: '66cf7cb4dfa326ac', note: 'ensureTankBuilder for the wreck bakes it requests (the plan\'s donors, from resolveWreckRoster)',
  },
  'src/world/wrecks.ts': {
    pin: 'ab764aa7907f5207', note: 'createTank(specId) for a requested wreck bake; resolveWreckRoster(era) is the era cast',
  },
  'src/world/wreckRoster.ts': {
    pin: '73d4ac94e11adcd2', note: 'PRODUCTION_TANK_IDS filters the casts: spec data, in every map\'s key through the fleet core',
  },
});

const maps = (list) => `--maps=${list.join(',')}`;

/**
 * The world steps, in chain order, run after the tank steps (a wreck donor's build reads the fleet's generated rows).
 * The wreck plan comes first: its rows name the donors the collision builds bake. `donors` is the step's donor rule:
 * 'plan' = the map's wreck plan rows (every variant) plus the roster ids its config names; a map that asks for wrecks but
 * has no plan rows takes its whole wreck cast (resolveWreckRoster).
 */
export const WORLD_STEPS = Object.freeze([
  {
    name: 'wreckPlan', universe: 'maps', device: 'cpu', tool: 'tools/wreck-bake-plan.mjs',
    flags: ['--write', '--workers=4'], full: ['--maps=all'], scoped: (list) => [maps(list)],
    check: ['--check', '--maps=all'], checkScoped: (list) => ['--check', maps(list)], checkFlags: ['--workers=4'],
    outputs: ['wreckPlan'], files: ['src/world/maps/wreckBakePlan.ts'], donors: 'plan', gb: 10, timeoutS: 1800, perIdS: 240,
  },
  {
    name: 'collision', universe: 'maps', device: 'cpu', tool: 'tools/capture-world-collision-manifests.mjs',
    flags: ['--node'], full: [], scoped: (list) => [maps(list)],
    check: ['--check'], checkScoped: (list) => ['--check', maps(list)], checkFlags: [],
    outputs: ['collision'], files: ['server/world-collision-manifests/index.json'], donors: 'plan', gb: 8, timeoutS: 1800, perIdS: 180,
  },
  {
    name: 'trenches', universe: 'maps', device: 'cpu', tool: 'tools/capture-world-collision-manifests.mjs',
    flags: ['--node', '--variant=assault-trenches'], full: [], scoped: (list) => [maps(list)],
    check: ['--check'], checkScoped: (list) => ['--check', maps(list)], checkFlags: ['--variant=assault-trenches'],
    outputs: ['trenches'], files: ['server/world-collision-manifests/index.json'], donors: 'plan', gb: 8, timeoutS: 1800, perIdS: 180,
  },
]);
export const worldStepByName = (name) => WORLD_STEPS.find((step) => step.name === name);
