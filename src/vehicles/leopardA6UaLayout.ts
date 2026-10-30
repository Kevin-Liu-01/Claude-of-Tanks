// Leopard 2A6 UA field-kit datums (264), hull frame, metres. One owner for the kit (profiles/leopardA6Ua.ts), its field
// net (ghillieSuit.ts) and its roof dock (missionAttachmentReceiver.ts). The turret screens stand 0.33-0.42 m off the
// 2A6's flat flanks, outboard of its smoke dischargers; the cage's ridge tops out at the vehicle's published 3.28 m and
// the hull's mesh boxes at its 4.44 m width, so the spec's dimensions (spotting, contact shapes) stay as they were.

/** The source-measured 2A6 turret ring (profiles/leopardA6X.ts LEOPARD_A6_X_DATUMS.leo2a6.turretPivot). */
export const LEOPARD_A6_UA_PIVOT = Object.freeze([.000005, 2.14836, 1.047795] as const);

/** The source-measured 2A6's dimensions (LEOPARD_A6_X_DATUMS.leo2a6.dims): the shell the UA's armour sits on (germany.ts);
 * the UA's own spec dimensions are its kit's. */
export const LEOPARD_A6_UA_SHELL_DIMS = Object.freeze({
  hullLengthM: 7.63049, overallLengthM: 10.9547999, widthM: 3.80991006, heightM: 2.43111,
});

export const LEOPARD_A6_UA_KIT = Object.freeze({
  turretScreenX: 1.60, screenBottomY: 2.00, screenTopY: 2.66, chainBottomY: 1.875,
  rearScreenZ: -2.95, frontPostZ: 1.00, roofFrontZ: 1.20,
  eaveY: 3.175, crownY: 3.255, postZs: Object.freeze([-2.95, -.40, 1.00] as const),
  hullBoxX: 2.20, hullBoxInnerX: 1.905, hullBoxBottomY: .94, hullBoxTopY: 1.44, hullBoxZ: Object.freeze([.40, 3.74] as const),
  bowFaceZ: 3.86, bowInnerX: 1.12, bowTopY: 1.40, bowChainBottomY: .56,
  skirtEraZ: Object.freeze([-3.30, .30] as const),
  /** the whip antennas' crossing of the roof (both bases at z -1.87, raked back) */
  whipXs: Object.freeze([-.880, .915] as const), whipZ: -1.966,
  /** the roof dock: a longitudinal rail on the right half of the roof, the dock ahead of the whips */
  dockRailX: -1.08, dockZ: -1.20, dockRailW: .032,
});

/** The cage's pitched roof height at x (hull frame): eaves over the posts, the ridge on the centre line. */
export function leopardA6UaRoofY(x: number): number {
  const k = LEOPARD_A6_UA_KIT;
  return k.crownY - (k.crownY - k.eaveY) * Math.min(1, Math.abs(x) / k.turretScreenX);
}

/** The roof dock's rail and seat in the turret frame (missionAttachmentReceiver.ts): the rail is welded into the roof
 * mesh's plane (the net lies over it), two 41 mm sockets stand 4 mm into its top, and the bearers' tops (the dock's datum)
 * stand 22 mm over the sockets. */
export function leopardA6UaDockSeat(): { x: number; z: number; railY: number; socketY: number; topY: number } {
  const k = LEOPARD_A6_UA_KIT, railY = leopardA6UaRoofY(k.dockRailX) - LEOPARD_A6_UA_PIVOT[1];
  const socketY = railY + k.dockRailW / 2 + .0165;
  return { x: k.dockRailX - LEOPARD_A6_UA_PIVOT[0], z: k.dockZ - LEOPARD_A6_UA_PIVOT[2], railY, socketY, topY: socketY + .0205 + .022 };
}

/** The 2A6 tube by distance ahead of its trunnion (profiles/leopardA6X.ts weapons()): [from, to, radius, axis lift]; the
 * thermal-sleeve band over the fume extractor stands 30 mm above the axis. */
const TUBE = Object.freeze([
  [1.184, 1.930, .1413, 0], [1.930, 2.031, .1742, 0], [2.031, 2.461, .1742, .0299], [2.461, 2.661, .14, 0],
  [2.661, 5.301, .1182, 0], [5.301, 5.461, .1303, 0], [5.461, 5.721, .1016, 0],
] as const);
const TRUNNION_Y = 1.97054, TRUNNION_AHEAD = 1.419495 - LEOPARD_A6_UA_PIVOT[2];

/**
 * The underside of the main gun's swept volume over a hull point (x, z), hull frame: the tube at the spec's 9-degree
 * depression stop turned to that point's bearing, its recoil stroke (0.135 m) included. Hull kit stays 25 mm under it
 * (nationalGunClearance's keep), so the depression the vehicle always had is never taken by its kit.
 */
export function leopardA6UaGunFloorY(x: number, z: number, depressionDeg = 9): number {
  const a = depressionDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const along = (Math.hypot(x - LEOPARD_A6_UA_PIVOT[0], z - LEOPARD_A6_UA_PIVOT[2]) - TRUNNION_AHEAD) / c;
  let low = Infinity;
  for (const [from, to, radius, lift] of TUBE) {
    if (to < along - .05 || from > along + .135 + .05) continue;
    low = Math.min(low, (lift - radius) * c - Math.max(along, from) * s);
  }
  return Number.isFinite(low) ? TRUNNION_Y + low : Infinity;
}
