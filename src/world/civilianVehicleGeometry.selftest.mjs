import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CIVILIAN_VEHICLE_RECEIPTS } from './maps/civilianVehicleKit.ts';
import { deriveRuntimeStructureCollisionProfile } from './structureCollision.ts';

// Immutable actual non-indexed owner observations before the storage change:
// source SHA 658511e13f1b3b8f4178f9074ecf3f039f54a4d242a6d77dbb8694f9ab18ef20;
// paired proof SHA 061401e10ee8a3217fe5132744e0be48086d2727bad4d07737b2883c46fa9c1a.
// Each fingerprint covers the full ordered raw attribute stream, metadata,
// bounds, sphere, collision bands and seeded RNG consumption; never rebake it
// merely because a geometry/storage implementation changes.
// [kind, builder, seed, logical corners, original bytes, indexed bytes, SHA]
// 2026-09-19 hitbox pass: the 48 SHAs were re-baked once because the collision profile they include changed
// (per-part vertical extents, 0.5 m clipped shell bands); a collision-free twin of this fingerprint matched
// origin/main on every fixture, so the rendered attribute streams, bounds and RNG tails are unchanged.
const fixtures = [
  [
    "truck",
    "build",
    1337,
    4668,
    205392,
    114056,
    "4a8cbe2ef7ea47593976ccd4f688070d1233adaaad21d899d9e714415ec8ae70"
  ],
  [
    "truck",
    "broken",
    1337,
    540,
    23760,
    15072,
    "a203b859bb9ae84f2a361fd09255e6894afa66e70ea94878d5d8a6b579ec5615"
  ],
  [
    "jeep",
    "build",
    1337,
    2730,
    120120,
    69876,
    "0befcd5dea55aac3b322b30473bd41ef7bcff3f2e32504ee5f3c0cff798ef473"
  ],
  [
    "jeep",
    "broken",
    1337,
    432,
    19008,
    12304,
    "92b28b948eb6f0e818e044f39897e3c14bfb4f739ea76d9af238fa1113c115ef"
  ],
  [
    "sedan",
    "build",
    1337,
    2724,
    119856,
    76200,
    "d3dc940d6303615f167b208f8f7c17d3bdc3d2107d80c7b439bd740391eab8ee"
  ],
  [
    "sedan",
    "broken",
    1337,
    432,
    19008,
    12304,
    "92b28b948eb6f0e818e044f39897e3c14bfb4f739ea76d9af238fa1113c115ef"
  ],
  [
    "wagon",
    "build",
    1337,
    2724,
    119856,
    76200,
    "24783b1e515711a5cff03539154e261bb458143d4bea0ec180842320f096ebfd"
  ],
  [
    "wagon",
    "broken",
    1337,
    432,
    19008,
    12304,
    "92b28b948eb6f0e818e044f39897e3c14bfb4f739ea76d9af238fa1113c115ef"
  ],
  [
    "pickup",
    "build",
    1337,
    2904,
    127776,
    81840,
    "8825e282f49ed074fa7bca47bbee4e6e05361734b5ddcb5bfe24e44d1535477c"
  ],
  [
    "pickup",
    "broken",
    1337,
    432,
    19008,
    12304,
    "7411e3abd3c98bb85623d107333596954d227b0260ff8308da5949c49d4a44cc"
  ],
  [
    "van",
    "build",
    1337,
    2652,
    116688,
    73944,
    "24bf3610b43078498ae29454138fd4049029c6648f08ff6d15a246e66e59a80e"
  ],
  [
    "van",
    "broken",
    1337,
    432,
    19008,
    12304,
    "65f2a3ed865b556391812a4c942db92b8b708730f86c7bb64b050e46094d9388"
  ],
  [
    "truckbox",
    "build",
    1337,
    4560,
    200640,
    110672,
    "e4130ed0b70b752e6d054a35c5ee3cf512e0b48aa7162170b7eb62ba11f1eb6f"
  ],
  [
    "truckbox",
    "broken",
    1337,
    540,
    23760,
    15072,
    "a203b859bb9ae84f2a361fd09255e6894afa66e70ea94878d5d8a6b579ec5615"
  ],
  [
    "truckflatbed",
    "build",
    1337,
    4896,
    215424,
    119440,
    "50b7f514fde4cd2d83037c5a6af6608828b163be78aff528714373cdf21a36cc"
  ],
  [
    "truckflatbed",
    "broken",
    1337,
    540,
    23760,
    15072,
    "a203b859bb9ae84f2a361fd09255e6894afa66e70ea94878d5d8a6b579ec5615"
  ],
  [
    "truck",
    "build",
    2049,
    4668,
    205392,
    114056,
    "ec8b952ae29b8bd5a556affb568645fd9257ee3af7834b68f60e84e9e02d460a"
  ],
  [
    "truck",
    "broken",
    2049,
    540,
    23760,
    15072,
    "49986fbbe430785d2934f8fca8aacb00ad5fe5d94368bfd299de169245b2a1c1"
  ],
  [
    "jeep",
    "build",
    2049,
    2730,
    120120,
    69876,
    "9f178ecff64245174b136cae7beb95cb87a1c9c63c4e13a18d34c07f07e0561d"
  ],
  [
    "jeep",
    "broken",
    2049,
    432,
    19008,
    12304,
    "6b191283282c14b8b410759dfef968ad42c24ee130691df91526b9f128004ab1"
  ],
  [
    "sedan",
    "build",
    2049,
    2724,
    119856,
    76200,
    "7df39cecc4a69dd0150535839ce37bec26094eb95276c93c7b47aedde16e0603"
  ],
  [
    "sedan",
    "broken",
    2049,
    432,
    19008,
    12304,
    "6b191283282c14b8b410759dfef968ad42c24ee130691df91526b9f128004ab1"
  ],
  [
    "wagon",
    "build",
    2049,
    2724,
    119856,
    76200,
    "cf6b32cdc368d255fe04d7e48607567a1c8f0d962f6a4461749b1e182f34206f"
  ],
  [
    "wagon",
    "broken",
    2049,
    432,
    19008,
    12304,
    "6b191283282c14b8b410759dfef968ad42c24ee130691df91526b9f128004ab1"
  ],
  [
    "pickup",
    "build",
    2049,
    2904,
    127776,
    81840,
    "156df2ff104905459315b1ebe6b611b16277675819500c0100b701b98db5d859"
  ],
  [
    "pickup",
    "broken",
    2049,
    432,
    19008,
    12304,
    "0816ff23a001cdb864d825aadd283a43a613819736ca423d9484bfb432374f85"
  ],
  [
    "van",
    "build",
    2049,
    2652,
    116688,
    73944,
    "e26df5c76a7c666e38a02604f2bb9a13f069ea41d4840d2f130723fd179c0345"
  ],
  [
    "van",
    "broken",
    2049,
    432,
    19008,
    12304,
    "edcf6b1e1bd69ce94cd79887cef10dba8de3c08bfd122e76850fa2a965535b38"
  ],
  [
    "truckbox",
    "build",
    2049,
    4560,
    200640,
    110672,
    "b2191b0c6d13be03f9a0264222987c486d2f7fa5e76f0e0295742feaa5ff5fec"
  ],
  [
    "truckbox",
    "broken",
    2049,
    540,
    23760,
    15072,
    "49986fbbe430785d2934f8fca8aacb00ad5fe5d94368bfd299de169245b2a1c1"
  ],
  [
    "truckflatbed",
    "build",
    2049,
    4896,
    215424,
    119440,
    "f3487887a88f68e6518ad500c656bc28498977ff6da08314cbf530b0b7c11da5"
  ],
  [
    "truckflatbed",
    "broken",
    2049,
    540,
    23760,
    15072,
    "49986fbbe430785d2934f8fca8aacb00ad5fe5d94368bfd299de169245b2a1c1"
  ],
  [
    "truck",
    "build",
    7719,
    4668,
    205392,
    114056,
    "7c6317103987e7637ea292f1990097743e534301c41ec3b97df4e251cf274e34"
  ],
  [
    "truck",
    "broken",
    7719,
    540,
    23760,
    15072,
    "ca931e56faaec4db14479cb81dba8dfe3b04b436a5bae552c56c72ab95b7a501"
  ],
  [
    "jeep",
    "build",
    7719,
    2730,
    120120,
    69876,
    "8f082c32c11d7d2367bee103904b58af2ffc39567b7221794b33391999912af2"
  ],
  [
    "jeep",
    "broken",
    7719,
    432,
    19008,
    12304,
    "cbb71de2c70e92ac4a642b50eafb9ef2e9b9d18fc2decab032713417c55ff39f"
  ],
  [
    "sedan",
    "build",
    7719,
    2724,
    119856,
    76200,
    "d7180a25841cb8a03fcc9716ea3993c8eacab27035b58c2238be2ab7a33dd74b"
  ],
  [
    "sedan",
    "broken",
    7719,
    432,
    19008,
    12304,
    "cbb71de2c70e92ac4a642b50eafb9ef2e9b9d18fc2decab032713417c55ff39f"
  ],
  [
    "wagon",
    "build",
    7719,
    2724,
    119856,
    76200,
    "46d0e9acce62c7b176f071d7141fdd8321cda76bc4da4a8d6c87d3a6341701fc"
  ],
  [
    "wagon",
    "broken",
    7719,
    432,
    19008,
    12304,
    "cbb71de2c70e92ac4a642b50eafb9ef2e9b9d18fc2decab032713417c55ff39f"
  ],
  [
    "pickup",
    "build",
    7719,
    2904,
    127776,
    81840,
    "71cbe3b4fd09aad3691b1d33918df953e486bbb6e5b3bee75b2dd2ae097d2298"
  ],
  [
    "pickup",
    "broken",
    7719,
    432,
    19008,
    12304,
    "ca712a032f87d8960277cf372a6520e1cafd68f001da224aee4ceaf4e61ba7dc"
  ],
  [
    "van",
    "build",
    7719,
    2652,
    116688,
    73944,
    "31bb1979a251640435c08b88eea759b4869468c9a5ebeb547de95d8d3d4f3416"
  ],
  [
    "van",
    "broken",
    7719,
    432,
    19008,
    12304,
    "1c886d48e17bb8ef997c10e5d742c5d93b79fd020d57a60798e6dc0a6c4995f6"
  ],
  [
    "truckbox",
    "build",
    7719,
    4560,
    200640,
    110672,
    "7aaf5882bac8a929fee04af4619902ae515f6cee4f8fad6c154f8cf70d3475be"
  ],
  [
    "truckbox",
    "broken",
    7719,
    540,
    23760,
    15072,
    "ca931e56faaec4db14479cb81dba8dfe3b04b436a5bae552c56c72ab95b7a501"
  ],
  [
    "truckflatbed",
    "build",
    7719,
    4896,
    215424,
    119440,
    "4b94a74804c22f7322654dfefb5662f48d72700a423ff46058559cc4ca065b1c"
  ],
  [
    "truckflatbed",
    "broken",
    7719,
    540,
    23760,
    15072,
    "ca931e56faaec4db14479cb81dba8dfe3b04b436a5bae552c56c72ab95b7a501"
  ]
];

