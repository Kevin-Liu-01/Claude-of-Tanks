// Low-cost civilian and utility vehicle families for battlefield dressing.
// Every builder returns one merged, UV-bearing, vertex-colored geometry so
// props.ts can render every instance of a family in one draw call. Local +Z is
// the nose, the footprint is XZ-centered, and the lowest tire point is y=0.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Rng = () => number;
type Palette = readonly [number, number, number];
type Builder = (rng: Rng) => THREE.BufferGeometry;

export type CivilianVehicleKind =
  | 'truck'
  | 'jeep'
  | 'sedan'
  | 'wagon'
  | 'pickup'
  | 'van'
  | 'truckbox'
  | 'truckflatbed';

export interface CivilianVehicleReceipt {
  lane: 'heavy' | 'light';
  halfWidth: number;
  halfLength: number;
  height: number;
  triangleBudget: number;
  build: Builder;
  broken: Builder;
}

const _color = new THREE.Color();
const BLACK: Palette = [0.60, 0.03, 0.055];
const RUBBER: Palette = [0.60, 0.025, 0.075];
const GLASS: Palette = [0.57, 0.17, 0.19];
const STEEL: Palette = [0.58, 0.045, 0.38];
const DARK_STEEL: Palette = [0.60, 0.055, 0.20];
const ALUMINUM: Palette = [0.58, 0.035, 0.58];
const LAMP_WHITE: Palette = [0.12, 0.18, 0.74];
const LAMP_AMBER: Palette = [0.095, 0.72, 0.50];
const LAMP_RED: Palette = [0.005, 0.63, 0.34];
const PLATE: Palette = [0.12, 0.08, 0.72];
const WOOD: Palette = [0.075, 0.34, 0.31];
const CANVAS: Palette = [0.105, 0.18, 0.33];
const CHAR: Palette = [0.07, 0.10, 0.06];
const RUST: Palette = [0.045, 0.49, 0.19];

const CAR_PAINTS: readonly Palette[] = [
  [0.60, 0.18, 0.25], // slate blue
  [0.02, 0.48, 0.30], // faded red
  [0.12, 0.22, 0.35], // ochre
  [0.29, 0.21, 0.25], // forest green
  [0.00, 0.02, 0.44], // oxidized white
  [0.58, 0.04, 0.29], // grey
];
const WORK_PAINTS: readonly Palette[] = [
  [0.13, 0.25, 0.38], // utility yellow
  [0.03, 0.36, 0.30], // brick red
  [0.55, 0.13, 0.31], // industrial blue
  [0.18, 0.17, 0.27], // faded olive
  [0.00, 0.02, 0.48], // service white
];

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, uv.getX(index) * Math.max(w, d) * 0.75, uv.getY(index) * h * 0.9);
  }
  return geometry;
}

function paint<T extends THREE.BufferGeometry>(
  geometry: T,
  palette: Palette,
  rng: Rng,
  variation = 0.035,
): T {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const partDrift = (rng() - 0.5) * variation;
  for (let index = 0; index < count; index++) {
    const faceWear = (rng() - 0.5) * variation * 0.42;
    _color.setHSL(
      palette[0],
      palette[1],
      Math.max(0.025, Math.min(0.92, palette[2] + partDrift + faceWear)),
      THREE.SRGBColorSpace,
    );
    colors[index * 3] = _color.r;
    colors[index * 3 + 1] = _color.g;
    colors[index * 3 + 2] = _color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts.map((part) => part.index ? part.toNonIndexed() : part), false);
  if (!geometry) throw new Error('civilian vehicle geometry merge produced no result');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  for (const part of parts) part.dispose();
  return geometry;
}

function addBox(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  palette: Palette,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  variation = 0.035,
): void {
  parts.push(paint(box(w, h, d).translate(x, y, z), palette, rng, variation));
}

function choose(rng: Rng, palettes: readonly Palette[]): Palette {
  return palettes[Math.min(palettes.length - 1, Math.floor(rng() * palettes.length))];
}

