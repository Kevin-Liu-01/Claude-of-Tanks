// Compatibility with retained donor gameplay protection is an explicit thin
// native-skin partition, not a claim that the standard M1A2 wears an ARAT kit.
// Complete permanent stock remains behind every removable gameplay layer.
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { BufferGeometry } from 'three';
import { partitionEraCover, bindPartitionedEraCover } from './abramsSourceXCover.ts';

function eraName(P: TankBuilderPort, owner: 'hull' | 'turret', suffix: string): string {
  const rows = P.spec.armor[owner === 'hull' ? 'hullPlates' : 'turretPlates']
    .filter(plate => plate.kind === 'era' && plate.name.endsWith(suffix));
  // Finalized anatomy has one same-name record per physical face, while the
  // renderer binds the single logical destructible bank. Keep ambiguity fatal.
  const names = [...new Set(rows.map(plate => plate.name))];
  if (names.length !== 1) throw new Error(`${P.spec.id}: expected one ${owner} ERA plate ${suffix}`);
  return names[0];
}

function skirtSkin(P: TankBuilderPort, side: number): void {
  const name = eraName(P, 'hull', `_skirt_era_${side < 0 ? 'L' : 'R'}`);
  const covers: BufferGeometry[] = [];
  P.forEachBucketPart(['hullDetail', 'hullTrackGuardL', 'hullTrackGuardR'], part => {
    if (!part.userData.abramsSourceXSkirtStock) return;
    part.computeBoundingBox();
    if (!part.boundingBox || Math.sign(part.boundingBox.min.x) !== side) return;
    // Source panel's outer +/-X face becomes +Y in this temporary frame.
    // Partition the real surface; don't add a floating cassette over it.
    const rotated = part.clone().rotateZ(side * Math.PI / 2);
    rotated.computeBoundingBox();
    const { min, max } = rotated.boundingBox!;
    const margin = .001;
    // Thin source receiving sheets are not 12mm armor cassettes. Retain at
    // least 65% of their actual stock behind the concealed gameplay layer.
    const depth = Math.min(.012, (max.y - min.y) * .35);
    const split = partitionEraCover(rotated, [
      [min.x - margin, min.z - margin], [max.x + margin, min.z - margin],
      [max.x + margin, max.z + margin], [min.x - margin, max.z + margin],
    ], depth);
    if (!split.cover) throw new Error(`${name}: no actual receiving-panel outer skin`);
    part.copy(split.backing.rotateZ(-side * Math.PI / 2));
    covers.push(split.cover.rotateZ(-side * Math.PI / 2));
    split.backing.dispose();
    rotated.dispose();
  });
  if (covers.length !== 8) throw new Error(`${name}: expected eight separately backed skirt skins`);
  P.destructibleCluster(name, () => {
    for (const cover of covers) P.addExternalArmor('hull', cover);
  });
}

export function bindAbramsSourceXStockEra(P: TankBuilderPort, urbanArmor: boolean): void {
  const hasEra = P.spec.armor.hullPlates.some(plate => plate.kind === 'era');
  if (urbanArmor || !hasEra) return;
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    skirtSkin(P, side);
    const x0 = side < 0 ? -1.70 : .28, x1 = side < 0 ? -.45 : 1.56;
    bindPartitionedEraCover(P, 'turret', eraName(P, 'turret', `_turret_era_${suffix}`),
      [[x0, .42], [x1, .42], [x1, 1.95], [x0, 1.95]], .012);
    const glacis = P.spec.armor.hullPlates.find(plate => plate.kind === 'era'
      && plate.name.endsWith(`_glacis_era_${suffix}`));
    if (!glacis) continue;
    const near = side < 0 ? -1.06 : .12, far = side < 0 ? -.12 : 1.06;
    bindPartitionedEraCover(P, 'hull', glacis.name,
      [[near, 2.64], [far, 2.64], [far, 3.46], [near, 3.46]], .012);
  }
}
