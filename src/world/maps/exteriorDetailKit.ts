// Shared connected exterior-detail authoring for procedural buildings.
//
// Each fixture is registered against either the wall envelope, the ground, or
// an earlier fixture. The authoring pass rejects disconnected parts while the
// geometries are still separate; after that they can be merged into the
// existing material buckets without carrying per-object runtime overhead.

import * as THREE from 'three';
import { pitchSkillionRoof } from '../propGeometry.ts';
import { measureBoundsJoint } from '../structureConnectivity.ts';
import { ensureWorldNightEmissionMask, markWorldLantern } from '../worldNightEmissionGeometry.ts';

const SUPPORT_EPSILON = 0.065;
const EXTERIOR_RECEIPTS = Symbol('exterior-detail-receipts');

interface ExteriorSupportRecord {
  building: string;
  part: string;
  support: string;
  gap: number;
  contactAxes: number;
  minContactSpan: number;
}

interface ExteriorReceipt {
  id: string;
  profile: string;
  added: number;
  maxSupportGap: number;
  records: ExteriorSupportRecord[];
  /** settlement pass 2 (2026-09-12): tops of the builder's authored chimney stacks, building-local. */
  chimneys: Array<[number, number, number]>;
}

export interface GeometryBuckets {
  plaster: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass?: THREE.BufferGeometry[];
  baked?: THREE.BufferGeometry[];
  /** Round 75: the painted corrugated-steel atlas (propsSteelAtlas.ts) — containers, tanks, drums; vertex-coloured livery. */
  steel?: THREE.BufferGeometry[];
  [name: string]: THREE.BufferGeometry[] | undefined;
  [EXTERIOR_RECEIPTS]?: ExteriorReceipt[];
  [STRUCTURE_CONTEXT]?: StructureBuildContext;
}

export interface StructureDimensions {
  w: number;
  d: number;
  h: number;
}

/**
 * Round 75: what a plan builder may read about the battlefield it stands on. Builders draw the seeded stream of
 * every later placement, so the context varies only what a draw already selects (a livery set, a cladding), never
 * how many draws a builder makes. It rides the bucket set under a non-enumerable symbol (the exterior receipts'
 * precedent): builders such as the bathhouse and the rowhouse already own a fourth positional argument.
 */
export interface StructureBuildContext {
  mapId: string;
  snowCap: boolean;
  seed: number;
  /** The map's industrial wall cladding (props.industrialCladding): brick / stone halls or corrugated sheet. */
  cladding: 'brick' | 'steel';
}

const STRUCTURE_CONTEXT = Symbol('structure-build-context');

export function attachStructureBuildContext(buckets: GeometryBuckets, context: StructureBuildContext): void {
  Object.defineProperty(buckets, STRUCTURE_CONTEXT, { value: context, enumerable: false, configurable: true });
}

export function structureBuildContext(buckets: GeometryBuckets): StructureBuildContext | undefined {
  return buckets[STRUCTURE_CONTEXT];
}

export type StructureBuilder = (
  rng: () => number,
  buckets: GeometryBuckets,
) => StructureDimensions;

interface ExteriorEnvelope {
  w: number;
  d: number;
  wallH: number;
  id: string;
  profile: string;
  bathhouseStyle?: 'timber';
  timberBathhouseEntry?: THREE.BufferGeometry;
}

interface ExteriorOptions {
  id?: string;
  w?: number;
  d?: number;
  wallH?: number;
  profile?: string;
  variant?: number;
  bathhouseStyle?: 'timber';
  /** Existing authored vestibule: the timber variant attaches to its real bounds. */
  timberBathhouseEntry?: THREE.BufferGeometry;
}

interface ExteriorAuthor {
  add(
    partId: string,
    preferredBucket: string,
    geometry: THREE.BufferGeometry,
    supportId?: string,
  ): THREE.BufferGeometry;
  /** Whether the building already owns this material bucket (fixtures may omit some). */
  has(bucket: string): boolean;
  receipt(): ExteriorReceipt;
}

interface BuildingInfo {
  h?: number;
}

interface InferredEnvelope {
  w: number;
  d: number;
  wallH: number;
  score: number;
}

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const su = Math.max(w, d) * 0.9;
  const sv = Math.max(h, 0.12) * 0.9;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  geo.userData.detailUv = true;
  return geo;
}

function cylinder(radius: number, height: number, segments = 8): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1);
  geo.userData.detailUv = true;
  return geo;
}

function boundsOf(geo: THREE.BufferGeometry): THREE.Box3 {
  geo.computeBoundingBox();
  if (!geo.boundingBox) throw new Error('exterior detail geometry has no bounding box');
  return geo.boundingBox.clone();
}

function bucket(
  parts: GeometryBuckets,
  preferred: string,
  fallback = 'dark',
): THREE.BufferGeometry[] {
  const selected = parts[preferred] || parts[fallback]
    || Object.values(parts).find((value): value is THREE.BufferGeometry[] => Array.isArray(value));
  if (!selected) throw new Error(`exterior detail has no geometry bucket for ${preferred}`);
  return selected;
}

