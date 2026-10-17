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
 * the file and following `path`. A row is the stable JSON of one id's entry ("absent" when it has none).
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
  tankAssets: { kind: 'json', files: ['public/icons/tank-assets.json'], path: ['tanks'] },
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
 * every id until the declaration is reviewed and re-pinned (tools/changed-only/declarations.selftest.mjs prints the
 * new pin). `reads` globs are hashed into the reaching step's key. `covered` names paths the file reads that the fleet keys
 * already cover (with the reason beside it): the edge to them is dropped from the step's own key.
 */
export const DECLARED_DYNAMIC = Object.freeze({
  'tools/gen-interior-fills.mjs': {
    pin: '940b8d8d3f93c150',
    reads: [],
    note: 'readdirSync/import of its own interiorFillGroups shards (the --ids merge and stale-family moves) and of the chain\'s own --merge-from parts (records this step measured with the same flags); git rev-parse/show and the data: import run only with --uniform-from, which the chain never passes',
  },
  'tools/mission-dock-seats.mjs': {
    pin: '25e8208f967031dd',
    reads: [],
    note: 'the computed import runs only when the file is executed as a CLI (it imports the seats generator output); the generator imports it as a library',
  },
  'tools/spare-track-placement-check.mjs': {
    pin: 'd9f0bf06ba201c7f',
    importHelper: 'imp',
    reads: [],
    // The run classifier reads the source lines of the stack frames that built each id's parts (src/<frame file>): code
    // the id's own build ran, so already in its builder key (core and its spec chain's groups). The lint reads
    // src/vehicles/profiles/*.ts and changes only --check/--gate verdicts, never an --update output.
    covered: ['src', 'src/vehicles', 'src/vehicles/profiles'],
    note: 'imp(<literal>) imports repository modules (followed as edges); node_modules imports are covered by the lockfiles; src source-line reads are covered (see covered)',
  },
  'tools/gen-combat-anatomy.mjs': {
    pin: 'b167ef1ce75d0f51',
    reads: [],
    note: 'readdirSync of its own combatAnatomyGroups directory (stale shard removal)',
  },
  'tools/gen-vehicle-marking-seats.mjs': {
    pin: '296e09f6f23f64ea',
    reads: [],
    note: 'readdirSync of its own vehicleMarkingSeatGroups directory (stale shard removal)',
  },
  'src/ui/i18nDictionaries.ts': {
    pin: 'a10171fb8b5b9857',
    reads: [],
    note: 'both computed imports load the URL a document names in its cot-i18n-catalog meta; tools/icons-page.html has none and Node has no document, so neither runs in a fleet step',
  },
  'tools/presentation-centering.mjs': {
    pin: 'b99630f0bbd21fbd',
    reads: [],
    note: 'a Vite dev server (configFile false) over the repository root serves tools/icons-page.html to Chrome; what the page can fetch is the step\'s declared reads (public/**)',
  },
  'tools/genIcons.mjs': {
    pin: 'b2a9f6af43262305',
    reads: [],
    note: 'a Vite dev server (configFile false) over the repository root serves tools/icons-page.html to Chrome; what the page can fetch is the step\'s declared reads (public/**)',
  },
  'tools/fleet-geometry-ledger.mjs': {
    pin: '1c72be85b54a8dbf',
    reads: [],
    note: 'spawns itself (--worker) for --jobs shards; the shards run this same closure',
  },
});

const ids = (list) => `--ids=${list.join(',')}`;

/**
 * The fleet steps, in chain order. Seats read the fills and the roof guns (controls), and missionDockSeats feeds the
 * spare-track dock keep-out, so the CPU order is controls, fills, seats, spare-track, anatomy, marking; the ledger
 * measures the settled builds; the GPU steps follow.
 *   flags   canonical flags (part of the step key)
 *   full    extra args for a whole-fleet run; scoped(list) for an id run; check/checkScoped for verification
 *   outputs per-id tables written; files: other files written whole (aggregates and reports are not keyed)
 *   gb      memory to ask headroom for; timeoutS per run (scaled by id count where noted)
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
    full: ['--all'], scoped: (list) => [ids(list)],
    check: null, checkScoped: null,
    outputs: ['interiorFills', 'movingClearanceAir'],
    files: ['src/vehicles/interiorFillLoaders.generated.ts'], gb: 8, timeoutS: 3600, perIdS: 60,
  },
  {
    name: 'seats', device: 'cpu', tool: 'tools/gen-mission-attachment-seats.mjs',
    flags: ['--seeds=4000,4242,8191', '--qualities=high,low'],
    full: [], scoped: (list) => [ids(list)],
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
    name: 'centering', device: 'gpu', tool: 'tools/presentation-centering.mjs', entries: ['tools/icons-page.html'],
    flags: ['--update'], full: [], scoped: (list) => [ids(list)],
    check: ['--check'], checkScoped: (list) => ['--check', ids(list)], checkFlags: [],
    outputs: ['presentationAnchors', 'presentationProjections'],
    files: [], gb: 6, timeoutS: 1200, perIdS: 1.5, chunkS: 1100,
    // The page renders through Vite and Chrome: everything the dev server can serve from public/ is an input (source
    // models excepted: no playable build loads one, AGENTS.md).
    reads: ['public/**'],
    excludeReads: ['public/media/**', 'public/models/**'],
  },
  {
    name: 'icons', device: 'gpu', tool: 'tools/genIcons.mjs', entries: ['tools/icons-page.html'],
    flags: [], full: [], scoped: (list) => [ids(list)],
    check: null, checkScoped: null,
    outputs: ['tankAssets'],
    files: [], gb: 6, timeoutS: 1200, perIdS: 2.5, chunkS: 1100,
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

/** Fields of a step that decide what it writes. Scheduling fields (gb, timeouts, chunking, report paths) are not keyed. */
const KEYED_FIELDS = ['name', 'device', 'tool', 'entries', 'flags', 'full', 'scoped', 'outputs', 'files', 'reads', 'excludeReads'];

/** The step's definition as data (functions applied to a fixed probe), for its key: any edit marks the step's ids. */
export function stepDefinition(step) {
  const probe = ['<id>'];
  const data = { ...step, scoped: step.scoped?.(probe) ?? null };
  return JSON.stringify(Object.fromEntries(KEYED_FIELDS.map((field) => [field, data[field] ?? null])));
}
