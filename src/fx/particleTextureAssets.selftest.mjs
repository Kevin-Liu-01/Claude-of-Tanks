import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const expected = {
  smoke: [512, 512, '4fe7ca3b4cba2d95c095e033110d097897460521e5e3c29329278e93270642f4'],
  fire: [1024, 1024, 'b2ad43b56272b8e05db83dc45614772b9c75cb4445460316ff55644a65cbe601'],
  prop: [768, 768, 'de3aa41f2ff6e44584bfe110c94d2d3b6553504a58c492c5c73a0afa051b3cf6'],
  dust: [512, 512, 'a2bf9115a02c7fe8de3f7dc66014ace7c2582714889c5f4a70b8dee88a972752'],
  flash: [128, 128, 'be16e4b85fc4edf269c67551f99a4c7387f7b89db4b07050b17c85d7ced2a145'],
  jet: [256, 96, '3086936da70f105a19b99a9c859981ec94e0418bf7662c62c182c627b5e1409d'],
};

for (const [name, [width, height, sha256]] of Object.entries(expected)) {
  const png = await readFile(new URL(`../../public/fx/particles-${name}.png`, import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10],
    `${name}: committed atlas is a PNG`);
  assert.equal(png.readUInt32BE(16), width, `${name}: deterministic atlas width`);
  assert.equal(png.readUInt32BE(20), height, `${name}: deterministic atlas height`);
  assert.ok(png.length > 1000, `${name}: atlas is not an empty placeholder`);
  assert.equal(createHash('sha256').update(png).digest('hex'), sha256,
    `${name}: committed atlas matches the seeded first-party bake`);
}

console.log('particleTextureAssets.selftest: six deterministic prebuilt atlases passed');