function addWheel(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  x: number,
  z: number,
  radius: number,
  width: number,
  dual = false,
): void {
  const tire = new THREE.CylinderGeometry(radius, radius, width, 12, 1);
  tire.rotateZ(Math.PI / 2);
  tire.translate(x, radius, z);
  parts.push(paint(tire, RUBBER, rng, 0.025));
  const rim = new THREE.CylinderGeometry(radius * 0.57, radius * 0.57, width + 0.012, 10, 1);
  rim.rotateZ(Math.PI / 2);
  rim.translate(x, radius, z);
  parts.push(paint(rim, STEEL, rng, 0.025));
  const hub = new THREE.CylinderGeometry(radius * 0.19, radius * 0.19, width + 0.026, 10, 1);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, radius, z);
  parts.push(paint(hub, DARK_STEEL, rng, 0.02));
  if (dual) {
    const ring = new THREE.TorusGeometry(radius * 0.74, radius * 0.035, 4, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, radius, z);
    parts.push(paint(ring, BLACK, rng, 0.02));
  }
}

function addAxleWheels(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  halfTrack: number,
  z: number,
  radius: number,
  width: number,
  dual = false,
): void {
  addWheel(parts, rng, -halfTrack, z, radius, width, dual);
  addWheel(parts, rng, halfTrack, z, radius, width, dual);
}

function addRoadDetails(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  halfWidth: number,
  frontZ: number,
  rearZ: number,
  lampY: number,
  bumperY: number,
): void {
  addBox(parts, rng, DARK_STEEL, halfWidth * 2.05, 0.12, 0.15, 0, bumperY, frontZ + 0.08);
  addBox(parts, rng, DARK_STEEL, halfWidth * 2.0, 0.11, 0.14, 0, bumperY, rearZ - 0.07);
  for (const side of [-1, 1]) {
    addBox(parts, rng, LAMP_WHITE, 0.25, 0.18, 0.045, side * halfWidth * 0.66, lampY, frontZ + 0.17, 0.015);
    addBox(parts, rng, LAMP_AMBER, 0.12, 0.14, 0.05, side * halfWidth * 0.91, lampY, frontZ + 0.17, 0.015);
    addBox(parts, rng, LAMP_RED, 0.20, 0.16, 0.045, side * halfWidth * 0.77, lampY, rearZ - 0.15, 0.015);
  }
  addBox(parts, rng, PLATE, 0.45, 0.13, 0.035, 0, bumperY + 0.05, rearZ - 0.16, 0.01);
}

function addCabDetails(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  paintColor: Palette,
  halfWidth: number,
  cabCenterZ: number,
  sillY: number,
  roofY: number,
  windshieldZ: number,
): void {
  const glassHeight = Math.max(0.28, roofY - sillY - 0.13);
  addBox(parts, rng, GLASS, halfWidth * 1.58, glassHeight, 0.045, 0, sillY + glassHeight * 0.5, windshieldZ, 0.02);
  addBox(parts, rng, GLASS, halfWidth * 1.58, glassHeight * 0.82, 0.045, 0, sillY + glassHeight * 0.48, cabCenterZ - 0.82, 0.02);
  for (const side of [-1, 1]) {
    addBox(parts, rng, GLASS, 0.045, glassHeight * 0.84, 0.60, side * halfWidth * 0.92, sillY + glassHeight * 0.5, cabCenterZ - 0.05, 0.02);
    addBox(parts, rng, DARK_STEEL, 0.055, 0.055, 0.30, side * halfWidth * 1.12, sillY + glassHeight * 0.72, windshieldZ - 0.08, 0.02);
    addBox(parts, rng, paintColor, 0.04, 0.06, 0.22, side * halfWidth * 0.98, sillY - 0.13, cabCenterZ - 0.10, 0.02);
  }
  addBox(parts, rng, paintColor, halfWidth * 1.92, 0.10, 1.73, 0, roofY, cabCenterZ - 0.05);
}

function addGrille(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  width: number,
  y: number,
  z: number,
  slats = 6,
): void {
  addBox(parts, rng, DARK_STEEL, width, 0.42, 0.035, 0, y, z, 0.02);
  for (let index = 0; index < slats; index++) {
    const x = -width * 0.42 + (index / Math.max(1, slats - 1)) * width * 0.84;
    addBox(parts, rng, ALUMINUM, 0.035, 0.34, 0.045, x, y, z + 0.025, 0.015);
  }
}

