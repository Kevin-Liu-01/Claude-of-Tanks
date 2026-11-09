/**
 * strikeJetAirframe.ts — Air Support's strike jet (air-support-270; the ruling: "The strike jet is a first-party procedural
 * model, like the AC-130"). It flies the recon pass, the strafing run and the precision bomb. Procedural and first-party at
 * the A-10C Thunderbolt II's proportions (16.3 m long, 17.5 m span, 4.5 m tall): the long slim fuselage with its bubble
 * canopy set well forward and the GAU-8's seven-barrel muzzle under the nose; the low straight wing with its slight taper,
 * the drooped tips and the gear pods under its leading edge; the two TF34 turbofans on pylons high on the rear fuselage,
 * between the wing and the tail, so the tail and the wing hide their exhaust; the twin fins on the tips of the tailplane;
 * a GBU-12 under each wing. Hog grey (FS 36118 gunship grey on the upper sides, lighter below) in vertex colours on one lit
 * material, one draw, built with the AC-130's kit (airframeParts.ts). Its own chunk: an Air Support battle loads it.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';
import { Parts, addLoft, box, lin, rod, surface } from './airframeParts.ts';

interface StrikeJetMaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }
/** A built jet: its root (nose +Z, port wing +X, up +Y), the GAU-8's muzzle and each engine's exhaust in that frame. */
export interface BuiltStrikeJet {
  root: THREE.Group;
  muzzle: THREE.Vector3;
  exhausts: readonly THREE.Vector3[];
  /** The two bombs under the wings (hidden once released). */
  bombs: readonly THREE.Object3D[];
  dispose(): void;
}

const UPPER = 0x5a6064, LOWER = 0x7c8387, GLASS = 0x1a2024, DARK = 0x25282b, INTAKE = 0x16181a, OLIVE = 0x4f5636,
  SOOT = 0x2f2c29, NOSE = 0x4a4f52;

/** Upper grey above the waterline, the lighter belly below (sy is the section's -1..1 height). */
const twoTone = (sy: number): readonly number[] => lin(sy > -0.2 ? UPPER : LOWER);

