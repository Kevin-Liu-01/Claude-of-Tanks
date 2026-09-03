import assert from 'node:assert/strict';
import { buildTreeTrunkAuditGeometry } from './vegetation.ts';
import {
  TREE_ARCHETYPES, TREE_SPECIES, treeTrunkCollisionRadiusM,
} from './treeSpecies.ts';

const seeds = [0x71ee, 0x8b3d, 0xc041];
let minimumScore = Infinity;

function finiteAttribute(geometry, name) {
  const attribute = geometry.getAttribute(name);
  assert.ok(attribute, `${name} attribute exists`);
  for (let index = 0; index < attribute.array.length; index++) {
    assert.ok(Number.isFinite(attribute.array[index]), `${name}[${index}] is finite`);
  }
  return attribute;
}

for (const species of TREE_SPECIES) {
  for (const seed of seeds) {
    const geometry = buildTreeTrunkAuditGeometry(species, seed);
    const position = finiteAttribute(geometry, 'position');
    finiteAttribute(geometry, 'normal');
    finiteAttribute(geometry, 'color');
    finiteAttribute(geometry, 'aFlex');
    assert.ok(position.count >= 600, `${species}: trunk retains a detailed silhouette`);

    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    assert.ok(bounds.min.y >= -0.16 && bounds.min.y <= 0.02,
      `${species}: roots remain seated at ground level`);
    assert.ok(bounds.max.y >= TREE_ARCHETYPES[species].trunkHeightM * 0.94,
      `${species}: authored trunk height is represented`);

    const receipt = geometry.userData.trunkQuality;
    assert.ok(receipt, `${species}: procedural trunk quality receipt exists`);
    assert.equal(receipt.family, TREE_ARCHETYPES[species].family,
      `${species}: receipt identifies the correct family`);
    assert.ok(receipt.radialSegments >= 9, `${species}: round silhouette has at least nine sides`);
    assert.ok(receipt.verticalSegments >= 2, `${species}: trunk can bend without a rigid post silhouette`);
    assert.ok(receipt.rootButtresses >= 4, `${species}: trunk has visible root buttresses`);
    assert.equal(receipt.organicWarp, true, `${species}: organic fluting/crook is enabled`);

    const visibleRadii = [];
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index);
      const radius = Math.hypot(position.getX(index), position.getZ(index));
      if (y >= 0.4 && y <= 1.65 && radius > 0.03) visibleRadii.push(radius);
    }
    visibleRadii.sort((a, b) => a - b);
    const visibleRadius = visibleRadii[Math.floor(visibleRadii.length * 0.75)];
    assert.ok(Number.isFinite(visibleRadius), `${species}: lower-stem radius is measurable`);
    const collisionRadius = treeTrunkCollisionRadiusM(species, 1);
    const radiusFit = Math.min(visibleRadius, collisionRadius)
      / Math.max(visibleRadius, collisionRadius);
    const detailScore = Math.min(1, receipt.radialSegments / 9) * 28;
    const verticalScore = Math.min(1, receipt.verticalSegments / 2) * 12;
    const rootsScore = Math.min(1, receipt.rootButtresses / 4) * 20;
    const organicScore = receipt.organicWarp ? 15 : 0;
    const fitScore = radiusFit * 25;
    const score = detailScore + verticalScore + rootsScore + organicScore + fitScore;
    minimumScore = Math.min(minimumScore, score);
    assert.ok(score > 90,
      `${species}: trunk/collision quality ${score.toFixed(1)}/100 is not above 90`);

    const repeated = buildTreeTrunkAuditGeometry(species, seed);
    assert.deepEqual(
      Array.from(repeated.getAttribute('position').array),
      Array.from(position.array),
      `${species}: trunk generation is deterministic`,
    );
    geometry.dispose();
    repeated.dispose();
  }
}

console.log(
  `treeTrunkQuality.selftest: ${TREE_SPECIES.length} species x ${seeds.length} variants; `
  + `minimum ${minimumScore.toFixed(1)}/100`,
);
