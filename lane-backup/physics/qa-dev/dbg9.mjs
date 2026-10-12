import { createRigidBox } from '../src/sim/rigidBody.ts';
import { createDebrisPhysics } from '../src/fx/debrisPhysics.ts';
const pool = createDebrisPhysics({ capacity: 8 });
const pier = { min: [-0.5, 0, -0.5], max: [0.5, 2.85, 0.5], shape2: { kind: 'obb', cx: 0, cz: 0, hw: 0.5, hl: 0.5, yaw: 0 } };
pool.bind({ groundAt: () => 0, queryStatic: (minX, minZ, maxX, maxZ, out) => { out.length = 0; if (!(pier.max[0] < minX || pier.min[0] > maxX || pier.max[2] < minZ || pier.min[2] > maxZ)) out.push(pier); return out; } });
const floor = pool.spawn(createRigidBox(1.6, 0.15, 1.6, 1900), { x: 0, y: 3, z: 0, asleep: true, vx: 4, vy: 1 }, 5);
const brick = pool.spawn(createRigidBox(0.35, 0.25, 0.3, 1900), { x: 0.2, y: 4.2, z: 0.1 });
const pose = new Float64Array(7);
for (let i = 0; i < 90; i++) { pool.advance(1/60); if (i % 6 === 0) { pool.framePoseAt(floor, pose); const f = [...pose].slice(0,3).map(v=>v.toFixed(3)); pool.framePoseAt(brick, pose); console.log(i, 'floor', f.join(','), 'asleep', pool.asleep(floor), 'brick y', pose[1].toFixed(3)); } }
