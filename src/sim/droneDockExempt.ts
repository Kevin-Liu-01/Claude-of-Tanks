// The vehicles that carry no drone dock (the Merkava family 262). A leaf of its own, read by src/sim/aerialCombat.ts
// (initializeAerial), tools/gen-mission-attachment-seats.mjs and src/sim/droneRecon.selftest.mjs: kept out of
// droneDockRules.ts (265 integration) so the table rides aerialCombat's chunk instead of becoming a boot chunk of its own
// (droneDockRules.ts is shared by the ruleset and the decor keep-out; a non-inlinable table there split off a 129th
// request on the game page).
/** Vehicles that carry no drone dock (sealed, each with its reason and its follow-up): in the drone mode they launch no
 *  drone and draw no dock (aerialCombat.ts initializeAerial gives them no flight), the seat generator writes them no
 *  seat (tools/gen-mission-attachment-seats.mjs) and the fleet seat receipt holds them to having none
 *  (src/sim/droneRecon.selftest.mjs). */
export const DRONE_DOCK_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  // Release 262 (Main's ruling, 2026-10-28): the rebuilt Mk 4B's measured roof is its removable armour modules (never
  // dock support) and the measured roof MAGs' sweeps; the follow-up is a MISSION_RECEIVER_SEATS bearer.
  merkava4b: 'measured roof: removable armour modules and roof MAG sweeps, no clear support; follow-up: a receiver bearer',
});
