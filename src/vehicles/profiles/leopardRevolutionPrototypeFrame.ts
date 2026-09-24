// Metres, in the installed vehicle frame. Shared by firing and visual rigs.
export const REVOLUTION_PROTO_FRAME = Object.freeze({
  turretPivot: [0, 1.60, .45] as const,
  gunPivot: [0, .25, 1.45] as const,
  barrelLengthM: 3.955,
  barrelRadiusM: .078,
});
