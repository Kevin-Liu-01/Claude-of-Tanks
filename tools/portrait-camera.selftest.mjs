import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PORTRAIT_SIDE_RATIO, portraitSideRatios } from './portrait-camera.ts';
import { TANK_PORTRAIT_FRAME_POLICY as policy } from '../src/ui/portraitFraming.ts';

// 268: the angle portrait's azimuth comes from the card, never a per-id row. The page draws every tank at the standard
// azimuth and, only where that card leaves the fleet envelope, at the first azimuth of a fixed ladder (side-on before head-on) whose card
// passes the shared audit. Round 31 (owner 2026-09-20): the portraits face LEFT, so every azimuth is positive.
const ratios = portraitSideRatios();
assert.equal(PORTRAIT_SIDE_RATIO, 0.56, 'the fleet standard azimuth is unchanged');
assert.equal(ratios[0], PORTRAIT_SIDE_RATIO, 'the standard is tried first, so a card that fits there keeps its camera');
assert.deepEqual(ratios.slice(1, 5), [0.58, 0.6, 0.62, 0.64], 'then side-on step by step');
assert.equal(new Set(ratios).size, ratios.length, 'no azimuth twice');
assert.ok(ratios.every((ratio) => ratio > 0), 'the camera stands on the flank that points the bow left');
assert.deepEqual([Math.min(...ratios), Math.max(...ratios)], [0.3, 1.3], 'a bounded ladder');
const sideOn = ratios.filter((ratio) => ratio > PORTRAIT_SIDE_RATIO), headOn = ratios.filter((ratio) => ratio < PORTRAIT_SIDE_RATIO);
assert.deepEqual(ratios, [PORTRAIT_SIDE_RATIO, ...sideOn, ...headOn], 'every side-on azimuth before any head-on one');
assert.ok(sideOn.every((ratio, i) => i === 0 || ratio > sideOn[i - 1]), 'side-on outward from the standard');
assert.ok(headOn.every((ratio, i) => i === 0 || ratio < headOn[i - 1]), 'head-on outward from the standard, last');

// no per-id row anywhere on the portrait path (the eight azimuth rows and the Challenger 3 cushion went in 268)
const camera = fs.readFileSync(new URL('./portrait-camera.ts', import.meta.url), 'utf8');
assert.doesNotMatch(camera, /\bid\b/, 'portrait-camera.ts takes no id');
// 2026-09-12 fleet visual standard batch: the audit's full-height envelope is
// 1.27 (was 1.25) — challenger3_proto (1.2511) and ztz85 sat on the old line after
// the surface-mouth reseat; the framing ratios themselves are unchanged.
assert.deepEqual([policy.widthRatio, policy.heightRatio, policy.baselineRatio,
  policy.auditMaxFullWidthRatio, policy.auditMaxFullHeightRatio],
  [.54, .68, .88, .88, 1.27], 'dense chassis scale, contact baseline and full silhouette pixel gates stay unchanged');
const html = fs.readFileSync(new URL('./icons-page.html', import.meta.url), 'utf8');
const angle = html.slice(html.indexOf("if (wants('angle'))"), html.indexOf('return { files, meta, portrait };'));
assert.ok(angle.length > 0, 'the angle block is found');
assert.doesNotMatch(angle, /id ===|id !==|\[id\]/, 'the angle block frames no id by name');
assert.match(angle, /const dist = \(radius \* MARGIN\) \//, 'one camera margin for every tank');
assert.match(angle, /for \(const ratio of portraitSideRatios\(\)\) \{\s*const dir = new THREE\.Vector3\(ratio, 0\.34, 1\.0\)/);
assert.match(angle, /angleSource = capture\(angleCam, BASE \* 2, BASE \* 2\);[^]*?angleCanvas = normalizeAnglePortrait\(angleSource, BASE\);\s*thumbCanvas = normalizeAnglePortrait\(angleSource, BASE \/ 2\);\s*portraitAudit = auditPortraitCanvas\(thumbCanvas\);/,
  'each candidate draws both sizes in the shipped order (512 px first: a thumbnail drawn first resamples differently) and is judged by the shared audit on the card it would ship');
assert.match(angle, /if \(portraitAudit\.passes\) break;/, 'the first passing azimuth is kept');
assert.match(angle, /if \(!portraitAudit\.passes\) \{\s*throw new Error/, 'actual raster framing gate remains mandatory');
assert.match(angle, /normalizeAnglePortrait\(angleSource, BASE\)/);
assert.doesNotMatch(angle, /\.visible\s*=|\.scale\.set|\.geometry\s*=|\.rotation\./, 'no geometry hiding, scaling or pose change to pass the portrait gate');
assert.equal((html.match(/portraitSideRatios\(\)/g) || []).length, 1, 'azimuth applies only to angle portrait, not orthographic/technical captures');
console.log(`portrait-camera: the azimuth is derived from the card (${ratios.length} ladder azimuths from ${PORTRAIT_SIDE_RATIO}), no per-id rows, pixel limits preserved`);
