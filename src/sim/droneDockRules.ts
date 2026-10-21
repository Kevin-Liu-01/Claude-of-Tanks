// The drone dock's launch rule: a leaf of src/sim/matchRuleset.ts, which reads it into AERIAL_RULES.drone.launchHeightM
// and re-exports it, so the rule is still the ruleset's. Split out on 2026-10-16 (the test-speed lane): the decor
// keep-out clears the launch column above a parked airframe (src/sim/missionDockVolumes.ts missionAirframeVolumes,
// src/vehicles/decorations.ts dockKeepOut), and reading the ruleset itself for it put the whole ruleset into every
// vehicle build's import graph, so any ruleset edit re-ran about 700 receipts. One value for every mode: no ruleset
// varies it (src/sim/droneDockRules.selftest.mjs).
/** The launch climb's height above the dock (m): the vertical column the airframe rises through before it flies. */
export const DRONE_LAUNCH_HEIGHT_M = 12;
