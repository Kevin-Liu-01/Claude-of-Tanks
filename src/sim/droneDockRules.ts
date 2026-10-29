// The drone dock's launch rule: a leaf of src/sim/matchRuleset.ts, which reads it into AERIAL_RULES.drone.launchHeightM
// and re-exports it, so the rule is still the ruleset's. Split out on 2026-10-16 (the test-speed lane): the decor
// keep-out clears the launch column above a parked airframe (src/sim/missionDockVolumes.ts missionAirframeVolumes,
// src/vehicles/decorations.ts dockKeepOut), and reading the ruleset itself for it put the whole ruleset into every
// vehicle build's import graph, so any ruleset edit re-ran about 700 receipts. One value for every mode: no ruleset
// varies it (src/sim/droneDockRules.selftest.mjs).
/** The launch climb's height above the dock (m): the vertical column the airframe rises through before it flies. */
export const DRONE_LAUNCH_HEIGHT_M = 12;

/** Vehicles that carry no drone dock (sealed, each with its reason and its follow-up): in the drone mode they launch no
 *  drone and draw no dock (aerialCombat.ts initializeAerial gives them no flight), the seat generator writes them no
 *  seat (tools/gen-mission-attachment-seats.mjs) and the fleet seat receipt holds them to having none
 *  (src/sim/droneRecon.selftest.mjs). */
export const DRONE_DOCK_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  // Release 262 (Main's ruling, 2026-10-28): the rebuilt Mk 4B's measured roof is its removable armour modules (never
  // dock support) and the measured roof MAGs' sweeps; the follow-up is a MISSION_RECEIVER_SEATS bearer.
  merkava4b: 'measured roof: removable armour modules and roof MAG sweeps, no clear support; follow-up: a receiver bearer',
});