export function buildStrikeJetAirframe(hooks: StrikeJetMaterialHooks | null): BuiltStrikeJet {
  const root = new THREE.Group();
  root.name = 'strike jet (A-10 class)';
  const parts = new Parts();

  // ---- the fuselage: nose +z (the radome-less gun nose), the cockpit forward, the tail cone at -8.1 ----
  const NOSECAP = 1;
  addLoft(parts, [
    { z: 8.05, cy: -0.12, rx: 0, ry: 0, band: NOSECAP },
    { z: 7.85, cy: -0.12, rx: 0.28, ry: 0.3, band: NOSECAP },
    { z: 7.35, cy: -0.06, rx: 0.52, ry: 0.56, band: NOSECAP },
    { z: 7.35, cy: -0.06, rx: 0.52, ry: 0.56 },
    { z: 6.3, cy: 0.04, rx: 0.72, ry: 0.78 },
    { z: 4.6, cy: 0.1, rx: 0.84, ry: 0.86 },
    { z: 2.0, cy: 0.1, rx: 0.86, ry: 0.84 },
    { z: -1.5, cy: 0.16, rx: 0.78, ry: 0.76 },
    { z: -4.5, cy: 0.3, rx: 0.58, ry: 0.58 },
    { z: -6.9, cy: 0.46, rx: 0.36, ry: 0.4 },
    { z: -8.05, cy: 0.52, rx: 0.16, ry: 0.2 },
    { z: -8.2, cy: 0.53, rx: 0, ry: 0 },
  ], 18, 0, 2.4, (s, _sx, sy) => (s.band === NOSECAP ? lin(NOSE) : twoTone(sy)));
  // the bubble canopy, high and forward (the pilot's all-round view), and its dark frame at the windscreen
  addLoft(parts, [
    { z: 6.55, cy: 0.62, rx: 0, ry: 0 },
    { z: 6.25, cy: 0.66, rx: 0.34, ry: 0.32 },
    { z: 5.6, cy: 0.72, rx: 0.46, ry: 0.44 },
    { z: 4.7, cy: 0.72, rx: 0.46, ry: 0.42 },
    { z: 4.0, cy: 0.66, rx: 0.34, ry: 0.3 },
    { z: 3.6, cy: 0.6, rx: 0, ry: 0 },
  ], 16, 0, 2, () => lin(GLASS));
  box(parts, 0.86, 0.08, 0.1, 0, 0.98, 6.2, DARK);
  // the GAU-8/A's seven barrels in their shroud, just left of the centreline as on the airframe
  rod(parts, new THREE.Vector3(0.1, -0.3, 7.7), new THREE.Vector3(0, 0, 1), 0.2, 0.75, DARK, 10);
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2;
    rod(parts, new THREE.Vector3(0.1 + Math.cos(a) * 0.11, -0.3 + Math.sin(a) * 0.11, 8.2), new THREE.Vector3(0, 0, 1), 0.035, 0.32, INTAKE, 5);
  }

  // ---- the low straight wing: a slight taper, the tips drooped, the gear pods under the leading edge ----
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    surface(parts, { le: new THREE.Vector3(0, -0.4, 1.55), chord: 3.05, thick: 0.62 },
      { le: new THREE.Vector3(side * 7.6, -0.18, 1.05), chord: 1.75, thick: 0.28 }, up, 0, UPPER, UPPER);
    // the drooped tip
    surface(parts, { le: new THREE.Vector3(side * 7.55, -0.18, 1.05), chord: 1.75, thick: 0.28 },
      { le: new THREE.Vector3(side * 8.75, -0.42, 0.85), chord: 1.25, thick: 0.16 }, up, 0, UPPER, UPPER);
    addLoft(parts, [
      { z: 2.1, cy: -0.6, rx: 0, ry: 0 },
      { z: 1.8, cy: -0.62, rx: 0.28, ry: 0.3 },
      { z: 0.6, cy: -0.66, rx: 0.36, ry: 0.4 },
      { z: -0.9, cy: -0.6, rx: 0.3, ry: 0.32 },
      { z: -1.3, cy: -0.55, rx: 0, ry: 0 },
    ], 12, side * 3.05, 2.2, () => lin(LOWER));
  }

  // ---- the TF34 nacelles on their pylons, high on the rear fuselage: dark intakes, sooted exhausts ----
  const exhausts: THREE.Vector3[] = [];
  const INLET = 2, NOZZLE = 3;
  for (const side of [-1, 1]) {
    const x = side * 1.62, y = 1.18;
    addLoft(parts, [
      { z: -1.55, cy: y, rx: 0.5, ry: 0.5, band: INLET },
      { z: -1.7, cy: y, rx: 0.62, ry: 0.62, band: INLET },
      { z: -1.7, cy: y, rx: 0.62, ry: 0.62 },
      { z: -2.6, cy: y, rx: 0.66, ry: 0.66 },
      { z: -3.9, cy: y + 0.02, rx: 0.58, ry: 0.58 },
      { z: -4.55, cy: y + 0.04, rx: 0.42, ry: 0.42, band: NOZZLE },
      { z: -4.75, cy: y + 0.04, rx: 0.34, ry: 0.34, band: NOZZLE },
      { z: -4.75, cy: y + 0.04, rx: 0, ry: 0, band: NOZZLE },
    ], 16, x, 2, (s, _sx, sy) => (s.band === INLET ? lin(INTAKE) : s.band === NOZZLE ? lin(SOOT) : twoTone(sy)));
    box(parts, 0.22, 0.5, 1.5, side * 1.05, 0.72, -3.0, UPPER);
    exhausts.push(new THREE.Vector3(x, y + 0.04, -4.8));
  }

  // ---- the tailplane and its twin fins on its tips ----
  for (const side of [-1, 1]) {
    surface(parts, { le: new THREE.Vector3(0, 0.55, -6.15), chord: 1.85, thick: 0.24 },
      { le: new THREE.Vector3(side * 2.85, 0.55, -6.45), chord: 1.45, thick: 0.16 }, up, 0, UPPER, UPPER);
    surface(parts, { le: new THREE.Vector3(side * 2.85, -0.35, -6.0), chord: 2.05, thick: 0.22 },
      { le: new THREE.Vector3(side * 2.85, 2.35, -6.55), chord: 1.3, thick: 0.14 }, new THREE.Vector3(1, 0, 0), 0, UPPER, UPPER);
  }

  const material = new THREE.MeshStandardMaterial({ name: 'strike-jet-airframe', vertexColors: true, metalness: 0.28, roughness: 0.62 });
  hooks?.setup(material);
  const body = new THREE.Mesh(parts.geometry(), material);
  body.name = 'strike-jet-body';
  root.add(body);

  // ---- a GBU-12 on the inboard pylon of each wing: the olive Mk 82 body, its seeker head and its wings ----
  const bombParts = new Parts();
  addLoft(bombParts, [
    { z: 1.75, cy: 0, rx: 0, ry: 0 },
    { z: 1.55, cy: 0, rx: 0.1, ry: 0.1 },
    { z: 1.1, cy: 0, rx: 0.12, ry: 0.12 },
    { z: 0.9, cy: 0, rx: 0.14, ry: 0.14 },
    { z: -0.9, cy: 0, rx: 0.14, ry: 0.14 },
    { z: -1.3, cy: 0, rx: 0.08, ry: 0.08 },
    { z: -1.35, cy: 0, rx: 0, ry: 0 },
  ], 12, 0, 2, (s) => lin(s.z > 1.05 ? 0xb9b3a0 : OLIVE));
  for (let f = 0; f < 4; f++) {
    const fin = new THREE.BoxGeometry(0.02, 0.32, 0.42);
    fin.translate(0, 0.2, -1.0);
    fin.rotateZ(f * Math.PI / 2 + Math.PI / 4);
    bombParts.add(fin, () => lin(OLIVE));
  }
  const bombGeometry = bombParts.geometry();
  const bombs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const bomb = new THREE.Mesh(bombGeometry, material);
    bomb.name = 'strike-jet-gbu12';
    bomb.position.set(side * 3.9, -0.78, 1.1);
    root.add(bomb);
    bombs.push(bomb);
  }
  return {
    root,
    muzzle: new THREE.Vector3(0.1, -0.3, 8.55),
    exhausts,
    bombs,
    dispose() {
      root.removeFromParent();
      body.geometry.dispose();
      bombGeometry.dispose();
      hooks?.release(material);
      material.dispose();
    },
  };
}