function seeded(seed) {
  const next = () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    next.calls++;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  next.calls = 0;
  return next;
}

function orderedWords(geometry, attribute) {
  assert.equal(attribute.array.constructor, Float32Array);
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  const source = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length);
  const words = new Uint32Array(count * attribute.itemSize);
  for (let corner = 0; corner < count; corner++) {
    const row = geometry.index?.array[corner] ?? corner;
    if (geometry.index?.array instanceof Uint16Array) assert.notEqual(row, 65535, 'no primitive-restart token');
    assert.ok(Number.isInteger(row) && row >= 0 && row < attribute.count);
    for (let item = 0; item < attribute.itemSize; item++) {
      words[corner * attribute.itemSize + item] = source[row * attribute.itemSize + item];
    }
  }
  return words;
}

function fingerprint(geometry, calls, tail) {
  const hash = createHash('sha256');
  assert.deepEqual(Object.keys(geometry.attributes), ['position', 'normal', 'uv', 'color']);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const metadata = { name, itemSize: attr.itemSize, normalized: attr.normalized, gpuType: attr.gpuType,
      usage: attr.usage, version: attr.version, attributeName: attr.name };
    hash.update(JSON.stringify(metadata)); hash.update(Buffer.from(orderedWords(geometry, attr).buffer));
  }
  const shape = { corners: geometry.index?.count ?? geometry.attributes.position.count,
    groups: geometry.groups, drawRange: geometry.drawRange, bounds: geometry.boundingBox, sphere: geometry.boundingSphere };
  const collision = deriveRuntimeStructureCollisionProfile({ baked: [geometry] });
  hash.update(JSON.stringify({ shape, collision, calls, tail }));
  return hash.digest('hex');
}

