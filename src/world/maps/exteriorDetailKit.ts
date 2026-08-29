// Shared connected exterior-detail authoring for procedural buildings.
//
// Each fixture is registered against either the wall envelope, the ground, or
// an earlier fixture. The authoring pass rejects disconnected parts while the
// geometries are still separate; after that they can be merged into the
// existing material buckets without carrying per-object runtime overhead.

import * as THREE from 'three';
import { pitchSkillionRoof } from '../propGeometry.ts';

const SUPPORT_EPSILON = 0.065;
const EXTERIOR_RECEIPTS = Symbol('exterior-detail-receipts');

export interface ExteriorSupportRecord {
  building: string;
  part: string;
  support: string;
  gap: number;
}

export interface ExteriorReceipt {
  id: string;
  profile: string;
  added: number;
  maxSupportGap: number;
  records: ExteriorSupportRecord[];
}

export interface GeometryBuckets {
  plaster: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass?: THREE.BufferGeometry[];
  baked?: THREE.BufferGeometry[];
  [name: string]: THREE.BufferGeometry[] | undefined;
  [EXTERIOR_RECEIPTS]?: ExteriorReceipt[];
}

export interface StructureDimensions {
  w: number;
  d: number;
  h: number;
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
}

interface ExteriorOptions {
  id?: string;
  w?: number;
  d?: number;
  wallH?: number;
  profile?: string;
  variant?: number;
}

interface ExteriorAuthor {
  add(
    partId: string,
    preferredBucket: string,
    geometry: THREE.BufferGeometry,
    supportId?: string,
  ): THREE.BufferGeometry;
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

function aabbGap(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x);
  const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y);
  const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z);
  return Math.hypot(dx, dy, dz);
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
  w, d, wallH, id, profile,
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
    const gap = aabbGap(bounds, support);
    if (gap > SUPPORT_EPSILON) {
      throw new Error(`${id}: floating exterior part ${partId} (${gap.toFixed(3)} m from ${supportId})`);
    }
    const record: ExteriorSupportRecord = {
      building: id, part: partId, support: supportId, gap,
    };
    geo.userData.structureSupport = record;
    bucket(parts, preferredBucket).push(geo);
    supports.set(partId, bounds);
    records.push(record);
    return geo;
  };

  return {
    add,
    receipt: () => ({ id, profile, added: records.length,
      maxSupportGap: Math.max(0, ...records.map((record) => record.gap)), records }),
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

function addFacadeBayRhythm(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
): void {
  if (!['urban', 'civic', 'industrial', 'desert'].includes(profile)) return;
  const material = profile === 'industrial' ? 'dark' : 'stone';
  const pierW = profile === 'desert' ? 0.24 : 0.14;
  const pierD = profile === 'desert' ? 0.16 : 0.12;
  const pierH = Math.max(1.7, wallH - 0.45);
  const bayCount = Math.max(2, Math.min(4, Math.round(w / 3.4)));
  for (let bay = 1; bay < bayCount; bay++) {
    const x = -w / 2 + (w * bay) / bayCount;
    for (const side of [-1, 1]) {
      author.add(`facade-bay-${bay}-${side}`, material,
        box(pierW, pierH, pierD)
          .translate(x, pierH / 2 + 0.10, side * (d / 2 + 0.035)));
    }
  }

  if (profile === 'industrial') {
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
}

function addProfileSignature(
  author: ExteriorAuthor,
  w: number,
  d: number,
  wallH: number,
  profile: string,
  variant: number,
): void {
  const frontZ = d / 2 + 0.06;
  if (profile === 'rural' || profile === 'timber') {
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
    return;
  }

  if (profile === 'urban' || profile === 'civic') {
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
    return;
  }

  if (profile === 'industrial') {
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
    return;
  }

  if (profile === 'desert') {
    // Grounded facade buttresses add adobe depth without a new material or
    // per-building object. They taper visually as stepped supported blocks.
    for (const side of [-1, 1]) {
      const x = side * w * (variant % 2 === 0 ? 0.34 : 0.26);
      author.add(`buttress-${side}`, 'stone',
        box(0.42, Math.min(1.55, wallH * 0.46), 0.72)
          .translate(x, Math.min(0.775, wallH * 0.23), d / 2 + 0.27), 'ground');
    }
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
  const {
    id = 'building', w, d, wallH, profile = 'rural', variant = 0,
  } = options;
  if (!(typeof w === 'number' && w > 1
      && typeof d === 'number' && d > 1
      && typeof wallH === 'number' && wallH > 1)) {
    throw new TypeError(`${id}: invalid exterior envelope`);
  }
  const author = detailAuthor(parts, { w, d, wallH, id, profile });
  const masonry = profile !== 'timber' && profile !== 'canvas';
  addCourses(author, w, d, wallH, masonry ? 'stone' : 'wood');
  addFacadeBayRhythm(author, w, d, wallH, profile, variant);
  if (profile !== 'canvas' && profile !== 'open') {
    addEntryAssembly(author, w, d, wallH, profile, variant);
    addProfileSignature(author, w, d, wallH, profile, variant);
    addRoofService(author, w, d, wallH, profile, variant);
  }

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
  if (profile === 'industrial' || (profile === 'urban' && fullUrbanFixture)
      || (profile === 'rural' && variant % 3 === 1)) {
    addServiceCluster(author, w, d, wallH, profile === 'industrial');
  }
  if ((profile === 'urban' || profile === 'industrial' || profile === 'desert') && variant % 2 === 0) {
    addSupportedAwning(author, w, d, wallH, profile === 'desert' ? 'wood' : 'roof');
  }
  const receipt = author.receipt();
  let receipts = parts[EXTERIOR_RECEIPTS];
  if (!receipts) {
    receipts = [];
    Object.defineProperty(parts, EXTERIOR_RECEIPTS, { value: receipts, enumerable: false });
  }
  receipts.push(receipt);
  return receipt;
}

const CATALOG_PROFILES: Readonly<Record<string, string>> = {
  farmhouse: 'rural', granary: 'timber', chapel: 'civic', logcabin: 'timber',
  alpine: 'timber', woodshed: 'timber', minaret: 'desert', cornershop: 'urban',
  depot: 'industrial', warehouse: 'industrial', boatshed: 'timber',
  lighthouse: 'civic', shed: 'industrial', compound: 'desert',
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
  }: { id?: string; info?: BuildingInfo; variant?: number } = {},
): ExteriorReceipt | null {
  if (parts[EXTERIOR_RECEIPTS]?.length) return parts[EXTERIOR_RECEIPTS][0];
  const profile = id ? CATALOG_PROFILES[id] : undefined;
  if (!profile) return null;
  const envelope = inferCenteredWallEnvelope(parts, info || {});
  if (!envelope) return null;
  return addConnectedExterior(parts, { id, profile, variant, ...envelope });
}

export function exteriorSupportEpsilon(): number { return SUPPORT_EPSILON; }
