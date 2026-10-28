# Challenger 3 TD (RWS) (`challenger3_td_rws`) — run packet

## Current status

- Updated: 2026-10-27 (release 262 lane `item/cr3td-262`).
- Owner request, 2026-10-27, verbatim: "so yeah make a new version of this challeenger without the ghillie and with new
  remote machien gun tower systems and equipment and so on!!!! awesome this will be 2 nerrw tanks".
- IDs and display names: `challenger3_td_rws`, "Challenger 3 TD (RWS)"; design status concept (a project-authored
  field fit, not a photographed vehicle).
- Implementation / qualification / publication: see `challenger3_td.md` (one evidence matrix for both ids).

## Scope and derivation

- Route: explicit first-party derivative ("Make Mk10 based on Mk5 X"): the TD's measured builder
  (`profiles/challenger3Td.ts`) with `P.spec.id === 'challenger3_td_rws'` adding `buildRemoteStation` and
  `buildFieldKit`; no camouflage suit (no `ghillieFleetSuits.ts` row). The hull, turret, gun and running gear are the
  TD's, measured against the same oracle (see `challenger3_td.md`); no other comparison target.
- Remote station: Protector-class, front-left on the roof proper (yaw centre oracle (0.80, 2.70, 0.13)), clear of the
  loader's hatch hinges (7 cm) and short of the brow step; its M2 (12.7 mm) is the fleet's Browning construction in
  remote form (`machineGunGeometry.ts`) with its true 0.80 m barrel (`datumBarrel: false`: a new station publishes the
  muzzle it draws) on a working `beginAuxiliaryStation` rig. Yaw body: turntable, a housing with chamfered top edges,
  cradle cheeks at |x| 0.26-0.30 m with the trunnion pins. Elevating: the gun, the sight head on a post over the
  receiver with its window forward, and the ready box, all inside |x| 0.20 m and over the housing by 3 cm or more at
  full travel; the trunnion 0.58 m over the roof, so the receiver's back clears the loader's hatch at the full 43
  degrees. `tools/roof-station-sweep.mjs` holds its moving stock 25 mm off the fixed at every yaw (blocked none, full
  circle, full depression). Rounds: r1 failed at 18-25 mm with the first packing; r2 22 mm forward, the M2 feed under
  the right cheek; r3 24 mm at yaws -28..15, the receiver's back on the loader's hatch at 40-43 degrees with the pivot
  at 0.48 m; r4 (blind critic 2, 6/10: "M2 barrel far too short", "the sight tucked between the yoke and the
  receiver", "the base hard against the hatch plate") the true barrel, the sight on top, the smaller base 3 cm forward.
- Equipment: stowage bins hung on both turret side rails behind the cheeks (authored) and the decor manifest's field kit (a
  bustle basket with the crew's packs, a rolled net, tarpaulin, jerrycans, a bin, spare links, tow cable, shackles,
  tools, rations).
- Combat data: the TD's (L55A1, DM63A1 / DM12A2 / DM11; CV12-9A 1,200 hp) at 67 t and 58 km/h; the station is an
  auxiliary 12.7 mm weapon (auxiliary inventory, remoteGunFleet.selftest). Own coat `paint_challenger3_td_rws`.
- Tree: drawn on the TD's node (UK special lane, VIII) as its twin build.
