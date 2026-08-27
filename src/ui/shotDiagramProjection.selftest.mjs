import assert from 'node:assert/strict';
import { createShotDiagramProjection } from './shotDiagramProjection.js';
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

console.log('shotDiagramProjection.selftest: rear impact remains on both schematics');
