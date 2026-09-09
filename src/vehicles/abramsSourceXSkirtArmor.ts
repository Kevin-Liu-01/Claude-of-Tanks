import type { ArmorEnvelope, ArmorPlate } from './specHelpers.ts';

// Collision metadata for the existing first-party receiving sheets in
// abramsSourceXHull.ts. No profile import, source asset or generated mesh is
// needed at boot. These are not the separate destructible urban ERA cassettes.
const PANEL_Z = [-2.60, -1.985, -1.315, -.645, .025, .695, 1.365, 2.035, 2.99];
const AFT_EDGE = [
  [-3.710035, 1.098098], [-3.142035, 1.098098], [-2.992035, 1.091858],
  [-2.842035, .959785], [-2.742035, .683879], [-2.678035, .657345],
] as const;
const FAMILY = /^skirt_(front|rear)_[LR]$/;
const AUTHORED = /^skirt_(front|rear)_[LR]__source_/;
type SourcePlate = ArmorPlate & { surfaceGroup: string };
interface SkirtConfiguration { extendedFront?: boolean; partitionedSkin?: boolean; }

function sourceFace(
  donor: ArmorPlate, group: string, suffix: string, side: number,
  x: number, z0: number, z1: number, y0: number, y1: number, top = 1.408,
): SourcePlate {
  const ring: ArmorPlate['verts'] = [
    [side * x, y0, z0], [side * x, top, z0],
    [side * x, top, z1], [side * x, y1, z1],
  ];
  if (side < 0) ring.reverse();
  return { ...donor, name: `${donor.name}__source_${suffix}`, verts: ring,
    surfaceGroup: `abrams-source-skirt:${side}:${group}` };
}

function sideFaces(front: ArmorPlate, rear: ArmorPlate, side: number, config: SkirtConfiguration): SourcePlate[] {
  const faces: SourcePlate[] = [];
  for (let i = 0; i < PANEL_Z.length - 1; i++) {
    const z0 = PANEL_Z[i] + .008, z1 = PANEL_Z[i + 1] - .008;
    const bottom = i === 7 ? .615 : .6563;
    // Nonurban A2/SEP3 partition 35% of the existing native sheet as an
    // independently removable ERA skin. Permanent spaced protection belongs
    // to the actual backing interface, not the removable outer cover.
    const skin = config.partitionedSkin ? (i >= 6 ? .00969 : .00670) * .35 : 0;
    const x = (i >= 6 ? 1.82896 : 1.82915) - skin;
    // Keep the donor's front/rear protection boundary at Z .9, including
    // where it crosses a continuous physical sheet. Same-sheet seam hits
    // are one layer; no artificial geometric gap is introduced here.
    const cuts = z0 < .9 && z1 > .9 ? [z0, .9, z1] : [z0, z1];
    for (let j = 0; j < cuts.length - 1; j++) {
      const donor = (cuts[j] + cuts[j + 1]) / 2 < .9 ? rear : front;
      faces.push(sourceFace(donor, `panel-${i}`, `panel-${i}-${j}`, side,
        x, cuts[j], cuts[j + 1], bottom, bottom));
    }
  }
  for (let i = 0; i < AFT_EDGE.length - 1; i++) {
    const [z0, y0] = AFT_EDGE[i], [z1, y1] = AFT_EDGE[i + 1];
    faces.push(sourceFace(rear, 'aft-sheet', `aft-${i}`, side, 1.82922, z0, z1, y0, y1));
  }
  // SEP v2's separate source18 receiving skin overlaps panel7 at the same
  // outward plane. Register only its exposed extension, never both nested
  // rectangles. The other six configurations do not author this stock.
  if (config.extendedFront) faces.push(sourceFace(front, 'panel-7', 'forward-receiver', side,
    1.82896, 2.982, 3.535, .6695825, .6695825, 1.3764175));
  return faces;
}

/** Replace only the four inherited, unseated spaced skirts. Call on a fresh
 * donor armor clone for construction and each pre-finalization balance sync.
 * An already-normalized set is accepted without accumulating duplicate faces.
 */
export function applyAbramsSourceXSkirtArmor(armor: ArmorEnvelope, config: SkirtConfiguration = {}): void {
  const old = armor.hullPlates.filter(p => p.kind === 'spaced' && FAMILY.test(p.name));
  const authored = armor.hullPlates.filter(p => AUTHORED.test(p.name));
  if (!old.length && authored.length === (config.extendedFront ? 30 : 28)) return;
  if (old.length !== 4 || authored.length) {
    throw new Error('Abrams source skirts require exactly four untouched donor families');
  }
  const get = (name: string): ArmorPlate => {
    const matches = old.filter(p => p.name === name);
    if (matches.length !== 1) throw new Error(`Missing unique Abrams skirt donor: ${name}`);
    return matches[0];
  };
  const faces = [-1, 1].flatMap(side => {
    const suffix = side < 0 ? 'L' : 'R';
    return sideFaces(get(`skirt_front_${suffix}`), get(`skirt_rear_${suffix}`), side, config);
  });
  const first = armor.hullPlates.indexOf(old[0]);
  armor.hullPlates = armor.hullPlates.filter(p => !old.includes(p));
  armor.hullPlates.splice(first, 0, ...faces);
}

