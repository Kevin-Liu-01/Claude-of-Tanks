import assert from 'node:assert/strict';
import fs from 'node:fs';
import { portraitSideRatio } from './portrait-camera.ts';
import { FLEET_GROUP_IDS } from '../src/vehicles/fleetManifest.ts';
import { TANK_PORTRAIT_FRAME_POLICY as policy } from '../src/ui/portraitFraming.ts';

// Before this change only KF51 opted into the side-on direction. These are the
// only two changed existing IDs. Lynx and Barak have their own verified
// tall-fitting portrait directions; every other original or X keeps its camera.
// Round 31 (owner 2026-09-20): the portraits face LEFT — every azimuth ratio is the mirror of the 2026-09 values.
const changed = new Set(['t72b3_x', 'strv122_x']);
// Mirrored, the KF51's full silhouette measured 123.8 card px against the 123.2 px envelope, so its azimuth is a
// touch more frontal (0.72); the T-72B3 X and Strv 122 X keep the side-on 0.76.
const sourceDirections = new Map([['kf41_lynx_x', 0.86], ['merkava4_barak', 0.70], ['kf51_x', 0.72]]);
for (const id of [...Object.values(FLEET_GROUP_IDS).flat(), 'unknown-id']) {
  const expected = sourceDirections.get(id) ?? (changed.has(id) ? 0.76 : 0.56);
  assert.equal(portraitSideRatio(id), expected, `${id}: exact portrait-only azimuth (bow to the left)`);
  assert.ok(portraitSideRatio(id) > 0, `${id}: the camera stands on the flank that points the bow left`);
}
// 2026-09-12 fleet visual standard batch: the audit's full-height envelope is
// 1.27 (was 1.25) — challenger_3 (1.2511) and ztz85 sat on the old line after
// the surface-mouth reseat; the framing ratios themselves are unchanged.
assert.deepEqual([policy.widthRatio, policy.heightRatio, policy.baselineRatio,
  policy.auditMaxFullWidthRatio, policy.auditMaxFullHeightRatio],
  [.54, .68, .88, .88, 1.27], 'dense chassis scale, contact baseline and full silhouette pixel gates stay unchanged');
const html = fs.readFileSync(new URL('./icons-page.html', import.meta.url), 'utf8');
const angle = html.slice(html.indexOf("if (wants('angle'))"), html.indexOf('return { files, meta };'));
assert.match(angle, /new THREE\.Vector3\(portraitSideRatio\(id\), 0\.34, 1\.0\)/);
assert.match(angle, /capture\(angleCam, BASE \* 2, BASE \* 2\)/);
assert.match(angle, /normalizeAnglePortrait\(angleSource, BASE\)/);
assert.match(angle, /normalizeAnglePortrait\(angleSource, BASE \/ 2\)/);
assert.match(angle, /if \(!portraitAudit\.passes\)/, 'actual raster framing gate remains mandatory');
assert.doesNotMatch(angle, /\.visible\s*=|\.scale\.set|\.geometry\s*=|\.rotation\./, 'no geometry hiding, scaling or pose change to pass the portrait gate');
assert.equal((html.match(/portraitSideRatio\(id\)/g) || []).length, 1, 'azimuth applies only to angle portrait, not orthographic/technical captures');
console.log('portrait-camera: scoped azimuths, unchanged original directions and alpha/core/baseline/pixel limits preserved');
