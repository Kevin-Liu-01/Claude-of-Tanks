import { PerspectiveCamera, Vector3 } from 'three';
import { mobileAutoAimCenter, pickMobileAutoAimTarget } from './mobileAutoAim.js';
import { battleGeometryQuality } from './rosterState.ts';

if (battleGeometryQuality(true, 'desktop') !== 'high') {
  throw new Error('desktop player must retain high-detail battle geometry');
}
if (battleGeometryQuality(false, 'desktop') !== 'low'
    || battleGeometryQuality(true, 'mobile') !== 'low'
    || battleGeometryQuality(false, 'mobile') !== 'low') {
  throw new Error('mobile players and all battle bots must use low-detail geometry');
}

const mk = (id, x, z, team = 'enemy', destroyed = false) => ({
  id, team, state: { pos: new Vector3(x, 0, z) }, spec: { dims: { heightM: 3 } },
  combat: { destroyed },
});
const player = mk('player', 0, 0, 'player');
const centered = mk('centered', 0, -120);
const offset = mk('offset', 35, -120);
const ally = mk('ally', 0, -60, 'player');
const dead = mk('dead', 0, -50, 'enemy', true);
const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1000);
camera.position.set(0, 4, 8);
camera.lookAt(0, 1.5, -100);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
const picked = pickMobileAutoAimTarget([offset, ally, dead, centered], player, camera);
if (picked !== centered) throw new Error(`expected centered target, got ${picked && picked.id}`);
const hidden = pickMobileAutoAimTarget([centered, offset], player, camera, (e) => e !== centered);
if (hidden !== offset) throw new Error('visibility gate did not exclude the centered target');
const center = mobileAutoAimCenter(centered, new Vector3());
if (center.y !== 1.5) throw new Error('auto-aim did not target center mass');
