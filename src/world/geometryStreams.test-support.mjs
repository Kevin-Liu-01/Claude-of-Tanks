// The drawn-geometry shape check (the map-vehicles lane, 2026-10-07): every geometry the game draws keeps V8's fast
// properties on its attributes object. geometryStreams.ts says why: deleteAttribute leaves dictionary mode, and one such
// geometry drawn every frame slows three's per-frame update of every geometry. %HasFastProperties is V8 natives syntax;
// the flag is set at runtime, so a receipt reads the answer in its own process. drawnGeometryShape.selftest walks every
// map and garage; the fleet pass (fleetPassHigh) walks every tank on its one shared build.
import assert from 'node:assert/strict';
import v8 from 'node:v8';

let fastProperties = null;

/** V8's own answer: does this object keep fast properties (not dictionary mode)? */
export function hasFastProperties(object) {
  if (!fastProperties) {
    v8.setFlagsFromString('--allow-natives-syntax');
    fastProperties = new Function('o', 'return %HasFastProperties(o)');
  }
  return fastProperties(object);
}

/** Walk every node under `root` that holds a geometry; push `label: node` for each attributes object left slow. */
export function auditDrawnGeometry(root, label, offenders) {
  let walked = 0;
  root.traverse((node) => {
    if (!node.geometry?.attributes) return;
    walked++;
    if (!hasFastProperties(node.geometry.attributes)) offenders.push(`${label}: ${node.name || node.type}`);
  });
  return walked;
}

/** The fleet pass's audit: every tank's drawn geometries keep fast attribute objects. Reads only. */
export function createDrawnGeometryShapeAudit() {
  let walked = 0, tanks = 0;
  return {
    check(id, tank) {
      const offenders = [];
      walked += auditDrawnGeometry(tank.root, id, offenders);
      tanks++;
      assert.deepEqual(offenders.slice(0, 20), [], `${id}: ${offenders.length} drawn geometries left in dictionary mode `
        + '(build them with geometryStreams.ts keepStreams, never trim them with deleteAttribute)');
    },
    finish() {
      console.log(`fleet drawn geometries: ${walked} on ${tanks} tanks keep fast attribute objects`);
    },
  };
}