function detailAuthor(parts: GeometryBuckets, {
  w, d, wallH, id, profile, bathhouseStyle, timberBathhouseEntry,
}: ExteriorEnvelope): ExteriorAuthor {
  const supports = new Map([
    ['wall', new THREE.Box3(
      new THREE.Vector3(-w / 2, 0, -d / 2),
      new THREE.Vector3(w / 2, wallH, d / 2),
    )],
    ['ground', new THREE.Box3(
      new THREE.Vector3(-w, -0.12, -d),
      new THREE.Vector3(w, 0.08, d),
    )],
  ]);
  if (timberBathhouseEntry) supports.set('bathhouse-vestibule', boundsOf(timberBathhouseEntry));
  const records: ExteriorSupportRecord[] = [];

  const add = (
    partId: string,
    preferredBucket: string,
    geo: THREE.BufferGeometry,
    supportId = 'wall',
  ): THREE.BufferGeometry => {
    const support = supports.get(supportId);
    if (!support) throw new Error(`${id}: missing exterior support ${supportId}`);
    const bounds = boundsOf(geo);
    const joint = measureBoundsJoint(bounds, support);
    const { gap } = joint;
    if (gap > SUPPORT_EPSILON) {
      throw new Error(`${id}: floating exterior part ${partId} (${gap.toFixed(3)} m from ${supportId})`);
    }
    if (joint.contactAxes < 2) {
      throw new Error(`${id}: exterior part ${partId} only grazes ${supportId} without a stable joint`);
    }
    const record: ExteriorSupportRecord = {
      building: id, part: partId, support: supportId, gap,
      contactAxes: joint.contactAxes, minContactSpan: joint.minContactSpan,
    };
    geo.userData.structureSupport = record;
    // Keep the stone foundation/plinth and service cap. Only this explicit
    // bathhouse variant reuses its existing civic frame pieces as timber.
    const timberFrame = bathhouseStyle === 'timber' && preferredBucket === 'stone'
      && !partId.startsWith('plinth-') && partId !== 'roof-service-base' && partId !== 'entry-threshold';
    bucket(parts, timberFrame ? 'wood' : preferredBucket).push(geo);
    supports.set(partId, bounds);
    records.push(record);
    return geo;
  };

  return {
    add,
    has: (bucket: string) => Array.isArray(parts[bucket]),
    receipt: () => ({ id, profile, added: records.length,
      maxSupportGap: Math.max(0, ...records.map((record) => record.gap)), records, chimneys: [] }),
  };
}

function addCourses(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  material: string,
): void {
  const lowY = Math.min(0.72, wallH * 0.18);
  const highY = Math.max(lowY + 0.55, wallH - 0.32);
  const courses: ReadonlyArray<readonly [string, number]> = [
    ['plinth', lowY],
    ['cornice', highY],
  ];
  for (const [name, y] of courses) {
    author.add(`${name}-front`, material,
      box(w + 0.20, name === 'plinth' ? 0.24 : 0.18, 0.14)
        .translate(0, y, d / 2 + 0.025));
    author.add(`${name}-rear`, material,
      box(w + 0.20, name === 'plinth' ? 0.24 : 0.18, 0.14)
        .translate(0, y, -d / 2 - 0.025));
    author.add(`${name}-left`, material,
      box(0.14, name === 'plinth' ? 0.24 : 0.18, d + 0.20)
        .translate(-w / 2 - 0.025, y, 0));
    author.add(`${name}-right`, material,
      box(0.14, name === 'plinth' ? 0.24 : 0.18, d + 0.20)
        .translate(w / 2 + 0.025, y, 0));
  }
}

function addCornerPiers(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  material: string,
): void {
  const pierH = Math.max(1.4, wallH - 0.22);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    author.add(`pier-${sx}-${sz}`, material,
      box(0.28, pierH, 0.28)
        .translate(sx * (w / 2 + 0.015), pierH / 2, sz * (d / 2 + 0.015)));
  }
}

function addFrontRearBays(
  author: ExteriorAuthor,
  w: number,
  d: number,
  material: string,
  pierW: number,
  pierD: number,
  pierH: number,
): void {
  const bayCount = Math.max(2, Math.min(4, Math.round(w / 3.4)));
  for (let bay = 1; bay < bayCount; bay++) {
    const x = -w / 2 + (w * bay) / bayCount;
    for (const side of [-1, 1]) {
      author.add(`facade-bay-${bay}-${side}`, material,
        box(pierW, pierH, pierD)
          .translate(x, pierH / 2 + 0.10, side * (d / 2 + 0.035)));
    }
  }
}

function addIndustrialSideBays(
  author: ExteriorAuthor,
  w: number,
  d: number,
  pierW: number,
  pierH: number,
): void {
  const sideBayCount = Math.max(2, Math.min(4, Math.round(d / 4.1)));
  for (let bay = 1; bay < sideBayCount; bay++) {
    const z = -d / 2 + (d * bay) / sideBayCount;
    for (const side of [-1, 1]) {
      author.add(`side-bay-${bay}-${side}`, 'dark',
        box(0.12, pierH, pierW)
          .translate(side * (w / 2 + 0.035), pierH / 2 + 0.10, z));
    }
  }
}

