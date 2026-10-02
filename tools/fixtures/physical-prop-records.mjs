import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const digest = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');

// Compare authored physical identity across material rebatching and donor
// replacement. Numeric runtime indices and Three.js UUIDs are not identities.
export function physicalPropRecords(value, props) {
  return JSON.parse(JSON.stringify(value, function(key, item) {
    if ((key === 'propIdx' || key === '_destructibleIndex') && Number.isInteger(item) && item >= 0) {
      const owner = props.destructibles[item];
      assert.ok(owner, 'every physical prop index resolves to a destruction owner');
      if (key === '_destructibleIndex') assert.equal(owner, this, 'the destruction index resolves to this exact record');
      return [owner.kind, owner.x, owner.y, owner.z, owner.yaw, owner.sc, owner.r, owner.h, owner.slot];
    }
    if (key !== 'clutter' || !item) return item;
    return {
      kind: item.kind, x: item.x, y: item.y, z: item.z, r: item.r, h: item.h,
      obstacles: item.obstacles, colliders: item.colliders,
      spans: item.spans.map(span => {
        const first = span.first * 3, end = first + span.homePosition.length;
        assert.deepEqual(span.position.array.slice(first, end), span.homePosition,
          'clutter binding addresses its intact authored position bytes');
        assert.deepEqual(span.normal.array.slice(first, end), span.homeNormal,
          'clutter binding addresses its intact authored normal bytes');
        return {position: digest(span.homePosition), normal: digest(span.homeNormal)};
      }),
      instances: item.instances.map(({mesh, slot, home}) => {
        assert.deepEqual(Array.from(mesh.instanceMatrix.array.slice(slot * 16, slot * 16 + 16)),
          Array.from(new Float32Array(home.elements)), 'clutter instance addresses its intact home transform');
        return {slot, home: home.elements};
      }),
    };
  }));
}
