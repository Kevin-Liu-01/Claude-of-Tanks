import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const categories = [
  { name: 'action', dir: 'scenes-action-r3', first: 61 },
  { name: 'foreground', dir: 'scenes-foreground-r3', first: 91 },
];
const sourceByOffset = new Map();

for (const category of categories) {
  const dir = join(HERE, category.dir);
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  assert.equal(files.length, 30, `${category.name} campaign must contain 30 scenes`);

  files.forEach((file, offset) => {
    const expectedNumber = category.first + offset;
    assert.match(file, new RegExp(`^${expectedNumber}_${category.name}_`));
    const scene = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    assert.equal(scene.meta?.campaign, 'marketing-battles-r3');
    assert.equal(scene.meta?.category, category.name);
    assert.ok(scene.meta?.sourceComposition, `${file}: missing source composition`);
    assert.ok(scene.actors.length >= 4, `${file}: fewer than four tanks`);
    assert.equal(new Set(scene.actors.map((actor) => actor.name)).size, scene.actors.length,
      `${file}: duplicate actor names`);

    const firing = scene.effects.filter((effect) => (
      ['fire', 'firing_moment', 'mg_burst'].includes(effect.type)
    ));
    assert.ok(firing.length >= 2, `${file}: fewer than two firing effects`);
    assert.ok(scene.effects.some((effect) => (
      ['tank_kill', 'explosion', 'explosion_moment'].includes(effect.type)
    )), `${file}: missing major explosion`);
    assert.ok(scene.camera.fov >= 30 && scene.camera.fov <= 52,
      `${file}: lens outside 30-52 degrees`);

    const [cx, , cz] = scene.camera.pos;
    const nearest = Math.min(...scene.actors.map((actor) => (
      Math.hypot(actor.pos[0] - cx, actor.pos[1] - cz)
    )));
    const hero = scene.actors[0];
    const heroDistance = Math.hypot(hero.pos[0] - cx, hero.pos[1] - cz);
    if (category.name === 'action') {
      assert.ok(nearest <= 29, `${file}: nearest tank is ${nearest.toFixed(1)}m away`);
      sourceByOffset.set(offset, scene.meta.sourceComposition);
    } else {
      assert.ok(heroDistance >= 7 && heroDistance <= 14,
        `${file}: foreground hero is ${heroDistance.toFixed(1)}m away`);
      assert.equal(scene.meta.sourceComposition, sourceByOffset.get(offset),
        `${file}: action/foreground source mismatch`);
    }
  });
}

assert.equal(new Set(sourceByOffset.values()).size, 30, 'campaign source compositions must be unique');
console.log('marketing battle campaign self-test passed (30 action + 30 foreground)');