function addUtilityApertures(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
  material: string,
): void {
  // A pair of framed utility apertures gives broad blank elevations real
  // depth. They sit against the wall envelope and reuse existing buckets;
  // no additional material or scene node survives the merge.
  const apertureY = Math.min(wallH - 0.82, profile === 'desert' ? 2.05 : 2.55);
  const apertureW = Math.min(profile === 'industrial' ? 1.15 : 0.82, w * 0.13);
  const apertureH = profile === 'industrial' ? 0.72 : 1.02;
  const lane = variant % 2 === 0 ? 1 : -1;
  for (const side of [-1, 1]) {
    const x = side * w * (0.22 + lane * side * 0.025);
    const z = -d / 2 - 0.055;
    author.add(`aperture-pane-${side}`, 'dark',
      box(apertureW, apertureH, 0.08).translate(x, apertureY, z));
    author.add(`aperture-left-${side}`, material,
      box(0.11, apertureH + 0.24, 0.13)
        .translate(x - apertureW / 2 - 0.065, apertureY, z - 0.01));
    author.add(`aperture-right-${side}`, material,
      box(0.11, apertureH + 0.24, 0.13)
        .translate(x + apertureW / 2 + 0.065, apertureY, z - 0.01));
    author.add(`aperture-head-${side}`, material,
      box(apertureW + 0.32, 0.12, 0.14)
        .translate(x, apertureY + apertureH / 2 + 0.08, z - 0.01));
    author.add(`aperture-sill-${side}`, material,
      box(apertureW + 0.34, 0.12, 0.20)
        .translate(x, apertureY - apertureH / 2 - 0.08, z - 0.035));
    if (profile === 'industrial') {
      for (const offset of [-0.18, 0, 0.18]) {
        author.add(`aperture-louver-${side}-${offset}`, 'stone',
          box(apertureW - 0.12, 0.055, 0.08)
            .translate(x, apertureY + offset, z - 0.085), `aperture-pane-${side}`);
      }
    }
  }
}

function addTimberSideApertures(author: ExteriorAuthor, w: number, d: number, wallH: number): void {
  // The Orchard catalog pass reuses its two five-piece window packages on
  // the blank side elevations, leaving the original civic rear pair intact.
  // Keep bucket insertion order and detail UV ownership for the seeded pass.
  const apertureW = Math.min(2.6, d * 0.3), apertureH = 1.02;
  const y = Math.min(wallH - 0.82, 2.8);
  for (const side of [-1, 1]) {
    const add = (name: string, material: string, geometry: THREE.BufferGeometry): void => {
      geometry.rotateY(-side * Math.PI / 2).translate(side * (w / 2 + 0.035), y, 0);
      author.add(`aperture-${name}-${side}`, material, geometry);
    };
    add('pane', 'dark', box(apertureW, apertureH, 0.08));
    add('left', 'stone', box(0.11, apertureH + 0.24, 0.13)
      .translate(-apertureW / 2 - 0.065, 0, -0.01));
    add('right', 'stone', box(0.11, apertureH + 0.24, 0.13)
      .translate(apertureW / 2 + 0.065, 0, -0.01));
    add('head', 'stone', box(apertureW + 0.32, 0.12, 0.14)
      .translate(0, apertureH / 2 + 0.08, -0.01));
    add('sill', 'stone', box(apertureW + 0.34, 0.12, 0.20)
      .translate(0, -apertureH / 2 - 0.08, -0.035));
  }
}

function addFacadeBayRhythm(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
  timberSideApertures = false,
): void {
  if (!['urban', 'civic', 'industrial', 'desert'].includes(profile)) return;
  const material = profile === 'industrial' ? 'dark' : 'stone';
  const pierW = profile === 'desert' ? 0.24 : 0.14;
  const pierD = profile === 'desert' ? 0.16 : 0.12;
  const pierH = Math.max(1.7, wallH - 0.45);
  addFrontRearBays(author, w, d, material, pierW, pierD, pierH);
  if (profile === 'industrial') addIndustrialSideBays(author, w, d, pierW, pierH);
  if (timberSideApertures) addTimberSideApertures(author, w, d, wallH);
  else addUtilityApertures(author, w, d, wallH, profile, variant, material);
}

function addRainwater(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
): void {
  const frontZ = d / 2 + 0.055;
  const pipeY = wallH * 0.48;
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.20);
    author.add(`downpipe-${sx}`, 'dark',
      cylinder(0.075, wallH * 0.94, 8).translate(x, pipeY, frontZ));
    author.add(`downpipe-boot-${sx}`, 'dark',
      box(0.18, 0.16, 0.34).translate(x, 0.10, frontZ + 0.10), `downpipe-${sx}`);
  }
  author.add('front-gutter', 'dark',
    cylinder(0.085, w - 0.25, 8).rotateZ(Math.PI / 2)
      .translate(0, wallH - 0.10, frontZ), 'wall');
}

function addServiceCluster(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  industrial = false,
): void {
  const sideX = w / 2 + 0.075;
  const unitY = Math.min(wallH - 0.72, industrial ? 2.45 : 2.05);
  const unitD = industrial ? 1.35 : 0.92;
  const unitH = industrial ? 0.92 : 0.68;
  const unitW = industrial ? 0.42 : 0.30;
  author.add('service-unit', 'dark',
    box(unitW, unitH, unitD).translate(sideX, unitY, -d * 0.14));
  for (const z of [-d * 0.14 - unitD * 0.27, -d * 0.14, -d * 0.14 + unitD * 0.27]) {
    author.add(`service-louver-${z.toFixed(2)}`, 'stone',
      box(0.08, unitH * 0.08, unitD * 0.18).translate(
        sideX + unitW / 2 + 0.025, unitY, z,
      ), 'service-unit');
  }
  author.add('service-conduit', 'dark',
    cylinder(0.045, Math.max(0.6, unitY - 0.30), 7)
      .translate(w / 2 + 0.035, (unitY - 0.30) / 2 + 0.12, -d * 0.14), 'wall');
  author.add('service-junction', 'dark',
    box(0.18, 0.28, 0.34).translate(w / 2 + 0.055, 0.52, -d * 0.14), 'wall');
}

