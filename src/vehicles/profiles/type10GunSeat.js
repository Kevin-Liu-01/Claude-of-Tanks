// Canonical Type 10 / Type 10B gun-seat datums from the gallery surface
// markup. The gun-owned mantlet back plane is centered on the turret throat
// while the certified muzzle station remains unchanged.

export const TYPE10_GUN_SEAT = Object.freeze({
  turretLocalPivot: Object.freeze([0, 0.319, 1.93648]),
  turretAttachmentCenterZ: 2.09598,
  certifiedMuzzleWorldZ: 6.6525211453744495,
});

// The Type 10 turret throat closes at x +-0.308 m and spans y 0.066..0.572 m
// in turret-local space. Keep every moving mantlet surface inside that mouth
// while retaining a small overlap at the edges so gun pitch cannot expose a
// daylight seam.
export const TYPE10_MANTLET_FIT = Object.freeze({
  throatHalfWidth: 0.308,
  throatBottomY: 0.066,
  throatTopY: 0.572,
  housingWidth: 0.594,
  housingHeight: 0.484,
  faceWidth: 0.506,
  faceHeight: 0.374,
  topCoverWidth: 0.44,
  kaiMaskWidth: 0.55,
  kaiMaskHeight: 0.44,
  auxiliaryPortX: 0.19,
});
