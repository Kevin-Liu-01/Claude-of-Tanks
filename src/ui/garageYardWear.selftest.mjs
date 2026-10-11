import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GARAGE_YARD_WEAR, garageYardWearTexture } from './garageYardWear.ts';
import { GARAGE_PLATFORM_GEOMETRY } from '../game/garagePresentationPose.ts';

// 2026-10-10 (the owner: "more detailed ... better textures"): every outdoor pack's paved hardstand carries the shared
// service-yard wear decal (track lanes from its approach road, the turntable's grime ring, oil stains, worn bay paint).

// plain Node has no canvas: the decal is skipped, never faked
assert.equal(garageYardWearTexture(), null, 'no canvas, no decal');

// the painted area fades out inside the 29 x 24 m hardstand in any approach yaw
assert.equal(GARAGE_YARD_WEAR.widthM, 29);
assert.equal(GARAGE_YARD_WEAR.depthM, 24);
assert.ok(GARAGE_YARD_WEAR.radiusM <= GARAGE_YARD_WEAR.depthM / 2 - 0.1,
  `the decal's paint (radius ${GARAGE_YARD_WEAR.radiusM} m) stays on the hardstand whatever its yaw`);
assert.ok(Math.abs(GARAGE_YARD_WEAR.canvasH / GARAGE_YARD_WEAR.canvasW - 24 / 29) < 0.01, 'square texels on the yard');

const kit = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const wear = await readFile(new URL('./garageYardWear.ts', import.meta.url), 'utf8');
assert.match(kit, /const yardWear = garageYardWearTexture\(/, 'each outdoor pack lays the yard wear');
assert.match(kit, /yard\.position\.y = GARAGE_PLATFORM_GEOMETRY\.groundSurfaceYM \+ 0\.004;/,
  'the decal lies on the hardstand top, below the turntable base');
assert.ok(GARAGE_PLATFORM_GEOMETRY.groundSurfaceYM + 0.004 < 0, 'below the platform bottom (y = 0)');
assert.match(kit, /yard\.receiveShadow = true;\s*yard\.castShadow = false;/, 'the decal receives the settled shadow, casts none');
assert.match(kit, /plainMaterial\(\{\s*map: yardWear, transparent: true, depthWrite: false/,
  'one transparent shadow-set-up material on the shared texture');
assert.doesNotMatch(kit, /track\(yardWear\)/, 'a pack never disposes the shared texture');
assert.match(kit, /Math\.atan2\(-toward\.x, -toward\.z\)/, 'the track lanes point down the pack\'s own approach road');
assert.match(wear, /let sharedTexture: THREE\.CanvasTexture \| null = null;/, 'one texture per page, shared by every pack');
assert.doesNotMatch(wear, /requestAnimationFrame|setInterval|addEventListener/, 'no per-frame or event work');

console.log('garageYardWear.selftest: shared yard wear sits on every outdoor hardstand inside its bounds');