function addSupportedAwning(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  material: string,
): void {
  const awningW = Math.min(w * 0.52, 5.8);
  const awningD = Math.min(1.25, d * 0.18);
  const y = Math.min(wallH - 0.42, 2.85);
  const z = d / 2 + awningD / 2 - 0.025;
  const canopy = pitchSkillionRoof(box(awningW, 0.11, awningD), 'z', 1, 0.11);
  author.add('awning', material, canopy.translate(0, y, z));
  for (const sx of [-1, 1]) {
    const brace = box(0.10, 0.10, awningD * 0.92);
    brace.rotateX(sx * 0.02 - 0.48);
    author.add(`awning-brace-${sx}`, 'dark',
      brace.translate(sx * (awningW / 2 - 0.22), y - 0.30, z - 0.08), 'wall');
  }
}

function addEntryAssembly(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
): void {
  const industrial = profile === 'industrial';
  const timber = profile === 'timber' || profile === 'rural';
  const doorW = industrial ? Math.min(2.4, w * 0.28) : Math.min(1.35, w * 0.18);
  const doorH = Math.min(industrial ? 2.75 : 2.25, wallH * 0.72);
  const lane = (variant % 3) - 1;
  const x = THREE.MathUtils.clamp(lane * w * 0.19, -w * 0.28, w * 0.28);
  const z = d / 2 + 0.055;
  const frameMaterial = timber ? 'wood' : 'stone';
  author.add('entry-threshold', frameMaterial,
    box(doorW + 0.40, 0.12, 0.42).translate(x, 0.06, d / 2 + 0.14), 'ground');
  author.add('entry-door', timber ? 'wood' : 'dark',
    box(doorW, doorH, 0.10).translate(x, doorH / 2 + 0.08, z));
  for (const side of [-1, 1]) {
    author.add(`entry-jamb-${side}`, frameMaterial,
      box(0.14, doorH + 0.24, 0.14)
        .translate(x + side * (doorW / 2 + 0.07), doorH / 2 + 0.08, z + 0.015));
  }
  author.add('entry-lintel', frameMaterial,
    box(doorW + 0.42, 0.16, 0.16).translate(x, doorH + 0.20, z + 0.02));

  // Alternate variants gain a shallow supported rain hood. Its rear edge is
  // embedded in the facade and both braces terminate at the wall.
  if (variant % 2 === 0) {
    const hood = pitchSkillionRoof(box(doorW + 0.75, 0.10, 0.95), 'z', 1, 0.10);
    author.add('entry-hood', profile === 'desert' ? 'wood' : 'roof',
      hood.translate(x, doorH + 0.52, d / 2 + 0.40));
    for (const side of [-1, 1]) {
      const brace = box(0.09, 0.09, 0.74);
      brace.rotateX(-0.58);
      author.add(`entry-hood-brace-${side}`, 'dark',
        brace.translate(x + side * doorW * 0.40, doorH + 0.28, d / 2 + 0.23));
    }
  }
  // settlement pass 3 (2026-09-12): a wall lantern beside every entrance — a
  // short bracket into the wall, a dark cage and cap, and lantern glass on the
  // night-emissive glass material (the lighthouse lantern's path) so the
  // village doorways glow after dark. Fixtures without a glass bucket keep
  // the bracket and cage only.
  {
    const lx = x + (doorW / 2 + 0.42) * (variant % 2 === 0 ? 1 : -1);
    const ly = doorH + 0.12;
    author.add('entry-lantern-bracket', 'dark',
      box(0.06, 0.06, 0.30).translate(lx, ly + 0.14, d / 2 + 0.14));
    author.add('entry-lantern-cage', 'dark',
      box(0.22, 0.30, 0.22).translate(lx, ly - 0.02, d / 2 + 0.26), 'entry-lantern-bracket');
    if (author.has('glass')) {
      author.add('entry-lantern-glass', 'glass',
        markWorldLantern(box(0.16, 0.20, 0.16)).translate(lx, ly - 0.02, d / 2 + 0.26), 'entry-lantern-cage');
    }
    author.add('entry-lantern-cap', 'dark',
      box(0.26, 0.05, 0.26).translate(lx, ly + 0.16, d / 2 + 0.26), 'entry-lantern-cage');
  }
}

/** settlement pass 3 (2026-09-12): dressed corner stones on masonry houses, long and short alternating. */
function addQuoins(author: ExteriorAuthor, w: number, d: number, wallH: number): void {
  const courses = Math.max(3, Math.min(8, Math.floor((wallH - 0.6) / 0.42)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let course = 0; course < courses; course++) {
      const y = 0.55 + course * 0.42;
      const long = course % 2 === 0;
      author.add(`quoin-${sx}-${sz}-${course}`, 'stone',
        box(long ? 0.46 : 0.28, 0.24, long ? 0.28 : 0.46)
          .translate(sx * (w / 2 + 0.03 - (long ? 0.23 : 0.14)), y, sz * (d / 2 + 0.03 - (long ? 0.14 : 0.23))));
    }
  }
}

function addRuralSignature(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  variant: number,
): void {
  const frontZ = d / 2 + 0.06;
  // Asymmetric shutter groups break the repeated blank-house silhouette.
  const y = Math.min(2.15, wallH * 0.58);
  const centerX = variant % 2 === 0 ? -w * 0.23 : w * 0.23;
  for (const side of [-1, 1]) {
    author.add(`shutter-${side}`, 'wood',
      box(Math.min(0.36, w * 0.055), 1.12, 0.11)
        .translate(centerX + side * Math.min(0.56, w * 0.085), y, frontZ));
  }
  author.add('shutter-head', 'wood',
    box(Math.min(1.5, w * 0.22), 0.10, 0.13)
      .translate(centerX, y + 0.62, frontZ + 0.01));
}

