// Original game-concept dimensions, not a production TOS-1A specification.
// This data-only contract is shared by the authoring recipe and firing anchors.
export const TOS1A_TAGIL_LAYOUT = Object.freeze({
  turretPivot: [-.00095, 1.5455, .118] as const,
  gunPivot: [0, 1.30, -1.30] as const,
  packMin: [-1.55, -.61, -1.00] as const,
  packMax: [1.55, .61, 2.60] as const,
  columns: 8, rows: 3, pitch: .37,
  boreRadius: .11, tubeRadius: .17, mouthZ: 2.60,
  terminalZ: -.94, skinFrontZ: 2.565, elevationDeg: 45, depressionDeg: 5,
  stowedHeight: 3.4555,
});

/** Row-major, bottom to top and left to right, in the pitching gun frame. */
export const TOS1A_TAGIL_LAUNCHER_MUZZLES = Object.freeze(
  Array.from({ length: 24 }, (_, index) => Object.freeze({
    x: (index % 8 - 3.5) * .37,
    y: (Math.floor(index / 8) - 1) * .37,
    z: 2.60,
  })),
);

/** CCW front contour of the actual structural launcher skin. */
export const TOS1A_TAGIL_PACK_CONTOUR = [
  [-1.43, -.61], [1.43, -.61], [1.55, -.49], [1.55, .49],
  [1.43, .61], [-1.43, .61], [-1.55, .49], [-1.55, -.49],
] as const;
