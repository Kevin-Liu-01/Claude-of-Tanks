// Skybridge Chasm's reservoir arm as data (the map-revival lane, 2026-10-08, round 6): skybridgeArm.generated.ts is the
// current output of skybridgeArm.ts (tools/skybridge-arm.mjs --check), and the map config reads it — the arm's course is a
// meander whose tightest bend clears the canyon's reach, its widths run from the slot head to the dam's span, its water
// discs and kerbs are the computation's, and the head's boulders stand on the plain.
import assert from 'node:assert/strict';
import { renderSkybridgeArm } from '../../../tools/skybridge-arm.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SKYBRIDGE_ARM } from './skybridgeArm.generated.ts';
import { getMapConfig } from './index.ts';
import { prepareLandformPath } from '../landformPath.ts';
import { createHeightField } from '../terrain.ts';

const generated = readFileSync(fileURLToPath(new URL('./skybridgeArm.generated.ts', import.meta.url)), 'utf8');
assert.equal(generated, renderSkybridgeArm(), 'skybridgeArm.generated.ts is current (node tools/skybridge-arm.mjs)');
const cfg = getMapConfig('skybridge');
assert.equal(cfg.terrain.lakes, SKYBRIDGE_ARM.lakes, 'the map reads the generated water');
assert.ok(cfg.terrain.landforms.includes(SKYBRIDGE_ARM.landforms[0]), 'and the generated arm');
const { arm } = SKYBRIDGE_ARM;
const path = prepareLandformPath(arm.path, Math.max(...arm.widths) * 1.04 + 4);
assert.ok(path.minRadius > arm.widths[0] * 1.04 + 4 && path.minRadius > 28, `the meander's tightest bend (${path.minRadius.toFixed(1)} m) clears the canyon`);
assert.ok(arm.widths[0] < 16 && arm.widths[arm.widths.length - 1] === arm.endHalf, 'a slot head, the dam\'s span at the end');
assert.ok(SKYBRIDGE_ARM.lakes.length < 100, `the water in fewer than a hundred discs (${SKYBRIDGE_ARM.lakes.length})`);
const field = createHeightField(1337, cfg);
for (const rock of SKYBRIDGE_ARM.rocks) {
  assert.ok(field.getHeightAt(rock.x, rock.z) > -1 && field.getWaterMaskAt(rock.x, rock.z) === 0, `a brow boulder on the plain (${rock.x}, ${rock.z})`);
}
assert.ok(SKYBRIDGE_ARM.dam.rimGuards.length === 2, 'kerbs only where the road meets the rim');
console.log(`skybridgeArm.selftest: the generated arm is current — a ${arm.length.toFixed(0)} m meander (tightest bend ${path.minRadius.toFixed(0)} m), ${SKYBRIDGE_ARM.lakes.length} water discs, ${SKYBRIDGE_ARM.sides.length} side canyons, ${SKYBRIDGE_ARM.rocks.length} brow boulders, ${SKYBRIDGE_ARM.dam.rimGuards.length} road kerbs`);