function buildPassengerCar(rng: Rng, bodyStyle: 'sedan' | 'wagon'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = choose(rng, CAR_PAINTS);
  const halfWidth = 0.87;
  addBox(parts, rng, DARK_STEEL, 1.62, 0.18, 3.72, 0, 0.45, 0);
  addBox(parts, rng, body, 1.72, 0.48, 3.82, 0, 0.70, 0);
  addBox(parts, rng, body, 1.64, 0.27, 1.23, 0, 0.99, 1.31);
  addBox(parts, rng, body, 1.60, 0.27, bodyStyle === 'wagon' ? 1.18 : 0.82,
    0, 0.98, bodyStyle === 'wagon' ? -1.32 : -1.53);
  addBox(parts, rng, body, 1.50, bodyStyle === 'wagon' ? 0.70 : 0.61,
    bodyStyle === 'wagon' ? 2.22 : 1.75, 0, 1.23, bodyStyle === 'wagon' ? -0.28 : -0.15);
  addCabDetails(parts, rng, body, halfWidth, bodyStyle === 'wagon' ? -0.28 : -0.15,
    1.03, bodyStyle === 'wagon' ? 1.63 : 1.55, 0.72);
  addGrille(parts, rng, 0.86, 0.78, 1.93, 5);
  addRoadDetails(parts, rng, halfWidth, 1.93, -1.93, 0.82, 0.51);
  addAxleWheels(parts, rng, 0.89, 1.20, 0.37, 0.20);
  addAxleWheels(parts, rng, 0.89, -1.20, 0.37, 0.20);
  // Crisp door seams and rocker strip sell scale without extra materials.
  for (const side of [-1, 1]) {
    addBox(parts, rng, DARK_STEEL, 0.025, 0.035, 1.43, side * 0.876, 0.82, -0.15, 0.01);
    addBox(parts, rng, ALUMINUM, 0.03, 0.04, 0.23, side * 0.887, 1.02, -0.02, 0.01);
  }
  return merge(parts);
}

function buildPickup(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = choose(rng, WORK_PAINTS);
  addBox(parts, rng, DARK_STEEL, 1.78, 0.20, 4.60, 0, 0.48, 0);
  addBox(parts, rng, body, 1.90, 0.52, 4.50, 0, 0.75, 0);
  addBox(parts, rng, body, 1.82, 0.28, 1.18, 0, 1.06, 1.52);
  addBox(parts, rng, body, 1.76, 0.82, 1.35, 0, 1.28, 0.57);
  addCabDetails(parts, rng, body, 0.95, 0.57, 1.15, 1.71, 1.20);
  // Open bed: floor, side rails, ribbed inner panels, and tailgate.
  addBox(parts, rng, DARK_STEEL, 1.70, 0.10, 1.95, 0, 0.94, -1.18);
  for (const side of [-1, 1]) addBox(parts, rng, body, 0.11, 0.55, 2.02, side * 0.88, 1.15, -1.18);
  addBox(parts, rng, body, 1.72, 0.53, 0.10, 0, 1.14, -2.15);
  for (let index = 0; index < 5; index++) {
    addBox(parts, rng, DARK_STEEL, 1.56, 0.025, 0.035, 0, 1.00, -1.88 + index * 0.37, 0.01);
  }
  addGrille(parts, rng, 1.02, 0.82, 2.27, 6);
  addRoadDetails(parts, rng, 0.95, 2.27, -2.28, 0.87, 0.55);
  addAxleWheels(parts, rng, 0.98, 1.38, 0.42, 0.23);
  addAxleWheels(parts, rng, 0.98, -1.38, 0.42, 0.23);
  return merge(parts);
}

