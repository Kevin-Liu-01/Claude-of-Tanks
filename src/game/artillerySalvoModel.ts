/**
 * artillerySalvoModel.ts — the barrage's picture (notices-polish-277; Kevin 2026-11-24, on live 276: "also make all warnings
 * have mictures. i see artillery doesnt"). The barrage flies no aircraft, so its notice art is its rounds: three 155 mm
 * high-explosive shells diving onto the mark in a stepped salvo, rendered by the aircraft renders' studio and framing
 * (tools/genAircraftAssets.mjs, previewAircraftBuild.ts) into the same 3/4 thumbnail every INCOMING notice crops.
 *
 * Each shell at an M795's proportions (0.80 m long, 155 mm): the steel point-detonating fuze, the ogive, the olive-drab body
 * with the yellow band high-explosive rounds wear, the copper driving band, the boat-tail base. Vertex colours on one lit
 * material, one draw, built with the airframes' kit (airframeParts.ts). Used only by the renders: no battle draws it.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';
import { Parts, addLoft, lin } from './airframeParts.ts';

interface SalvoMaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }

const OLIVE = 0x4b5228, YELLOW = 0xd9b12c, COPPER = 0xb36b3c, FUZE = 0x8a8c88, TIP = 0x3d3f40, BASE = 0x3a3d30;
const R = 0.0775;
/** The bands along a shell (nose +z): their colour by station. */
const FUZE_BAND = 1, BODY = 0, MARK = 2, DRIVE = 3, TAIL = 4, POINT = 5;
const COLOUR: Readonly<Record<number, number>> = { [POINT]: TIP, [FUZE_BAND]: FUZE, [BODY]: OLIVE, [MARK]: YELLOW, [DRIVE]: COPPER, [TAIL]: BASE };

/** One shell's stations, nose +z to base (z falls station to station, the kit's winding). */
const SHELL = [
  { z: 0.4, r: 0, band: POINT }, { z: 0.392, r: 0.009, band: POINT }, { z: 0.37, r: 0.016, band: POINT },
  { z: 0.37, r: 0.016, band: FUZE_BAND }, { z: 0.3, r: 0.031, band: FUZE_BAND }, { z: 0.285, r: 0.034, band: FUZE_BAND },
  { z: 0.285, r: 0.036, band: BODY }, { z: 0.22, r: 0.053, band: BODY }, { z: 0.14, r: 0.069, band: BODY },
  { z: 0.07, r: R, band: BODY }, { z: 0.035, r: R, band: BODY },
  { z: 0.035, r: R, band: MARK }, { z: -0.005, r: R, band: MARK },
  { z: -0.005, r: R, band: BODY }, { z: -0.29, r: R, band: BODY },
  { z: -0.29, r: 0.0805, band: DRIVE }, { z: -0.325, r: 0.0805, band: DRIVE },
  { z: -0.325, r: R, band: BODY }, { z: -0.345, r: R, band: BODY }, { z: -0.4, r: 0.066, band: TAIL }, { z: -0.4, r: 0, band: TAIL },
] as const;

/** Where each shell of the salvo flies (m) and how steeply it dives (rad): a wide, low stagger across the run, each a little
 *  ahead of the last, so the salvo frames as the aircraft do in a notice's wide picture (a tall column was cut by it). */
const SALVO: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.5, 0.14, -0.22, 0.42], [0.02, 0.07, 0.06, 0.4], [-0.46, 0, 0.32, 0.38],
];

export function buildArtillerySalvo(hooks: SalvoMaterialHooks | null): { root: THREE.Group; dispose(): void } {
  const parts = new Parts();
  const shell = new Parts();
  addLoft(shell, SHELL.map((s) => ({ z: s.z, cy: 0, rx: s.r, ry: s.r, band: s.band })), 24, 0, 2, (s) => lin(COLOUR[s.band ?? BODY]!));
  const one = shell.geometry();
  for (const [x, y, z, dive] of SALVO) {
    const g = one.clone();
    g.rotateX(dive);
    g.translate(x, y, z);
    const colours = g.getAttribute('color');
    parts.add(g, (_x, _y, _z, i) => [colours.getX(i), colours.getY(i), colours.getZ(i)]);
  }
  one.dispose();
  const material = new THREE.MeshStandardMaterial({ name: 'artillery-salvo', vertexColors: true, metalness: 0.35, roughness: 0.52 });
  hooks?.setup(material);
  const root = new THREE.Group();
  root.name = 'artillery salvo (155 mm)';
  const body = new THREE.Mesh(parts.geometry(), material);
  body.name = 'artillery-salvo-shells';
  root.add(body);
  return {
    root,
    dispose() {
      root.removeFromParent();
      body.geometry.dispose();
      hooks?.release(material);
      material.dispose();
    },
  };
}
