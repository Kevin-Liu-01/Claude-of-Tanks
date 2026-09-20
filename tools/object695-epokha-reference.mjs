// Browser-safe, QA-only source derivation. Never imported by playable builders.
export const OBJECT695_EPOKHA = Object.freeze({
  source: {
    path: 'public/models/community-candidates/object695_x_source.glb',
    sha256: '012dfef5a8aeb31031e58f786883e94f02210476a08c41c5166d764abf47c9b3',
    scale: .965, translation: [.0052, .0135, 0],
  },
  donor: {
    path: 'public/models/community-candidates/kurganets25_x_source.glb',
    sha256: 'a2b4074765a9f1765c35e3838bd775cfcc2657cb6bb6e7530dc71930f95630d0',
    translation: [.0054349899291992, .0139, 0],
    turret: [0, 2.21, -1.27], gun: [-.004, 2.917, -.68],
  },
  retainedTurret: [0, 2.15, -1.10],
  outputPath: 'public/models/community-candidates/object695_x_epokha_20260919.glb',
  recipePath: 'docs/references/source-assemblies/20260919/object695_x.json',
  // Complete original owners, authenticated against both source exports.
  owners: [
    ['Object_2', 1, 990], ['Object_4', 3, 597], ['Object_19', 18, 19],
    ['Object_25', 24, 248], ['Object_27', 26, 28], ['Object_29', 28, 18378],
    ['Object_30', 29, 4284], ['Object_31', 30, 6966], ['Object_32', 31, 4995],
  ],
});

export function object695ModuleShift() {
  return OBJECT695_EPOKHA.retainedTurret.map((value, axis) => value - OBJECT695_EPOKHA.donor.turret[axis]);
}

export function object695SourceTransform() {
  const { source, donor } = OBJECT695_EPOKHA;
  const shift = object695ModuleShift();
  return { scale: 1 / source.scale,
    translation: donor.translation.map((value, axis) => value - source.translation[axis] / source.scale + shift[axis]) };
}

export const OBJECT695_EPOKHA_FRAME = Object.freeze({
  sha256: '20598454a5f7e8ced5212bcd416c36287626b970af125dde6dc80eeb5d0c0cfd', fused: true,
  turret: [...OBJECT695_EPOKHA.retainedTurret],
  gun: OBJECT695_EPOKHA.donor.gun.map((value, axis) => value + object695ModuleShift()[axis]),
});

// Immutable former comparison contract. The later original missile concept
// supersedes this active target; source-only replay remains independently testable.
export const RETIRED_OBJECT695_EPOKHA_REFERENCE = Object.freeze({
  source:'glb',qualityBar:'exemplar',glb:{
    path:'/models/community-candidates/object695_x_epokha_20260919.glb',
    fixedMount:true,componentMasks:false,geometryComponentMasks:false,
  },
});