function buildVan(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = choose(rng, WORK_PAINTS);
  addBox(parts, rng, DARK_STEEL, 1.78, 0.20, 4.35, 0, 0.45, 0);
  addBox(parts, rng, body, 1.90, 0.58, 4.30, 0, 0.75, 0);
  addBox(parts, rng, body, 1.82, 1.28, 3.45, 0, 1.38, -0.20);
  addBox(parts, rng, body, 1.72, 0.31, 0.72, 0, 1.06, 1.82);
  addCabDetails(parts, rng, body, 0.95, 0.82, 1.20, 2.02, 1.70);
  addGrille(parts, rng, 0.94, 0.86, 2.18, 6);
  addRoadDetails(parts, rng, 0.95, 2.18, -2.18, 0.90, 0.54);
  addAxleWheels(parts, rng, 0.98, 1.36, 0.41, 0.23);
  addAxleWheels(parts, rng, 0.98, -1.38, 0.41, 0.23);
  // Sliding-door runner and split rear doors.
  addBox(parts, rng, DARK_STEEL, 0.025, 0.035, 1.62, 0.956, 1.54, -0.58, 0.01);
  addBox(parts, rng, DARK_STEEL, 0.035, 1.00, 0.025, 0, 1.39, -2.164, 0.01);
  return merge(parts);
}

function buildUtility4x4(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body: Palette = rng() < 0.55 ? [0.19, 0.18, 0.28] : [0.58, 0.07, 0.35];
  addBox(parts, rng, DARK_STEEL, 1.44, 0.17, 3.38, 0, 0.45, 0);
  addBox(parts, rng, body, 1.54, 0.48, 3.30, 0, 0.72, 0);
  addBox(parts, rng, body, 1.48, 0.28, 1.05, 0, 1.04, 1.22);
  addBox(parts, rng, GLASS, 1.35, 0.43, 0.045, 0, 1.41, 0.71, 0.02);
  addBox(parts, rng, body, 1.47, 0.07, 0.09, 0, 1.65, 0.71);
  for (const side of [-1, 1]) {
    addBox(parts, rng, CANVAS, 0.55, 0.42, 0.10, side * 0.42, 1.12, -0.12);
    addBox(parts, rng, DARK_STEEL, 0.045, 0.58, 0.045, side * 0.64, 1.43, -0.63);
  }
  addRoadDetails(parts, rng, 0.78, 1.68, -1.68, 0.86, 0.49);
  addGrille(parts, rng, 0.78, 0.82, 1.71, 5);
  addAxleWheels(parts, rng, 0.81, 1.08, 0.38, 0.22);
  addAxleWheels(parts, rng, 0.81, -1.07, 0.38, 0.22);
  const spare = new THREE.TorusGeometry(0.29, 0.09, 5, 11);
  spare.translate(0, 1.03, -1.72);
  parts.push(paint(spare, RUBBER, rng, 0.025));
  return merge(parts);
}

function addTruckChassis(parts: THREE.BufferGeometry[], rng: Rng, body: Palette): void {
  addBox(parts, rng, DARK_STEEL, 2.05, 0.24, 5.86, 0, 0.58, -0.02);
  addBox(parts, rng, body, 2.08, 1.10, 1.54, 0, 1.28, 1.78);
  addBox(parts, rng, body, 1.86, 0.34, 1.02, 0, 1.02, 2.78);
  addCabDetails(parts, rng, body, 1.04, 1.78, 1.34, 1.90, 2.55);
  addGrille(parts, rng, 1.20, 0.95, 2.94, 7);
  addRoadDetails(parts, rng, 1.04, 2.94, -2.94, 1.02, 0.58);
  addAxleWheels(parts, rng, 1.08, 2.08, 0.46, 0.28);
  addAxleWheels(parts, rng, 1.08, -1.05, 0.46, 0.38, true);
  addAxleWheels(parts, rng, 1.08, -2.07, 0.46, 0.38, true);
}

function addBoxTruckBody(parts: THREE.BufferGeometry[], rng: Rng): void {
  addBox(parts, rng, [0.10, 0.07, 0.62], 2.16, 1.82, 3.58, 0, 1.55, -1.22, 0.06);
  for (let index = 0; index < 5; index++) {
    addBox(parts, rng, ALUMINUM, 2.18, 0.035, 0.035, 0, 0.82 + index * 0.35, -3.02, 0.01);
  }
  addBox(parts, rng, DARK_STEEL, 0.045, 1.48, 0.04, 0, 1.52, -3.05, 0.01);
}

