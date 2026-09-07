import assert from 'node:assert/strict';
import fs from 'node:fs';
import { portraitSideRatio } from './portrait-camera.ts';
import { FLEET_GROUP_IDS } from '../src/vehicles/fleetManifest.ts';
import { TANK_PORTRAIT_FRAME_POLICY as policy } from '../src/ui/portraitFraming.ts';

// Before this change only KF51 opted into the side-on direction. These are the
// only two newly changed IDs; every original or other X keeps its exact camera.
const changed = new Set(['t72b3_x', 'strv122_x']);
for (const id of [...Object.values(FLEET_GROUP_IDS).flat(), 'unknown-id']) {
  const expected = changed.has(id) || id === 'kf51_x' ? -0.76 : -0.56;
  assert.equal(portraitSideRatio(id), expected, `${id}: exact portrait-only azimuth`);
}
assert.deepEqual([policy.widthRatio, policy.heightRatio, policy.baselineRatio,
  policy.auditMaxFullWidthRatio, policy.auditMaxFullHeightRatio],
  [.54, .68, .88, .88, 1.25], 'dense chassis scale, contact baseline and full silhouette pixel gates stay unchanged');
const html = fs.readFileSync(new URL('./icons-page.html', import.meta.url), 'utf8');
const angle = html.slice(html.indexOf("if (wants('angle'))"), html.indexOf('return { files, meta };'));
assert.match(angle, /new THREE\.Vector3\(portraitSideRatio\(id\), 0\.34, 1\.0\)/);
assert.match(angle, /capture\(angleCam, BASE \* 2, BASE \* 2\)/);
assert.match(angle, /normalizeAnglePortrait\(angleSource, BASE\)/);
assert.match(angle, /normalizeAnglePortrait\(angleSource, BASE \/ 2\)/);
assert.match(angle, /if \(!portraitAudit\.passes\)/, 'actual raster framing gate remains mandatory');
assert.doesNotMatch(angle, /\.visible\s*=|\.scale\.set|\.geometry\s*=|\.rotation\./, 'no geometry hiding, scaling or pose change to pass the portrait gate');
assert.equal((html.match(/portraitSideRatio\(id\)/g) || []).length, 1, 'azimuth applies only to angle portrait, not orthographic/technical captures');
console.log('portrait-camera: exact two-ID azimuth correction, all other directions and alpha/core/baseline/pixel limits preserved');
