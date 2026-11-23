/**
 * fighterJetAirframe.ts — Air Support's fighter (air-support-275; owner 2026-11-21: "i need one where theres a jet firing
 * missiles. and bombs need a jet fighter too"). It flies the precision bomb and the Maverick run; the A-10
 * (strikeJetAirframe.ts) keeps the strafing run and the recon pass. Procedural and first-party at the F-16C's proportions
 * (15.0 m long, 9.5 m span over its tip rails, 4.9 m tall): the pointed radome, the bubble canopy set forward with no frame
 * behind the windscreen, the chin intake under the cockpit, the leading-edge strakes blending into a cropped delta wing
 * (40-degree sweep) with a launch rail on each tip, the all-moving tailplanes with their anhedral, the single tall fin
 * and the two ventral fins, one engine's nozzle. Air-superiority grey (FS 36270 on the upper sides, FS 36375 below) in
 * vertex colours on one lit material, one draw, built with the AC-130's kit (airframeParts.ts).
 *
 * Its stores sit where the run releases them (sim/strikeRuns.ts FIGHTER_BOMB_PYLON, FIGHTER_MISSILE_RAIL): a GBU-12 on
 * each inboard pylon, two AGM-65 Mavericks on a twin rack under each wing (missile k leaves the port rack when even, the
 * starboard one when odd, the outer one first). Its own chunk with the mode world: an Air Support battle loads it.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';
import { Parts, addLoft, box, lin, rod, surface } from './airframeParts.ts';
import { FIGHTER_BOMB_PYLON, FIGHTER_MISSILE_RAIL } from '../sim/strikeRuns.ts';

interface FighterMaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }
/** A built fighter: its root (nose +Z, port wing +X, up +Y), its exhaust and its stores in that frame. */
export interface BuiltFighterJet {
  root: THREE.Group;
  exhausts: readonly THREE.Vector3[];
  /** The two GBU-12s on the inboard pylons, port first (the port one is the run's: FIGHTER_BOMB_PYLON). */
  bombs: readonly THREE.Object3D[];
  /** The four Mavericks in launch order: port outer, starboard outer, port inner, starboard inner. */
  missiles: readonly THREE.Object3D[];
  dispose(): void;
}

const UPPER = 0x6b7177, LOWER = 0x8c9297, GLASS = 0x2a2414, DARK = 0x2b2e31, INTAKE = 0x141618, SOOT = 0x34302c,
  RADOME = 0x5f6469, OLIVE = 0x4f5636, SEEKER = 0xb9b3a0, MAVERICK = 0xd8d6cc;
const twoTone = (sy: number): readonly number[] => lin(sy > -0.15 ? UPPER : LOWER);

