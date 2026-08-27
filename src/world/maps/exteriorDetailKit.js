// Shared connected exterior-detail authoring for procedural buildings.
//
// Each fixture is registered against either the wall envelope, the ground, or
// an earlier fixture. The authoring pass rejects disconnected parts while the
// geometries are still separate; after that they can be merged into the
// existing material buckets without carrying per-object runtime overhead.

import * as THREE from 'three';

const SUPPORT_EPSILON = 0.065;
const EXTERIOR_RECEIPTS = Symbol('exterior-detail-receipts');

function box(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const su = Math.max(w, d) * 0.9;
  const sv = Math.max(h, 0.12) * 0.9;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  geo.userData.detailUv = true;
  return geo;
}

function cylinder(radius, height, segments = 8) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1);
  geo.userData.detailUv = true;
  return geo;
}

function boundsOf(geo) {
  geo.computeBoundingBox();
  return geo.boundingBox.clone();
}

function aabbGap(a, b) {
  const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x);
  const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y);
  const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z);
  return Math.hypot(dx, dy, dz);
}

function bucket(parts, preferred, fallback = 'dark') {
  return parts[preferred] || parts[fallback] || Object.values(parts).find(Array.isArray);
}

function detailAuthor(parts, { w, d, wallH, id, profile }) {
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
  const records = [];

  const add = (partId, preferredBucket, geo, supportId = 'wall') => {
    const support = supports.get(supportId);
    if (!support) throw new Error(`${id}: missing exterior support ${supportId}`);
    const bounds = boundsOf(geo);
    const gap = aabbGap(bounds, support);
    if (gap > SUPPORT_EPSILON) {
      throw new Error(`${id}: floating exterior part ${partId} (${gap.toFixed(3)} m from ${supportId})`);
    }
    geo.userData.structureSupport = { building: id, part: partId, support: supportId, gap };
    bucket(parts, preferredBucket).push(geo);
    supports.set(partId, bounds);
    records.push(geo.userData.structureSupport);
    return geo;
  };

  return {
    add,
    receipt: () => ({ id, profile, added: records.length,
      maxSupportGap: Math.max(0, ...records.map((record) => record.gap)), records }),
  };
}

function addCourses(author, w, d, wallH, material) {
  const lowY = Math.min(0.72, wallH * 0.18);
  const highY = Math.max(lowY + 0.55, wallH - 0.32);
  for (const [name, y] of [['plinth', lowY], ['cornice', highY]]) {
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

function addCornerPiers(author, w, d, wallH, material) {
  const pierH = Math.max(1.4, wallH - 0.22);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    author.add(`pier-${sx}-${sz}`, material,
      box(0.28, pierH, 0.28)
        .translate(sx * (w / 2 + 0.015), pierH / 2, sz * (d / 2 + 0.015)));
  }
}

function addRainwater(author, w, d, wallH) {
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

function addServiceCluster(author, w, d, wallH, industrial = false) {
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

function addSupportedAwning(author, w, d, wallH, material) {
  const awningW = Math.min(w * 0.52, 5.8);
  const awningD = Math.min(1.25, d * 0.18);
  const y = Math.min(wallH - 0.42, 2.85);
  const z = d / 2 + awningD / 2 - 0.025;
  const canopy = box(awningW, 0.11, awningD);
  canopy.rotateX(-0.11);
  author.add('awning', material, canopy.translate(0, y, z));
  for (const sx of [-1, 1]) {
    const brace = box(0.10, 0.10, awningD * 0.92);
    brace.rotateX(sx * 0.02 - 0.48);
    author.add(`awning-brace-${sx}`, 'dark',
      brace.translate(sx * (awningW / 2 - 0.22), y - 0.30, z - 0.08), 'wall');
  }
}

/**
 * Add a bounded, zero-runtime-cost façade pass to an authored building.
 * Call this before the building's material buckets are merged.
 *
 * @returns {{id:string,profile:string,added:number,maxSupportGap:number,records:Array<object>}}
 */
export function addConnectedExterior(parts, {
  id = 'building', w, d, wallH, profile = 'rural', variant = 0,
} = {}) {
  if (!(w > 1 && d > 1 && wallH > 1)) throw new TypeError(`${id}: invalid exterior envelope`);
  const author = detailAuthor(parts, { w, d, wallH, id, profile });
  const masonry = profile !== 'timber' && profile !== 'canvas';
  addCourses(author, w, d, wallH, masonry ? 'stone' : 'wood');

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
  if (!parts[EXTERIOR_RECEIPTS]) {
    Object.defineProperty(parts, EXTERIOR_RECEIPTS, { value: [], enumerable: false });
  }
  parts[EXTERIOR_RECEIPTS].push(receipt);
  return receipt;
}

const CATALOG_PROFILES = {
  farmhouse: 'rural', granary: 'timber', chapel: 'civic', logcabin: 'timber',
  alpine: 'timber', woodshed: 'timber', minaret: 'desert', cornershop: 'urban',
  depot: 'industrial', warehouse: 'industrial', boatshed: 'timber',
  lighthouse: 'civic', shed: 'industrial', compound: 'desert',
};

function inferCenteredWallEnvelope(parts, info) {
  let best = null;
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
export function addCatalogExterior(parts, { id, info, variant = 0 } = {}) {
  if (parts[EXTERIOR_RECEIPTS]?.length) return parts[EXTERIOR_RECEIPTS][0];
  const profile = CATALOG_PROFILES[id];
  if (!profile) return null;
  const envelope = inferCenteredWallEnvelope(parts, info || {});
  if (!envelope) return null;
  return addConnectedExterior(parts, { id, profile, variant, ...envelope });
}

export function exteriorSupportEpsilon() { return SUPPORT_EPSILON; }
