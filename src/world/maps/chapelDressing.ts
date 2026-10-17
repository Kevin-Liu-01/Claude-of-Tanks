// src/world/maps/chapelDressing.ts — the small chapel's bell-cote raised into a spirelet with its cross (the looks lane,
// 2026-10-15; the garage critic, Frosthollow: "a chapel with no steeple or cross reads as another cottage"). The
// generic chapel (villageKit.ts makeChapel) carried its bell in a pierced gable slab under a low cap and a small cross on
// the rear gable, both lost at any distance. Over the bell gable's cap: a square shaft astride its ridge, a four-sided
// spirelet in slate, a wrought cross on its tip. Dressing only: every part new to the building draws nothing from the
// placement stream (uvJitter 'none') and is no collision part (noCollision), so the chapel's placements, footprint and
// collision stay main's on every map that builds it.

import * as THREE from 'three';
import { box, scaleUV } from '../propGeometry.ts';

interface ChapelParts {
  [name: string]: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
}

/** Shaft, spirelet and cross over the bell gable's cap, whose ridge runs along x at (0, `ridgeY`, `z`). */
export function addChapelSpirelet(parts: ChapelParts, ridgeY: number, z: number): void {
  const fresh = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    g.userData.uvJitter = 'none';
    g.userData.noCollision = true;
    return g;
  };
  // the shaft: astride the cap's ridge, its foot sunk into the cap's slopes, open on its four faces for the bell's sound
  const shaftH = 0.62, shaftW = 0.54, foot = ridgeY - 0.22;
  parts.stone.push(fresh(box(shaftW, shaftH, shaftW, 0.7).translate(0, foot + shaftH / 2, z)));
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    const louvre = dx === 0 ? box(0.26, 0.34, 0.03) : box(0.03, 0.34, 0.26);
    parts.dark.push(fresh(louvre.translate(dx * (shaftW / 2 + 0.01), foot + shaftH * 0.55, z + dz * (shaftW / 2 + 0.01))));
  }
  // the spirelet: four slate faces from a cornice over the shaft to its tip
  const top = foot + shaftH;
  parts.stone.push(fresh(box(shaftW + 0.14, 0.08, shaftW + 0.14, 0.7).translate(0, top + 0.04, z)));
  const spireH = 2.1;
  const spire = new THREE.ConeGeometry((shaftW + 0.06) * Math.SQRT1_2, spireH, 4, 1);
  spire.rotateY(Math.PI / 4);
  scaleUV(spire, 0.6, 1.4);
  parts.roof.push(fresh(spire.translate(0, top + 0.08 + spireH / 2, z)));
  // the cross: its stem sunk into the tip
  const tip = top + 0.08 + spireH;
  parts.dark.push(fresh(box(0.07, 1.0, 0.07).translate(0, tip + 0.3, z)));
  parts.dark.push(fresh(box(0.46, 0.07, 0.07).translate(0, tip + 0.5, z)));
}
