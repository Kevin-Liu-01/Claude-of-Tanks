// Owner-selected XK2 hull / K1A1 turret composition, in metres.
export const XK2_FRAME = Object.freeze({
  turretPivot: [0, 1.70, -.30] as const,
  gunPivot: [.0352, 1.81797 - 1.49566, 1.57716 - .42564] as const,
  barrelLengthM: 5.9052399 - 1.57716,
  barrelRadiusM: .105,
  hullLengthM: 7.5,
  widthM: 3.629,
  overallLengthM: 5.9091399 - .42564 - .30 + 3.769,
  roofHeightM: 2.20756 - 1.49566 + 1.70,
  tallestM: 4.07025 - 1.49566 + 1.70,
});
