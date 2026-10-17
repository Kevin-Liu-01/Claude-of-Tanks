// structureStagesPieceHides.selftest.mjs — a set piece's named piece that a delayed run lays again stands until its wreck
// shows (227, lane B co-hold on structureStages run(); the 227 films: a headframe's frame was flattened at the collapse's
// event and its wreck showed 0.7 s later, so for those frames the frame was neither standing nor lying). On a live run the
// piece's hide waits for the run's birth (the frame the debris shows its laid copy); on a settled run (a rejoin, a restored
// destroyed set) it applies at once with the wreck. Presentation only: the stage's event and the sim are untouched.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { damageSeed } from '../world/destructionKit.ts';
import { describeDefault } from '../world/destructionDefaultKit.ts';
import { createStructureDamageSeam } from '../world/structureDamageSeam.ts';
import { createStructureMask } from './structureMask.ts';
import { createStructureDebris } from './structureDebris.ts';
import { createStructureStages } from './structureStages.ts';

function part(bucket, w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  g.userData.bucket = bucket;
  return g;
}
const parts = { regionalPlaster: [part('regionalPlaster', 6, 4, 5, 0, 0, 0)], structureMetal: [part('structureMetal', 0.4, 12, 0.4, 0, 4, 0)] };

/** One structure: a body span and its frame (the named piece 'frame') in the world, and its seam whose collapse lays the frame again. */
function structure(id, x) {
  const placement = { x, y: 0, z: 0, yaw: 0 };
  const anatomy = describeDefault({ structureIdx: id, mapId: 'verdant', builder: 'shed', style: null, parts, w: 6, d: 5, h: 16, placement,
    massClass: 'house', seed: damageSeed(1, id, 7) });
  anatomy.mound = { cx: x, cz: 0, hw: 3, hd: 2.5, yaw: 0, heightM: 1 };
  const spans = [];
  for (const [bucket, list] of Object.entries(parts)) {
    const flat = list[0].toNonIndexed();
    flat.translate(x, 0, 0);
    const mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ name: bucket }));
    spans.push({ mesh, geometryId: null, instanceId: null, position: flat.getAttribute('position'), bucket, partClass: 'wall', first: 0,
      count: flat.getAttribute('position').count, ...(bucket === 'structureMetal' ? { piece: 'frame' } : {}) });
  }
  const real = createStructureDamageSeam(id, 'shed', null, anatomy, spans);
  const seam = { ...real, collapse(seed, out) {
    const r = real.collapse(seed, out);
    return { ...r, hides: [...(r.hides ?? []), { section: null, partClass: null, piece: 'frame' }] };
  } };
  const frame = spans.find((s) => s.piece === 'frame');
  const saved = Float32Array.from(frame.position.array);
  const standing = () => frame.position.array.every((v, i) => v === saved[i]);
  return { seam, standing, event: { structureId: id, massClass: 'house', cx: x, cz: 0, hw: 3, hd: 2.5, yaw: 0, baseY: 0, topY: 16, cause: 'blast',
    munition: 'he', points: 30, integrity: 0, x, y: 2, z: 2.5, dirX: 0, dirZ: -1, stage: 'collapsed', previous: 'breached' } };
}

let now = 50;
const mask = createStructureMask(64);
const debris = createStructureDebris({ now: () => now, groundY: () => 0 });
const stages = createStructureStages({ mask, debris, now: () => now, materialFor: () => null });
/** The run's laid wreck: the static runs its stage added in the structure's buckets (their materials the spans' or the
 *  fallback's, named; the crumble's fragments off the falling walls and the pools of thrown pieces are not the frame's copy). */
const laid = (before) => debris.group.children.filter((m) => !before.has(m) && m.isMesh && !m.isInstancedMesh && !!m.material?.name);

// ---- a live collapse: the frame stands until the frame its wreck shows, then lies; never neither
{
  const s = structure(5, 0);
  const before = new Set(debris.group.children);
  const t0 = now;
  stages.stage(s.event, s.seam);
  const wreck = laid(before).filter((m) => !m.visible);
  const wreckShows = () => wreck.some((m) => m.visible);
  assert.ok(s.standing(), 'the frame stands at the event');
  assert.ok(wreck.length > 0, 'its wreck waits for the run\'s delay');
  let flatAt = null, wreckAt = null;
  for (let f = 1; f <= 240; f++) {
    now = t0 + f / 60;
    stages.update();
    debris.update();
    const up = s.standing(), lying = wreckShows();
    assert.ok(up || lying, `frame ${f} (${(now - t0).toFixed(3)} s): the frame is neither standing nor wrecked`);
    if (!up && flatAt === null) flatAt = f;
    if (lying && wreckAt === null) wreckAt = f;
  }
  assert.ok(flatAt !== null && wreckAt !== null, 'the frame is laid down within four seconds');
  assert.equal(flatAt, wreckAt, 'the frame goes the frame its wreck shows');
  assert.ok((flatAt / 60) >= 0.69 && (flatAt / 60) <= 0.72, `at the run's birth (0.7 s), not ${(flatAt / 60).toFixed(3)} s`);
}

// ---- a settled collapse (a rejoin, a restored destroyed set): the frame goes at once, its wreck shown at once
{
  const s = structure(6, 40);
  const before = new Set(debris.group.children);
  stages.stage({ ...s.event, settled: true }, s.seam);
  assert.ok(!s.standing(), 'a settled collapse lays the frame down at once');
  assert.ok(laid(before).length > 0 && laid(before).every((m) => m.visible), 'and shows its wreck at once');
}

// ---- reset stands it up again with nothing held over; a held hide follows the fx clock's rebase
{
  const s = structure(7, 80);
  stages.stage(s.event, s.seam);
  stages.shiftTime(10);
  now += 0.75;
  stages.update();
  assert.ok(s.standing(), 'a held hide moves with the clock\'s rebase');
  stages.reset();
  now += 20;
  stages.update();
  assert.ok(s.standing(), 'reset drops the held hides');
}

console.log('structureStagesPieceHides selftest: a live run\'s piece stands until its wreck shows, a settled run\'s goes at once');
