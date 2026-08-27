import assert from 'node:assert/strict';
import {
  createShotDiagramProjection,
  impactForShotDiagram,
} from './shotDiagramProjection.js';
import {
  presentationAnchorFor,
  presentationProjectionFor,
} from '../vehicles/presentationAnchors.generated.js';

// AMX 56 is the reported case. Its icon is presentation-centred near the
// hull, while the old readout treated the long forward gun as if it moved the
// image centre 1.5 m forward. A real rear-plate hit consequently plotted off
// the silhouette in both views.
const amx56 = {
  dims: { hullLengthM: 6.88, overallLengthM: 9.87, widthM: 3.72, heightM: 2.88 },
  armor: {
    turretPivot: [0, 1.6, -0.1],
    gunPivot: [0, 0.4, 0.6],
    gunBarrel: { lengthM: 6.2 },
    hullPlates: [{ verts: [
      [-1.66, 0.48, -3.54], [1.66, 0.48, -3.54],
      [1.66, 1.6, -3.54], [-1.66, 1.6, -3.54],
    ] }],
    turretPlates: [],
  },
};

const projection = createShotDiagramProjection(amx56, {
  topSize: 96,
  sideWidth: 184,
  sideHeight: 92,
  presentationAnchor: presentationAnchorFor('amx56'),
  presentationProjection: presentationProjectionFor('amx56'),
});
const topRear = projection.topPoint(0, -3.54);
const sideRear = projection.sidePoint(1.05, -3.54);
assert.ok(topRear[1] <= 96 - 6.2,
  `rear hit ring stays inside top schematic (got y=${topRear[1].toFixed(2)})`);
assert.ok(sideRear[0] >= 5.6,
  `rear hit ring stays inside side schematic (got x=${sideRear[0].toFixed(2)})`);

// A 90-degree traversed turret hit arrives in turret-local space. The static
// schematic always depicts the turret forward, so normalize only the owning
// frame translation—not the live traverse—before projecting it.
const turretImpact = impactForShotDiagram({
  impactFrame: 'turret',
  impactLocalPos: [0.25, 0.4, 1.1],
  impactLocalDir: [0, 0, -1],
  // Deliberately wrong legacy coordinates prove the exact payload wins.
  localPos: [8, 8, 8],
  localDir: [1, 0, 0],
}, amx56.armor);
assert.deepEqual(turretImpact.point, [0.25, 2, 1],
  'turret-local impact is placed in the neutral hull schematic');
assert.deepEqual(turretImpact.direction, [0, 0, -1],
  'turret-local shot direction drives the diagram arrow');

const gunImpact = impactForShotDiagram({
  impactFrame: 'gun',
  impactLocalPos: [-0.2, 0.3, 1.7],
}, amx56.armor);
assert.ok(Math.abs(gunImpact.point[0] + 0.2) < 1e-12 &&
  Math.abs(gunImpact.point[1] - 1.9) < 1e-12 &&
  Math.abs(gunImpact.point[2] - 1.6) < 1e-12,
  'gun-follow armor uses turret-origin coordinates in the neutral diagram');

const legacyImpact = impactForShotDiagram({ localPos: [1, 2, 3], localDir: [0, 1, 0] }, amx56.armor);
assert.deepEqual(legacyImpact, { point: [1, 2, 3], direction: [0, 1, 0] },
  'legacy hull-local events remain compatible');

console.log('shotDiagramProjection.selftest: impact frames remain aligned with both schematics');