function addUrbanSignature(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
): void {
  // A shallow balcony is carried by its wall-embedded deck; railings are
  // registered against that deck so no bar can survive as a floating part.
  const deckY = Math.min(wallH - 0.85, profile === 'civic' ? 3.45 : 3.05);
  const deckW = Math.min(w * (variant % 2 === 0 ? 0.56 : 0.42), 5.8);
  author.add('balcony-deck', 'stone',
    box(deckW, 0.13, 0.88).translate(0, deckY, d / 2 + 0.40));
  const postXs = [-deckW / 2 + 0.12, 0, deckW / 2 - 0.12];
  for (let index = 0; index < postXs.length; index++) {
    author.add(`balcony-post-${index}`, 'dark',
      box(0.08, 0.78, 0.08)
        .translate(postXs[index], deckY + 0.45, d / 2 + 0.78), 'balcony-deck');
  }
  author.add('balcony-rail', 'dark',
    box(deckW, 0.08, 0.08).translate(0, deckY + 0.82, d / 2 + 0.78),
    'balcony-post-0');
}

function addTimberBathhouseEntry(author: ExteriorAuthor, vestibule: THREE.BufferGeometry): void {
  const bounds = boundsOf(vestibule), x = (bounds.min.x + bounds.max.x) * 0.5;
  const z = bounds.max.z, headerY = 2.82;
  // Exactly the five existing balcony boxes, now a usable split hanging
  // entrance. Its cloth clears the inherited door face by 4 mm, and remains
  // entirely above the 1.8 m tank-contact band. No cloth simulation/material.
  for (const side of [-1, 1]) {
    author.add(`bathhouse-entry-bracket-${side}`, 'wood',
      box(0.16, 0.20, 0.18).translate(x + side * 0.91, headerY, z - 0.01),
      'bathhouse-vestibule');
  }
  author.add('bathhouse-entry-header', 'wood',
    box(2.1, 0.16, 0.09).translate(x, headerY, z + 0.045), 'bathhouse-entry-bracket--1');
  for (const side of [-1, 1]) {
    author.add(`bathhouse-entry-panel-${side}`, 'curtain',
      ensureWorldNightEmissionMask(box(0.69, 0.78, 0.016)).translate(x + side * 0.405, 2.355, z + 0.082),
      'bathhouse-entry-header');
  }
}

function addIndustrialSignature(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  variant: number,
): void {
  // External service ladder: two facade-seated rails and bounded rungs.
  const x = w / 2 + 0.055;
  const z = (variant % 3 - 1) * d * 0.18;
  const ladderH = Math.max(1.8, wallH * 0.78);
  for (const side of [-1, 1]) {
    author.add(`ladder-rail-${side}`, 'dark',
      cylinder(0.045, ladderH, 7)
        .translate(x, ladderH / 2 + 0.16, z + side * 0.42));
  }
  const rungCount = Math.max(4, Math.min(8, Math.round(ladderH / 0.48)));
  for (let index = 0; index < rungCount; index++) {
    author.add(`ladder-rung-${index}`, 'dark',
      box(0.12, 0.055, 0.84)
        .translate(x + 0.025, 0.34 + index * (ladderH - 0.36) / (rungCount - 1), z),
      'ladder-rail--1');
  }
}

function addDesertSignature(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  variant: number,
): void {
  // Grounded facade buttresses add adobe depth without a new material or
  // per-building object. They taper visually as stepped supported blocks.
  for (const side of [-1, 1]) {
    const x = side * w * (variant % 2 === 0 ? 0.34 : 0.26);
    author.add(`buttress-${side}`, 'stone',
      box(0.42, Math.min(1.55, wallH * 0.46), 0.72)
        .translate(x, Math.min(0.775, wallH * 0.23), d / 2 + 0.27), 'ground');
  }
}

function addProfileSignature(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
): void {
  if (profile === 'rural' || profile === 'timber') {
    addRuralSignature(author, w, d, wallH, variant);
  } else if (profile === 'urban' || profile === 'civic') {
    addUrbanSignature(author, w, d, wallH, profile, variant);
  } else if (profile === 'industrial') {
    addIndustrialSignature(author, w, d, wallH, variant);
  } else if (profile === 'desert') {
    addDesertSignature(author, w, d, wallH, variant);
  }
}

function addRoofService(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
): void {
  if (!['urban', 'civic', 'industrial'].includes(profile)) return;
  const x = (variant % 2 === 0 ? -1 : 1) * Math.min(w * 0.24, 2.1);
  const z = (variant % 3 - 1) * Math.min(d * 0.16, 1.8);
  author.add('roof-service-base', profile === 'industrial' ? 'dark' : 'stone',
    box(0.54, 0.34, 0.54).translate(x, wallH + 0.17, z));
  author.add('roof-service-cap', 'dark',
    cylinder(0.24, 0.28, 8).translate(x, wallH + 0.48, z), 'roof-service-base');
}

/**
 * Add a bounded, zero-runtime-cost façade pass to an authored building.
 * Call this before the building's material buckets are merged.
 *
 * @returns {{id:string,profile:string,added:number,maxSupportGap:number,records:Array<object>}}
 */
