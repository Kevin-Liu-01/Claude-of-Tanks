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
const fixtures = [
  [
    "truck",
    "build",
    1337,
    4668,
    205392,
    114056,
    "65fc8a51c2b628cffaa439516170e66695cefc161e43d8bb5912db2f04a58317"
  ],
  [
    "truck",
    "broken",
    1337,
    540,
    23760,
    15072,
    "583250235507972320b98b6fd5bf739d44cbb57f89f33cf817896341e4eb4aff"
  ],
  [
    "jeep",
    "build",
    1337,
    2730,
    120120,
    69876,
    "8818e81785493574d5245effd26470909aa80c288c8e9896491c4d4d1f5072fa"
  ],
  [
    "jeep",
    "broken",
    1337,
    432,
    19008,
    12304,
    "2ab111e3a9d6f06b1b71ba6bb68d0a3ba65e65bebc56936873510185391a9415"
  ],
  [
    "sedan",
    "build",
    1337,
    2724,
    119856,
    76200,
    "4724f9dad58fba35bf351f7904b8be38db94123e4c232dc926d9653b28fa85f8"
  ],
  [
    "sedan",
    "broken",
    1337,
    432,
    19008,
    12304,
    "2ab111e3a9d6f06b1b71ba6bb68d0a3ba65e65bebc56936873510185391a9415"
  ],
  [
    "wagon",
    "build",
    1337,
    2724,
    119856,
    76200,
    "ee270767d3b1913bf991154c102471a00acc813e0bd85e6d264d248d0fc7e4a9"
  ],
  [
    "wagon",
    "broken",
    1337,
    432,
    19008,
    12304,
    "2ab111e3a9d6f06b1b71ba6bb68d0a3ba65e65bebc56936873510185391a9415"
  ],
  [
    "pickup",
    "build",
    1337,
    2904,
    127776,
    81840,
    "017f907df728e0e589e0acadce67f2dbed2cb25fdb22dda3151a55372276076f"
  ],
  [
    "pickup",
    "broken",
    1337,
    432,
    19008,
    12304,
    "4bfa1a559535238ec596de0d35691c5640d166565789453e667b34c184b87b7f"
  ],
  [
    "van",
    "build",
    1337,
    2652,
    116688,
    73944,
    "c261c6df431d3347f0a08d925578773506ac953bca910042cd0b1ee589fd11c4"
  ],
  [
    "van",
    "broken",
    1337,
    432,
    19008,
    12304,
    "5e29043d5a0c45d80f7f02bd8ed179790b49eef9db68461601275ce0dd16852a"
  ],
  [
    "truckbox",
    "build",
    1337,
    4560,
    200640,
    110672,
    "8531ff07ab2d2f16e7b20e10982d307520fb83dd7bb28a87f3fc302f3add233e"
  ],
  [
    "truckbox",
    "broken",
    1337,
    540,
    23760,
    15072,
    "583250235507972320b98b6fd5bf739d44cbb57f89f33cf817896341e4eb4aff"
  ],
  [
    "truckflatbed",
    "build",
    1337,
    4896,
    215424,
    119440,
    "2f56859d84168f9091ecb84d037b77acd4fbbffd276c399dbdddaeb3245d96b3"
  ],
  [
    "truckflatbed",
    "broken",
    1337,
    540,
    23760,
    15072,
    "583250235507972320b98b6fd5bf739d44cbb57f89f33cf817896341e4eb4aff"
  ],
  [
    "truck",
    "build",
    2049,
    4668,
    205392,
    114056,
    "d1b3fbefcee8b64daffa5ace4886d43e6cd8f06ad904894b92a0093a8a97940c"
  ],
  [
    "truck",
    "broken",
    2049,
    540,
    23760,
    15072,
    "87eedf66df2722ed85ed0720a6acd7e8359f88a988d2cc3cf237909517815c2a"
  ],
  [
    "jeep",
    "build",
    2049,
    2730,
    120120,
    69876,
    "705cf6d2ce3d2cebb7891518ef071ebdc351a33e85220009cd536e879541b1b5"
  ],
  [
    "jeep",
    "broken",
    2049,
    432,
    19008,
    12304,
    "93590a8cbdd04910468ac3b94e30bd1454911cf4918052f15874212ed8345aa8"
  ],
  [
    "sedan",
    "build",
    2049,
    2724,
    119856,
    76200,
    "708df3e81824ab0135313de92a2e9272c638ba7cc828a9b81a0f0c97bee74b67"
  ],
  [
    "sedan",
    "broken",
    2049,
    432,
    19008,
    12304,
    "93590a8cbdd04910468ac3b94e30bd1454911cf4918052f15874212ed8345aa8"
  ],
  [
    "wagon",
    "build",
    2049,
    2724,
    119856,
    76200,
    "7774f4d431bf92cde9e12ec08311f9b3c03167c0cc0b18ddb58bdbcf9d084575"
  ],
  [
    "wagon",
    "broken",
    2049,
    432,
    19008,
    12304,
    "93590a8cbdd04910468ac3b94e30bd1454911cf4918052f15874212ed8345aa8"
  ],
  [
    "pickup",
    "build",
    2049,
    2904,
    127776,
    81840,
    "4ab071ec236081b3314ef31ad3c4f9d4cc3951ab0b2ba65963799381bb23ce25"
  ],
  [
    "pickup",
    "broken",
    2049,
    432,
    19008,
    12304,
    "069d87307f0232ffe1661557f2570ee7ebdeca6f0e9dc09ceaefe9d8149facc9"
  ],
  [
    "van",
    "build",
    2049,
    2652,
    116688,
    73944,
    "115eea92619dd7089851f2f7518d7a07a3ef7ce5fb150584f6faf9c27da2066b"
  ],
  [
    "van",
    "broken",
    2049,
    432,
    19008,
    12304,
    "d1b990e42f5bf523052f90330955b75e0cac67b2c3c6037b70289d8adebb62ac"
  ],
  [
    "truckbox",
    "build",
    2049,
    4560,
    200640,
    110672,
    "1740e298a44478acf23dc2b7172b8d5ee4f4b6d4d337bb0e6d770c6a4d63996b"
  ],
  [
    "truckbox",
    "broken",
    2049,
    540,
    23760,
    15072,
    "87eedf66df2722ed85ed0720a6acd7e8359f88a988d2cc3cf237909517815c2a"
  ],
  [
    "truckflatbed",
    "build",
    2049,
    4896,
    215424,
    119440,
    "5628a8bd8ac67032ac92b43a08634a345422e99639d8dd55500cd2c87edcc924"
  ],
  [
    "truckflatbed",
    "broken",
    2049,
    540,
    23760,
    15072,
    "87eedf66df2722ed85ed0720a6acd7e8359f88a988d2cc3cf237909517815c2a"
  ],
  [
    "truck",
    "build",
    7719,
    4668,
    205392,
    114056,
    "8328f74c90de0fe9773ec1d93574f9ba56b01909157deeab03bda306acdbd43d"
  ],
  [
    "truck",
    "broken",
    7719,
    540,
    23760,
    15072,
    "a3843969abf5044f604ae728dc69a60875cc9e6fa2c06d98fa39595491dcb3f7"
  ],
  [
    "jeep",
    "build",
    7719,
    2730,
    120120,
    69876,
    "d6a9eeb288a8026e201df2388f13dba88b3e5c55ebe8d6eb79edc6726167b65e"
  ],
  [
    "jeep",
    "broken",
    7719,
    432,
    19008,
    12304,
    "104b42b3f172e075a572380e78fbcb326dcbbd362aa7de9866714df4e478fc45"
  ],
  [
    "sedan",
    "build",
    7719,
    2724,
    119856,
    76200,
    "149c2ce052c99f1539617cfaf5a0f6cdc66a1d3b5ff641a487c814a734201393"
  ],
  [
    "sedan",
    "broken",
    7719,
    432,
    19008,
    12304,
    "104b42b3f172e075a572380e78fbcb326dcbbd362aa7de9866714df4e478fc45"
  ],
  [
    "wagon",
    "build",
    7719,
    2724,
    119856,
    76200,
    "cc66f61149f94d8d36cd676cc88fe32d42157207bf3e45d371d2b26b7253936d"
  ],
  [
    "wagon",
    "broken",
    7719,
    432,
    19008,
    12304,
    "104b42b3f172e075a572380e78fbcb326dcbbd362aa7de9866714df4e478fc45"
  ],
  [
    "pickup",
    "build",
    7719,
    2904,
    127776,
    81840,
    "f0f43bb717afaca03f0f0bc103dedfd8dc3bb288c6f1c27c4105c04db4603a9f"
  ],
  [
    "pickup",
    "broken",
    7719,
    432,
    19008,
    12304,
    "aaefbe2acb237ab50e79a7c716e1318d1b5d9c8b030525d9608889e5906ca9c5"
  ],
  [
    "van",
    "build",
    7719,
    2652,
    116688,
    73944,
    "1301955806dd855447838099df844697606d18cd411c628f561e5ba8a54a6a9a"
  ],
  [
    "van",
    "broken",
    7719,
    432,
    19008,
    12304,
    "239532371e21b8d7a6368c677bb486daca20306f25aa604145869de6a993855d"
  ],
  [
    "truckbox",
    "build",
    7719,
    4560,
    200640,
    110672,
    "64061115e22b09b2fd202c44a84c132d93c743ffb7f850e858455db99b2cc4cd"
  ],
  [
    "truckbox",
    "broken",
    7719,
    540,
    23760,
    15072,
    "a3843969abf5044f604ae728dc69a60875cc9e6fa2c06d98fa39595491dcb3f7"
  ],
  [
    "truckflatbed",
    "build",
    7719,
    4896,
    215424,
    119440,
    "332a8dc66982fb061ac85ef9051e7e23222392e368982e2995450c81a67fc061"
  ],
  [
    "truckflatbed",
    "broken",
    7719,
    540,
    23760,
    15072,
    "a3843969abf5044f604ae728dc69a60875cc9e6fa2c06d98fa39595491dcb3f7"
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