function addOpenTruckBed(
  parts: THREE.BufferGeometry[],
  rng: Rng,
  body: Palette,
  cargo: boolean,
): void {
  addBox(parts, rng, cargo ? [0.075, 0.28, 0.25] : body,
    2.18, 0.33, 3.60, 0, 0.91, -1.26);
  for (const side of [-1, 1]) {
    addBox(parts, rng, body, 0.11, cargo ? 0.74 : 0.53, 3.48, side * 1.04, 1.14, -1.26);
  }
  addBox(parts, rng, body, 2.08, cargo ? 0.72 : 0.50, 0.11, 0, 1.13, -3.00);
}

function addCargoTruckBody(parts: THREE.BufferGeometry[], rng: Rng, body: Palette): void {
  addOpenTruckBed(parts, rng, body, true);
  addBox(parts, rng, CANVAS, 2.02, 1.04, 3.34, 0, 1.72, -1.25, 0.055);
  for (let index = 0; index < 5; index++) {
    addBox(parts, rng, DARK_STEEL, 2.10, 0.055, 0.045, 0, 2.05, -2.64 + index * 0.70, 0.01);
  }
}

function addFlatbedTruckBody(parts: THREE.BufferGeometry[], rng: Rng, body: Palette): void {
  addOpenTruckBed(parts, rng, body, false);
  for (let index = 0; index < 4; index++) {
    const log = new THREE.CylinderGeometry(0.16, 0.16, 2.95, 7, 1);
    log.rotateX(Math.PI / 2);
    log.translate(-0.68 + index * 0.44, 1.24, -1.28);
    parts.push(paint(log, WOOD, rng, 0.06));
  }
  addBox(parts, rng, DARK_STEEL, 0.64, 0.39, 0.78, 0.62, 1.27, -0.02);
  for (const z of [-2.35, -0.30]) addBox(parts, rng, ALUMINUM, 2.13, 0.04, 0.055, 0, 1.41, z, 0.01);
}

function buildTruck(rng: Rng, bodyStyle: 'cargo' | 'box' | 'flatbed'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = bodyStyle === 'cargo' ? [0.19, 0.18, 0.27] as Palette : choose(rng, WORK_PAINTS);
  addTruckChassis(parts, rng, body);
  if (bodyStyle === 'box') addBoxTruckBody(parts, rng);
  else if (bodyStyle === 'cargo') addCargoTruckBody(parts, rng, body);
  else addFlatbedTruckBody(parts, rng, body);
  return merge(parts);
}

function buildBrokenVehicle(
  rng: Rng,
  width: number,
  length: number,
  cabZ: number,
  wheelZ: readonly number[],
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const charPaint = (geometry: THREE.BufferGeometry, rustChance = 0.28): THREE.BufferGeometry => {
    const palette = rng() < rustChance ? RUST : CHAR;
    return paint(geometry, palette, rng, 0.07);
  };
  parts.push(charPaint(box(width * 0.90, 0.26, length * 0.94).translate(0, 0.28, 0), 0.35));
  const shell = box(width * 0.78, 0.62, Math.min(1.50, length * 0.34));
  shell.rotateZ((rng() - 0.5) * 0.16);
  parts.push(charPaint(shell.translate(0.04, 0.72, cabZ), 0.30));
  for (const z of wheelZ.slice(0, 3)) {
    const rim = new THREE.CylinderGeometry(0.27, 0.27, 0.18, 9, 1);
    rim.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.28);
    rim.translate((rng() < 0.5 ? -1 : 1) * width * 0.48, 0.27, z);
    parts.push(charPaint(rim, 0.45));
  }
  // Detached door and scorched crossmembers keep the wreck readable.
  const door = box(0.055, 0.62, 0.78);
  door.rotateX(Math.PI / 2 - 0.10);
  door.rotateY((rng() - 0.5) * 1.1);
  parts.push(charPaint(door.translate(width * 0.72, 0.08, cabZ - 0.20), 0.42));
  for (const z of [-length * 0.28, 0, length * 0.28]) {
    parts.push(charPaint(box(width * 0.88, 0.12, 0.08).translate(0, 0.47, z), 0.40));
  }
  return merge(parts);
}