export function addConnectedExterior(
  parts: GeometryBuckets,
  options: ExteriorOptions = {},
): ExteriorReceipt {
  const { variant, ...envelope } = validateExteriorEnvelope(options);
  if (envelope.timberBathhouseEntry && (!parts.wood || !parts.curtain)) {
    throw new TypeError('Timber bathhouse requires its existing wood and curtain material buckets');
  }
  // Builder-authored window panes, read BEFORE this pass adds its own framed
  // apertures (those arrive complete and must not be framed twice).
  const panes = collectWindowPanes(parts, envelope);
  const chimneys = collectChimneyTops(parts, envelope);
  const author = detailAuthor(parts, envelope);
  addPrimaryExterior(author, envelope, variant);
  addSecondaryExterior(author, envelope, variant);
  addWindowJoinery(author, panes, envelope.profile, variant);
  return appendExteriorReceipt(parts, { ...author.receipt(), chimneys });
}

const MAX_CHIMNEYS = 4;

/**
 * Chimney stacks a builder authored as masonry: a near-square column no wider
 * than 0.9 m, at least 0.8 m tall, whose top clears the wall envelope by
 * 0.6 m. Cap slabs (too flat) and porch posts (too thin) never qualify; two
 * pieces of one stack collapse to the higher top. Positions are building-local
 * so the placement site can carry them into the world with the building.
 */
function collectChimneyTops(
  parts: GeometryBuckets,
  { w, d, wallH }: ExteriorEnvelope,
): Array<[number, number, number]> {
  const tops: Array<[number, number, number]> = [];
  const size = new THREE.Vector3();
  for (const name of ['stone', 'baked', 'plaster', 'plaster2', 'plaster3', 'wood']) {
    for (const geo of parts[name] || []) {
      const bounds = boundsOf(geo);
      bounds.getSize(size);
      if (size.y < 0.8 || Math.max(size.x, size.z) > 0.9 || Math.min(size.x, size.z) < 0.3) continue;
      if (Math.abs(size.x - size.z) > 0.22) continue;
      if (bounds.max.y < wallH + 0.6) continue;
      const x = (bounds.min.x + bounds.max.x) * 0.5, z = (bounds.min.z + bounds.max.z) * 0.5;
      if (Math.abs(x) > w * 0.62 + 0.4 || Math.abs(z) > d * 0.62 + 0.4) continue;
      const near = tops.find((top) => Math.hypot(top[0] - x, top[2] - z) < 0.6);
      if (near) { near[1] = Math.max(near[1], bounds.max.y); continue; }
      tops.push([x, bounds.max.y, z]);
    }
  }
  tops.sort((a, b) => b[1] - a[1]);
  return tops.slice(0, MAX_CHIMNEYS);
}