let expectedSavings = 0;
for (const [kind, builder, seed, corners, originalBytes, indexedBytes, expected] of fixtures) {
  const rng = seeded(seed), geometry = CIVILIAN_VEHICLE_RECEIPTS[kind][builder](rng);
  const calls = rng.calls, tail = rng();
  try {
    assert.ok(geometry.index, 'actual kit must retain the indexed primitives');
    assert.equal(geometry.index.count, corners, 'triangles count original corners, not stored vertices');
    const bytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
      + geometry.index.array.byteLength;
    assert.equal(bytes, indexedBytes, 'retained bytes include all attributes and index');
    assert.ok(bytes < originalBytes, 'the tested owner change must make a real retained-byte saving');
    assert.equal(fingerprint(geometry, calls, tail), expected, `${kind}/${builder}/${seed} original rendered/collision fingerprint`);
    expectedSavings += originalBytes - bytes;
    if (kind !== 'truck' || builder !== 'build' || seed !== 1337) continue;
    // Reject even a one-bit attribute change and an index-order mutation,
    // not just a missing model, broad bounds change or lower triangle count.
    for (const attribute of Object.values(geometry.attributes)) {
      const words = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length);
      words[0] ^= 1;
      assert.notEqual(fingerprint(geometry, calls, tail), expected);
      words[0] ^= 1;
    }
    const indices = geometry.index.array;
    [indices[0], indices[1]] = [indices[1], indices[0]];
    assert.notEqual(fingerprint(geometry, calls, tail), expected, 'triangle winding/order is preserved');
    [indices[0], indices[1]] = [indices[1], indices[0]];
    assert.equal(fingerprint(geometry, calls, tail), expected, 'negative-control mutations are fully restored');
  } finally { geometry.dispose(); }
}
assert.equal(fixtures.length, 48, 'all eight kinds, both states and three original seeds');
assert.equal(expectedSavings, 1689324);
console.log('civilianVehicleGeometry.selftest: 48 exact original streams/colliders/RNG tails; 1,689,324 retained bytes saved across fixtures');

