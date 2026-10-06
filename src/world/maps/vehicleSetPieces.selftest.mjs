import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SET_PIECE_SIZE, buildSetPiece } from './vehicleSetPieces.ts';
import { MAP_IDS, getMapConfig } from './index.ts';

// The map-vehicles lane (P5, 2026-10-06): every built set piece stands on y = 0 inside its declared footprint and
// height in the painted bucket's streams, whole and wrecked, its triangles bounded, rebuilt byte for byte; every map's
// authored set pieces name a built kind, and a symmetric map's pieces come in rotated twins.

const digest = (g) => {
  const hash = createHash('sha256');
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array; hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const i = g.index.array; hash.update(Buffer.from(i.buffer, i.byteOffset, i.byteLength));
  return hash.digest('hex');
};

const BUILT = ['lrv', 'k2tram', 'stz3', 'an26'];
let worst = 0;
for (const kind of BUILT) {
  const size = SET_PIECE_SIZE[kind];
  for (const wrecked of [false, true]) {
    const g = buildSetPiece(kind, { wrecked });
    try {
      assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], `${kind}: the painted bucket's streams`);
      for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite), `${kind}: finite`);
      g.computeBoundingBox();
      const b = g.boundingBox;
      assert.ok(Math.abs(b.min.y) < 1e-4, `${kind}: stands on y = 0`);
      // the solids (the dressing left out: an airliner's wings, a tram's door leaves) inside the record's box
      const p = g.attributes.position.array, skip = g.userData.noCollisionVertices;
      let hw = 0, hl = 0;
      for (let v = 0; v < p.length / 3; v++) {
        if (skip && skip[v]) continue;
        hw = Math.max(hw, Math.abs(p[v * 3])); hl = Math.max(hl, Math.abs(p[v * 3 + 2]));
      }
      assert.ok(hw <= size.hw + 0.15, `${kind}${wrecked ? ' wrecked' : ''}: inside its half-width (${hw.toFixed(2)})`);
      assert.ok(hl <= size.hl + 0.15, `${kind}${wrecked ? ' wrecked' : ''}: inside its half-length (${hl.toFixed(2)})`);
      assert.ok(b.max.y <= size.h + 0.9, `${kind}: its height (${b.max.y.toFixed(2)}; masts and antennas over the record)`);
      const tris = g.index.count / 3;
      worst = Math.max(worst, tris);
      assert.ok(tris <= 12000, `${kind}: ${tris} triangles`);
      const again = buildSetPiece(kind, { wrecked });
      assert.equal(digest(again), digest(g), `${kind}: a rebuild is byte-identical`);
      again.dispose();
    } finally { g.dispose(); }
  }
}

let pieces = 0;
for (const mapId of MAP_IDS) {
  const authored = getMapConfig(mapId).props?.vehicleSetPieces ?? [];
  for (const piece of authored) {
    pieces++;
    assert.ok(BUILT.includes(piece.kind), `${mapId}: ${piece.kind} is built`);
    assert.ok(Number.isFinite(piece.x) && Number.isFinite(piece.z) && Number.isFinite(piece.yawDeg), `${mapId}: a seated piece`);
  }
}
// the Moon's rovers: by the ascent stage and, at the outpost's rotation, by the landing pad
const moon = getMapConfig('moon').props.vehicleSetPieces;
assert.equal(moon.length, 2, 'two rovers on the Moon');
assert.ok(Math.abs(moon[0].x + moon[1].x) < 1e-9 && Math.abs(moon[0].z + moon[1].z) < 1e-9, 'twins about the landing field');
assert.equal(((moon[0].yawDeg - moon[1].yawDeg) % 360 + 360) % 360, 180, 'the twin turned through 180 degrees');

console.log(`vehicleSetPieces.selftest: ${BUILT.length} kind(s) whole and wrecked on the ground inside their records (worst ${worst} `
  + `triangles), byte-identical; ${pieces} authored pieces, the Moon's rovers twinned`);