interface WindowPane {
  /** Wall axis the pane is thin along: 'x' for the ±w/2 faces, 'z' for ±d/2. */
  axis: 'x' | 'z';
  side: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

const MAX_JOINERY_PANES = 12;

/**
 * Window openings a builder authored as bare panes on the centred wall
 * envelope: thin dark/glass/curtain boxes at a wall face, inside the wall
 * height, with no enclosing frame piece of their own. Attic/gable panes above
 * the wall and recessed wing panes are left alone (no wall support there).
 */
function collectWindowPanes(
  parts: GeometryBuckets,
  { w, d, wallH }: ExteriorEnvelope,
): WindowPane[] {
  const framed: THREE.Box3[] = [];
  for (const name of ['wood', 'stone', 'plaster', 'plaster2', 'plaster3']) {
    for (const geo of parts[name] || []) framed.push(boundsOf(geo));
  }
  const panes: WindowPane[] = [];
  const frameSize = new THREE.Vector3();
  for (const name of ['dark', 'glass', 'curtain']) {
    for (const geo of parts[name] || []) {
      const bounds = boundsOf(geo);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const thinX = size.x <= 0.12 && size.z >= 0.35 && size.z <= 2.6;
      const thinZ = size.z <= 0.12 && size.x >= 0.35 && size.x <= 2.6;
      if (!(thinX || thinZ) || size.y < 0.45 || size.y > 2.4) continue;
      if (bounds.min.y < 0.5 || bounds.max.y > wallH - 0.05) continue;
      const axis: 'x' | 'z' = thinX ? 'x' : 'z';
      const face = axis === 'x' ? w / 2 : d / 2;
      const along = axis === 'x' ? center.x : center.z;
      if (Math.abs(Math.abs(along) - face) > 0.25) continue;
      // settlement pass 4 (2026-09-13): the pane must sit on the envelope wall
      // itself — inner face within 4 cm of it — or the jambs, embedded 1 cm
      // into that assumed wall, float in front of the bay, oriel or shopfront
      // relief that really carries the pane. A Ruinspires rowhouse pane 15 cm
      // proud tripped the floating-part guard and failed the whole world build.
      const innerFace = Math.abs(along) - size[axis] * 0.5;
      if (Math.abs(innerFace - face) > 0.04) continue;
      // ...and the frame must stay on the wall laterally: a pane in the end bay
      // of a rowhouse puts a jamb past the corner, where nothing supports it
      // (the gap the guard reports is measured in three dimensions).
      const acrossHalf = axis === 'x' ? d / 2 : w / 2;
      const acrossCenter = axis === 'x' ? center.z : center.x;
      const openW = axis === 'x' ? size.z : size.x;
      if (Math.abs(acrossCenter) + openW * 0.5 + 0.09 + 0.02 > acrossHalf) continue;
      const alreadyFramed = framed.some((frame) => {
        frame.getSize(frameSize);
        const thinFrame = axis === 'x' ? frameSize.x <= 0.3 : frameSize.z <= 0.3;
        if (!thinFrame) return false;
        const frameAlong = axis === 'x' ? (frame.min.x + frame.max.x) * 0.5 : (frame.min.z + frame.max.z) * 0.5;
        if (Math.abs(frameAlong - along) > 0.2) return false;
        const enclosesY = frame.min.y <= bounds.min.y + 0.02 && frame.max.y >= bounds.max.y - 0.02;
        const enclosesAcross = axis === 'x'
          ? frame.min.z <= bounds.min.z + 0.02 && frame.max.z >= bounds.max.z - 0.02
          : frame.min.x <= bounds.min.x + 0.02 && frame.max.x >= bounds.max.x - 0.02;
        return enclosesY && enclosesAcross;
      });
      if (alreadyFramed) continue;
      panes.push({ axis, side: Math.sign(along) || 1, center, size });
    }
  }
  return panes.slice(0, MAX_JOINERY_PANES);
}

/**
 * settlement pass 2026-09-12 (owner: "everything looks so undetailed"):
 * jambs, head and sill around every bare authored window, plus hung shutters
 * on alternate rural/timber buildings. Every piece is proud of the wall face
 * and embedded 1 cm into the wall envelope so it carries a real area joint.
 */
function addWindowJoinery(
  author: ExteriorAuthor,
  panes: readonly WindowPane[],
  profile: string,
  variant: number,
): void {
  if (profile === 'canvas' || profile === 'open') return;
  const timber = profile === 'timber' || profile === 'rural';
  const material = timber ? 'wood' : 'stone';
  const shutters = timber && variant % 2 === 1;
  const t = 0.09, depth = 0.11;
  panes.forEach(({ axis, side, center, size }, index) => {
    const openW = axis === 'x' ? size.z : size.x;
    const faceAlong = axis === 'x' ? Math.abs(center.x) : Math.abs(center.z);
    // Wall face from the pane: builders seat panes 1-2 cm proud of the face.
    const face = Math.max(0.5, faceAlong - size[axis] * 0.5 - 0.015);
    const place = (geo: THREE.BufferGeometry, across: number, y: number, out: number): THREE.BufferGeometry => (
      axis === 'x'
        ? geo.translate(side * out, y, center.z + across)
        : geo.translate(center.x + across, y, side * out)
    );
    const piece = (width: number, height: number, thick: number): THREE.BufferGeometry => (
      axis === 'x' ? box(thick, height, width) : box(width, height, thick)
    );
    const frameOut = face - 0.01 + depth * 0.5;
    for (const sign of [-1, 1]) {
      author.add(`window-${index}-jamb-${sign}`, material,
        place(piece(t, size.y + 2 * t, depth), sign * (openW * 0.5 + t * 0.5), center.y, frameOut));
    }
    author.add(`window-${index}-head`, material,
      place(piece(openW + 2 * t, t, depth), 0, center.y + size.y * 0.5 + t * 0.5, frameOut));
    author.add(`window-${index}-sill`, material,
      place(piece(openW + 0.30, 0.09, 0.20), 0, center.y - size.y * 0.5 - 0.045, face - 0.01 + 0.10));
    if (shutters && index % 3 !== 2) {
      for (const sign of [-1, 1]) {
        author.add(`window-${index}-shutter-${sign}`, 'wood',
          place(piece(0.30, size.y * 0.94, 0.05), sign * (openW * 0.5 + t + 0.17), center.y, face - 0.005 + 0.025));
      }
    }
  });
}

function validateExteriorEnvelope(
  options: ExteriorOptions,
): ExteriorEnvelope & { variant: number } {
  const { id = 'building', w, d, wallH, profile = 'rural', variant = 0,
    bathhouseStyle, timberBathhouseEntry } = options;
  if (!(typeof w === 'number' && w > 1
      && typeof d === 'number' && d > 1
      && typeof wallH === 'number' && wallH > 1)) {
    throw new TypeError(`${id}: invalid exterior envelope`);
  }
  if (timberBathhouseEntry && (id !== 'bathhouse' || profile !== 'civic' || bathhouseStyle !== 'timber')) {
    throw new TypeError('Timber bathhouse frontage requires its explicit timber civic bathhouse owner');
  }
  if (bathhouseStyle && id !== 'bathhouse') throw new TypeError('Timber framing requires its explicit bathhouse owner');
  return { id, w, d, wallH, profile, variant, bathhouseStyle, timberBathhouseEntry };
}

function addPrimaryExterior(
  author: ExteriorAuthor,
  { w, d, wallH, profile, bathhouseStyle, timberBathhouseEntry }: ExteriorEnvelope,
  variant: number,
): void {
  const masonry = profile !== 'timber' && profile !== 'canvas';
  addCourses(author, w, d, wallH, masonry ? 'stone' : 'wood');
  addFacadeBayRhythm(author, w, d, wallH, profile, variant,
    bathhouseStyle === 'timber' && profile === 'desert');
  if (profile !== 'canvas' && profile !== 'open') {
    addEntryAssembly(author, w, d, wallH, profile, variant);
    if (timberBathhouseEntry) addTimberBathhouseEntry(author, timberBathhouseEntry);
    else addProfileSignature(author, w, d, wallH, profile, variant);
    addRoofService(author, w, d, wallH, profile, variant);
  }
}

function addSecondaryExterior(
  author: ExteriorAuthor,
  { w, d, wallH, profile }: ExteriorEnvelope,
  variant: number,
): void {
  // Dense rowhouse strips already carry authored window reveals, dormers and
  // street furniture. Alternate the heavyweight corner/service package there
  // so a whole block does not become the same repeated silhouette (and so the
  // merged geometry budget stays bounded). Landmarks keep the full package.
  const fullUrbanFixture = profile !== 'urban' || variant % 2 === 0;
  if (profile === 'civic' || profile === 'industrial'
      || (profile === 'urban' && fullUrbanFixture)) {
    addCornerPiers(author, w, d, wallH, profile === 'industrial' ? 'dark' : 'stone');
  }
  if (profile !== 'canvas' && profile !== 'open') addRainwater(author, w, d, wallH);
  if ((profile === 'rural' || profile === 'civic') && variant % 2 === 1) addQuoins(author, w, d, wallH);
  if (profile === 'industrial' || (profile === 'urban' && fullUrbanFixture)
      || (profile === 'rural' && variant % 3 === 1)) {
    addServiceCluster(author, w, d, wallH, profile === 'industrial');
  }
  if ((profile === 'urban' || profile === 'industrial' || profile === 'desert') && variant % 2 === 0) {
    addSupportedAwning(author, w, d, wallH, profile === 'desert' ? 'wood' : 'roof');
  }
}

function appendExteriorReceipt(
  parts: GeometryBuckets,
  receipt: ExteriorReceipt,
): ExteriorReceipt {
  let receipts = parts[EXTERIOR_RECEIPTS];
  if (!receipts) {
    receipts = [];
    Object.defineProperty(parts, EXTERIOR_RECEIPTS, { value: receipts, enumerable: false });
  }
  receipts.push(receipt);
  return receipt;
}

const CATALOG_PROFILES: Readonly<Record<string, string>> = {
  farmhouse: 'rural', tavern: 'rural', granary: 'timber', chapel: 'civic',
  logcabin: 'timber', alpine: 'timber', rangerlodge: 'timber', woodshed: 'timber',
  minaret: 'desert', caravanserai: 'desert', bathhouse: 'desert',
  cornershop: 'urban', church: 'civic', civichall: 'civic', firestation: 'industrial',
  factory: 'industrial', foundryoffice: 'industrial', depot: 'industrial',
  warehouse: 'industrial', fishery: 'industrial', boatshed: 'timber',
  lighthouse: 'civic', shed: 'industrial', compound: 'desert',
  onionchurch: 'civic', mill: 'rural', netyard: 'open',
  parkingdeck: 'industrial', gantry: 'open', containerrow: 'industrial',
  watertower: 'industrial', stack: 'industrial',
};

function inferCenteredWallEnvelope(
  parts: GeometryBuckets,
  info: BuildingInfo,
): InferredEnvelope | null {
  let best: InferredEnvelope | null = null;
  for (const key of ['plaster', 'plaster2', 'plaster3', 'stone', 'wood']) {
    for (const geo of parts[key] || []) {
      const bounds = boundsOf(geo);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      if (Math.abs(center.x) > 0.30 || Math.abs(center.z) > 0.30) continue;
      if (bounds.min.y > 0.22 || size.x < 2.4 || size.z < 2.4 || size.y < 1.8) continue;
      if (size.y > (info.h || 100) * 0.92) continue;
      const score = size.x * size.y * size.z;
      if (!best || score > best.score) best = { w: size.x, d: size.z, wallH: bounds.max.y, score };
    }
  }
  return best;
}

/** Add the shared façade pass to catalog builders that expose a centered body. */
export function addCatalogExterior(
  parts: GeometryBuckets,
  {
    id,
    info,
    variant = 0,
    bathhouseStyle,
  }: { id?: string; info?: BuildingInfo; variant?: number; bathhouseStyle?: 'timber' } = {},
): ExteriorReceipt | null {
  const own = parts[EXTERIOR_RECEIPTS]?.find((receipt) => receipt.profile !== 'carried');
  if (own) return own;
  const profile = id ? CATALOG_PROFILES[id] : undefined;
  if (!profile) return null;
  const envelope = inferCenteredWallEnvelope(parts, info || {});
  if (!envelope) return null;
  return addConnectedExterior(parts, { id, profile, variant, ...envelope, bathhouseStyle });
}

export function exteriorSupportEpsilon(): number { return SUPPORT_EPSILON; }

/** Chimney tops recorded on a bucket set by its exterior pass (building-local). */
export function exteriorChimneyTops(parts: GeometryBuckets): ReadonlyArray<[number, number, number]> {
  const receipts = parts[EXTERIOR_RECEIPTS];
  if (!receipts?.length) return [];
  const tops: Array<[number, number, number]> = [];
  for (const receipt of receipts) for (const top of receipt.chimneys) tops.push(top);
  return tops;
}

/**
 * Carry chimney tops from a merged sub-assembly onto the receiving bucket set
 * (optionally through the sub-assembly's placement matrix), so a building
 * assembled from several exterior-dressed parts reports every stack once.
 */
export function carryExteriorChimneyTops(
  target: GeometryBuckets,
  source: GeometryBuckets,
  matrix: THREE.Matrix4 | null = null,
): void {
  const tops = exteriorChimneyTops(source);
  if (!tops.length) return;
  const carried = tops.map(([x, y, z]) => {
    if (!matrix) return [x, y, z] as [number, number, number];
    const v = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
    return [v.x, v.y, v.z] as [number, number, number];
  });
  appendExteriorReceipt(target, {
    id: 'carried-chimneys', profile: 'carried', added: 0, maxSupportGap: 0, records: [], chimneys: carried,
  });
}
