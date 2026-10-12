// The physics lane's turret-pop wave (2026-10-10; the owner: "it blows up nicely but then the turret snaps into a
// pre-ordained resting position"): Verdant's duel stage (scenes-b1), the fx clock pinned, the lens flare off.
// A = main (scripted arc + settle table), B = physics/rigid-body (the turret a rigid body). Wave 356's cameras: pop-scenes-w356.mjs.
const seed = 5000;
const t90 = { id: 't90m', name: 'target', pos: [190, 391], facingDeg: 250, turretDeg: 20, gunDeg: 0, camo: 'summer', camoSeed: 4208, state: 'intact' };
const m1 = { id: 'm1a2', name: 'target', pos: [190, 391], facingDeg: 120, turretDeg: -30, gunDeg: 0, camo: 'summer', camoSeed: 4210, state: 'intact' };
const kv2 = { id: 'kv2', name: 'target', pos: [190, 391], facingDeg: 300, turretDeg: 15, gunDeg: 0, camo: 'summer', camoSeed: 4212, state: 'intact' };
const kill = (cause = 'ammorack', pop = true) => [{ type: 'tank_kill', actor: 'target', tMs: 0, params: { cause, pop } }];
export default [
  // a cook-off from the side at 50 m: the throw, the tumble, the landing and the rest (6 s)
  { id: 'pop-t90-side', frames: 61, startMs: 0, stepMs: 100,
    scene: { seed, actors: [t90], effects: kill(), camera: { pos: [142, 3.0, 400], lookAt: [190, 4.5, 391], groundRel: true, fov: 50 } } },
  // an M1A2 cook-off, three-quarter front at 34 m (wave 357+: back from 28 m, the throw now reaches 10-14 m)
  { id: 'pop-m1-near', frames: 61, startMs: 0, stepMs: 100,
    scene: { seed: seed + 1, actors: [m1], effects: kill(), camera: { pos: [161, 4.0, 409], lookAt: [190, 6.0, 391], groundRel: true, fov: 50 } } },
  // the KV-2's tall turret thrown, front quarter at 36 m (the frame's centre raised for the higher throw)
  { id: 'pop-kv2', frames: 61, startMs: 0, stepMs: 100,
    scene: { seed: seed + 2, actors: [kv2], effects: kill(), camera: { pos: [160, 3.4, 372], lookAt: [190, 5.5, 391], groundRel: true, fov: 50 } } },
  // a plain kill: the turret unseated on its deck (close, 22 m)
  { id: 'shot-m1', frames: 41, startMs: 0, stepMs: 100,
    scene: { seed: seed + 3, actors: [{ ...m1, facingDeg: 200, turretDeg: 10 }], effects: kill('shot', false),
      camera: { pos: [176, 3.2, 402], lookAt: [190, 3.2, 392], groundRel: true, fov: 45 } } },
  // the end state: where the M1A2's turret lies 8 s on (stills; wave 357+: a wide high view, the turret lands off the hull)
  { id: 'pop-m1-rest', frames: 6, startMs: 8000, stepMs: 400,
    scene: { seed: seed + 1, actors: [m1], effects: kill(), camera: { pos: [160, 7.5, 412], lookAt: [190, 1.5, 391], groundRel: true, fov: 55 } } },
];