const brokenSedan = (rng: Rng): THREE.BufferGeometry => buildBrokenVehicle(rng, 1.72, 3.82, -0.12, [1.20, -1.20]);
const brokenPickup = (rng: Rng): THREE.BufferGeometry => buildBrokenVehicle(rng, 1.90, 4.50, 0.56, [1.38, -1.38]);
const brokenVan = (rng: Rng): THREE.BufferGeometry => buildBrokenVehicle(rng, 1.90, 4.30, 0.65, [1.36, -1.38]);
const brokenTruck = (rng: Rng): THREE.BufferGeometry => buildBrokenVehicle(rng, 2.12, 5.86, 1.72, [2.08, -1.05, -2.07]);

export const CIVILIAN_VEHICLE_RECEIPTS = {
  truck: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 2.30, triangleBudget: 1600,
    build: (rng: Rng) => buildTruck(rng, 'cargo'), broken: brokenTruck },
  jeep: { lane: 'light', halfWidth: 0.94, halfLength: 1.88, height: 1.73, triangleBudget: 950,
    build: buildUtility4x4, broken: brokenSedan },
  sedan: { lane: 'light', halfWidth: 1.01, halfLength: 2.13, height: 1.61, triangleBudget: 950,
    build: (rng: Rng) => buildPassengerCar(rng, 'sedan'), broken: brokenSedan },
  wagon: { lane: 'light', halfWidth: 1.01, halfLength: 2.13, height: 1.69, triangleBudget: 950,
    build: (rng: Rng) => buildPassengerCar(rng, 'wagon'), broken: brokenSedan },
  pickup: { lane: 'light', halfWidth: 1.11, halfLength: 2.47, height: 1.77, triangleBudget: 1050,
    build: buildPickup, broken: brokenPickup },
  van: { lane: 'light', halfWidth: 1.11, halfLength: 2.38, height: 2.08, triangleBudget: 950,
    build: buildVan, broken: brokenVan },
  truckbox: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 2.47, triangleBudget: 1600,
    build: (rng: Rng) => buildTruck(rng, 'box'), broken: brokenTruck },
  truckflatbed: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 1.96, triangleBudget: 1700,
    build: (rng: Rng) => buildTruck(rng, 'flatbed'), broken: brokenTruck },
} satisfies Record<CivilianVehicleKind, CivilianVehicleReceipt>;

const INDUSTRIAL_HEAVY: readonly CivilianVehicleKind[] = ['truckbox', 'truckflatbed', 'truck'];
const RURAL_HEAVY: readonly CivilianVehicleKind[] = ['truckflatbed', 'truck', 'truckbox'];
const DRY_HEAVY: readonly CivilianVehicleKind[] = ['truck', 'truckflatbed', 'truckbox'];
const INDUSTRIAL_LIGHT: readonly CivilianVehicleKind[] = ['sedan', 'van', 'pickup'];
const RURAL_LIGHT: readonly CivilianVehicleKind[] = ['wagon', 'pickup', 'jeep'];
const DRY_LIGHT: readonly CivilianVehicleKind[] = ['pickup', 'jeep', 'van'];

const INDUSTRIAL_MAPS = new Set(['urban', 'railyard', 'foundry', 'caldera', 'blackglass', 'skybridge']);
const DRY_MAPS = new Set(['desert', 'badlands', 'frontier', 'titanGorge']);

/** Deterministic map-flavored selection; at most three pools per lane/map. */
export function pickCivilianVehicleKind(
  mapId: string,
  lane: 'heavy' | 'light',
  roll: number,
): CivilianVehicleKind {
  const industrial = INDUSTRIAL_MAPS.has(mapId);
  const dry = DRY_MAPS.has(mapId);
  const choices = lane === 'heavy'
    ? industrial ? INDUSTRIAL_HEAVY : dry ? DRY_HEAVY : RURAL_HEAVY
    : industrial ? INDUSTRIAL_LIGHT : dry ? DRY_LIGHT : RURAL_LIGHT;
  return choices[Math.min(choices.length - 1, Math.floor(Math.max(0, Math.min(0.999999, roll)) * choices.length))];
}