export function buildFighterJetAirframe(hooks: FighterMaterialHooks | null): BuiltFighterJet {
  const root = new THREE.Group();
  root.name = 'strike fighter (F-16 class)';
  const parts = new Parts();

  // ---- the fuselage: the radome at +z, the cockpit forward, the engine to the nozzle at -7.3 ----
  const CAP = 1, NOZZLE = 2;
  addLoft(parts, [
    { z: 7.6, cy: 0.05, rx: 0, ry: 0, band: CAP },
    { z: 7.1, cy: 0.05, rx: 0.2, ry: 0.22, band: CAP },
    { z: 6.2, cy: 0.08, rx: 0.42, ry: 0.46, band: CAP },
    { z: 5.6, cy: 0.1, rx: 0.52, ry: 0.56 },
    { z: 4.2, cy: 0.12, rx: 0.6, ry: 0.68 },
    { z: 2.4, cy: 0.06, rx: 0.68, ry: 0.72 },
    { z: 0.0, cy: 0.04, rx: 0.74, ry: 0.7 },
    { z: -2.8, cy: 0.06, rx: 0.7, ry: 0.66 },
    { z: -5.4, cy: 0.06, rx: 0.6, ry: 0.6 },
    { z: -6.7, cy: 0.06, rx: 0.52, ry: 0.52, band: NOZZLE },
    { z: -7.3, cy: 0.06, rx: 0.46, ry: 0.46, band: NOZZLE },
    { z: -7.3, cy: 0.06, rx: 0, ry: 0, band: NOZZLE },
  ], 18, 0, 2.3, (s, _sx, sy) => (s.band === CAP ? lin(RADOME) : s.band === NOZZLE ? lin(SOOT) : twoTone(sy)));
  // the bubble canopy, gold-tinted, high and forward, with no frame behind the windscreen
  addLoft(parts, [
    { z: 5.25, cy: 0.62, rx: 0, ry: 0 },
    { z: 4.85, cy: 0.7, rx: 0.3, ry: 0.3 },
    { z: 4.1, cy: 0.78, rx: 0.4, ry: 0.4 },
    { z: 3.3, cy: 0.74, rx: 0.36, ry: 0.34 },
    { z: 2.5, cy: 0.62, rx: 0.2, ry: 0.18 },
    { z: 2.1, cy: 0.56, rx: 0, ry: 0 },
  ], 16, 0, 2, () => lin(GLASS));
  // the dorsal spine behind the canopy, down to the fin
  addLoft(parts, [
    { z: 2.3, cy: 0.58, rx: 0, ry: 0 },
    { z: 1.8, cy: 0.62, rx: 0.3, ry: 0.22 },
    { z: -3.0, cy: 0.62, rx: 0.34, ry: 0.22 },
    { z: -4.2, cy: 0.56, rx: 0, ry: 0 },
  ], 10, 0, 2, () => lin(UPPER));
  // the chin intake under the cockpit: its dark mouth and the duct back under the belly
  addLoft(parts, [
    { z: 3.15, cy: -0.86, rx: 0.5, ry: 0.36 },
    { z: 3.0, cy: -0.86, rx: 0.5, ry: 0.36 },
    { z: 1.0, cy: -0.72, rx: 0.52, ry: 0.4 },
    { z: -1.2, cy: -0.5, rx: 0.4, ry: 0.3 },
    { z: -1.6, cy: -0.45, rx: 0, ry: 0 },
  ], 14, 0, 2.4, () => lin(LOWER));
  box(parts, 0.86, 0.6, 0.05, 0, -0.86, 3.16, INTAKE);

  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    // ---- the leading-edge strake from the canopy back into the wing root, then the cropped delta ----
    surface(parts, { le: new THREE.Vector3(side * 0.55, -0.02, 3.4), chord: 3.4, thick: 0.12 },
      { le: new THREE.Vector3(side * 1.05, -0.04, 1.6), chord: 2.2, thick: 0.18 }, up, 0, UPPER, LOWER);
    surface(parts, { le: new THREE.Vector3(side * 0.7, -0.06, 1.7), chord: 4.6, thick: 0.34 },
      { le: new THREE.Vector3(side * 4.55, -0.1, -1.55), chord: 1.05, thick: 0.1 }, up, 0, UPPER, LOWER);
    // the tip's launch rail and its training round (the rail carries what the fighter would)
    box(parts, 0.1, 0.12, 2.6, side * 4.68, -0.08, -1.3, DARK);
    rod(parts, new THREE.Vector3(side * 4.68, -0.05, -2.8), new THREE.Vector3(0, 0, 1), 0.065, 2.85, MAVERICK, 8);
    // ---- the all-moving tailplanes with their anhedral ----
    surface(parts, { le: new THREE.Vector3(side * 0.55, -0.02, -5.2), chord: 2.3, thick: 0.14 },
      { le: new THREE.Vector3(side * 2.8, -0.28, -6.55), chord: 0.95, thick: 0.08 }, up, 0, UPPER, LOWER);
    // the ventral fins under the engine, splayed out
    surface(parts, { le: new THREE.Vector3(side * 0.42, -0.42, -4.6), chord: 1.2, thick: 0.06 },
      { le: new THREE.Vector3(side * 0.62, -1.0, -5.0), chord: 0.8, thick: 0.05 }, new THREE.Vector3(1, 0, 0), 0, LOWER, LOWER);
  }
  // ---- the single fin, swept, with its rudder line and the tail's dark cap ----
  surface(parts, { le: new THREE.Vector3(0, 0.6, -3.6), chord: 3.05, thick: 0.18 },
    { le: new THREE.Vector3(0, 3.1, -6.3), chord: 1.2, thick: 0.08 }, new THREE.Vector3(1, 0, 0), 0, UPPER, UPPER);
  box(parts, 0.1, 0.18, 0.5, 0, 3.1, -6.95, DARK);

  // ---- the pylons: the inboard bomb pylons and the Mavericks' twin racks ----
  for (const side of [-1, 1]) {
    box(parts, 0.12, 0.62, 1.4, side * FIGHTER_BOMB_PYLON[0], -0.42, FIGHTER_BOMB_PYLON[2] - 0.1, LOWER);
    box(parts, 0.12, 0.3, 1.2, side * FIGHTER_MISSILE_RAIL[0], -0.24, FIGHTER_MISSILE_RAIL[2] - 0.2, LOWER);
    box(parts, 0.62, 0.08, 1.4, side * FIGHTER_MISSILE_RAIL[0], -0.4, FIGHTER_MISSILE_RAIL[2] - 0.2, DARK);
  }

  const material = new THREE.MeshStandardMaterial({ name: 'strike-fighter-airframe', vertexColors: true, metalness: 0.3, roughness: 0.58 });
  hooks?.setup(material);
  const body = new THREE.Mesh(parts.geometry(), material);
  body.name = 'strike-fighter-body';
  root.add(body);

  // ---- a GBU-12 on each inboard pylon: the olive Mk 82 body, its seeker head and its tail wings ----
  const bombParts = new Parts();
  addLoft(bombParts, [
    { z: 1.75, cy: 0, rx: 0, ry: 0 },
    { z: 1.55, cy: 0, rx: 0.1, ry: 0.1 },
    { z: 1.1, cy: 0, rx: 0.12, ry: 0.12 },
    { z: 0.9, cy: 0, rx: 0.14, ry: 0.14 },
    { z: -0.9, cy: 0, rx: 0.14, ry: 0.14 },
    { z: -1.3, cy: 0, rx: 0.08, ry: 0.08 },
    { z: -1.35, cy: 0, rx: 0, ry: 0 },
  ], 12, 0, 2, (s) => lin(s.z > 1.05 ? SEEKER : OLIVE));
  for (let f = 0; f < 4; f++) {
    const fin = new THREE.BoxGeometry(0.02, 0.32, 0.42);
    fin.translate(0, 0.2, -1.0);
    fin.rotateZ(f * Math.PI / 2 + Math.PI / 4);
    bombParts.add(fin, () => lin(OLIVE));
  }
  const bombGeometry = bombParts.geometry();
  const bombs: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const bomb = new THREE.Mesh(bombGeometry, material);
    bomb.name = 'strike-fighter-gbu12';
    bomb.position.set(side * FIGHTER_BOMB_PYLON[0], FIGHTER_BOMB_PYLON[1], FIGHTER_BOMB_PYLON[2]);
    root.add(bomb);
    bombs.push(bomb);
  }

  // ---- the AGM-65 Mavericks: the white body, the glass seeker, the long-chord wings and the tail fins ----
  const missileParts = new Parts();
  addLoft(missileParts, [
    { z: 1.25, cy: 0, rx: 0, ry: 0 },
    { z: 1.12, cy: 0, rx: 0.12, ry: 0.12 },
    { z: 0.95, cy: 0, rx: 0.15, ry: 0.15 },
    { z: -1.15, cy: 0, rx: 0.15, ry: 0.15 },
    { z: -1.24, cy: 0, rx: 0.1, ry: 0.1 },
    { z: -1.25, cy: 0, rx: 0, ry: 0 },
  ], 12, 0, 2, (s) => lin(s.z > 1.0 ? GLASS : MAVERICK));
  for (let f = 0; f < 4; f++) {
    const wing = new THREE.BoxGeometry(0.015, 0.2, 1.1);
    wing.translate(0, 0.24, 0.0);
    wing.rotateZ(f * Math.PI / 2 + Math.PI / 4);
    missileParts.add(wing, () => lin(MAVERICK));
    const tail = new THREE.BoxGeometry(0.015, 0.18, 0.3);
    tail.translate(0, 0.22, -1.0);
    tail.rotateZ(f * Math.PI / 2 + Math.PI / 4);
    missileParts.add(tail, () => lin(MAVERICK));
  }
  const missileGeometry = missileParts.geometry();
  const missiles: THREE.Object3D[] = [];
  // launch order (sim/airSupportFire.ts: missile k from the port rack when even): port outer, starboard outer, port inner,
  // starboard inner; the run's rail is the rack's centre, a pair 0.21 m either side of it
  for (const [side, offset] of [[1, 0.21], [-1, 0.21], [1, -0.21], [-1, -0.21]] as const) {
    const missile = new THREE.Mesh(missileGeometry, material);
    missile.name = 'strike-fighter-agm65';
    missile.position.set(side * (FIGHTER_MISSILE_RAIL[0] + offset), FIGHTER_MISSILE_RAIL[1], FIGHTER_MISSILE_RAIL[2]);
    root.add(missile);
    missiles.push(missile);
  }
  return {
    root,
    exhausts: [new THREE.Vector3(0, 0.06, -7.35)],
    bombs,
    missiles,
    dispose() {
      root.removeFromParent();
      body.geometry.dispose();
      bombGeometry.dispose();
      missileGeometry.dispose();
      hooks?.release(material);
      material.dispose();
    },
  };
}
