/**
 * One spare track link, as every spare-link run in the fleet draws it (VEH-13; the blind critics m1, 2026-10-15: "the
 * links are flat untextured grey blocks with no grousers, pins, paint or rust; one shared, better spare-link part").
 *
 * The link is the carrier fitting's (profiles/kit.ts fittingSpareTrackLinks, round 4 of 2026-10-07): a shoe plate
 * between two round hinge barrels, a grouser bar proud of the plate, and an end connector with its wedge-bolt head at
 * each edge. Its frame: width across the track along x, the link's back at y -0.025 and its grouser top at 0.05, one
 * pitch along z centred on the origin.
 *
 * - `emitSpareLink` hands the pieces to a builder (the fitting keeps its own slots, bolts and shared hinges);
 * - `spareLinkBlock` is one merged link that fills a box, the drop-in for a hand-drawn `box(w, h, d)` link.
 */
import * as THREE from 'three';
import { box, cylX, cylY, mergeAll, xform } from './factoryGeometry.ts';

/** The link's own extent in its frame: back to grouser top (y), barrel to barrel (z). */
const LINK_Y0 = -0.025, LINK_Y1 = 0.05, LINK_Z = 0.078;
const BARREL_R = 0.0215, BARREL_Z = 0.0565;

export type SpareLinkPieceSink = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => void;

export interface SpareLinkOptions {
  /** Barrel segments (the carrier fitting keeps 8; a merged drop-in block 6). */
  barrelSegments?: number;
  /** Whether each end connector carries its wedge-bolt head. */
  boltHeads?: boolean;
  /** Which hinge barrels this link draws: both (a lone link), or the course's shared joint (see the fitting). */
  barrels?: ReadonlyArray<-1 | 1 | 'shared'>;
  /** The course pitch (for a shared joint's position). */
  pitch?: number;
}

/** Hand one link's pieces, `width` across the track at `z` along the run, to `emit` in the link frame. */
export function emitSpareLink(emit: SpareLinkPieceSink, width: number, z: number, opts: SpareLinkOptions = {}): void {
  const segments = opts.barrelSegments ?? 8;
  const connectorX = width / 2 - Math.min(0.016, width * 0.16);
  const connectorW = Math.min(0.032, width * 0.3);
  emit(box(width * 0.94, 0.026, 0.118), 0, -0.0095, z);                                       // shoe plate
  for (const barrel of opts.barrels ?? [-1, 1]) {
    if (barrel === 'shared') emit(cylX(BARREL_R, width * 0.9, segments), 0, 0, z + (opts.pitch ?? 0.165) / 2);
    else emit(cylX(BARREL_R, width * 0.9, segments), 0, 0, z + barrel * BARREL_Z);             // hinge barrels
  }
  for (const side of [-1, 1]) {
    emit(box(connectorW, 0.05, 0.14), side * connectorX, 0, z);                                // end connector
    if (opts.boltHeads !== false) emit(cylY(0.011, 0.011, 0.01, 6), side * connectorX, 0.03, z); // wedge-bolt head
  }
  emit(box(width * 0.82, 0.0465, 0.036), 0, 0.02675, z);                                       // grouser
}

const _basis = new THREE.Matrix4();

/**
 * One merged link filling the box `w x h x d` centred on the origin, the drop-in for a hand-drawn `box(w, h, d)`
 * link: its thinnest side is the link's thickness (grouser on the `outward` side: +1 toward that axis's positive
 * end), its longest the width across the track, the third the pitch along the run.
 */
export function spareLinkBlock(w: number, h: number, d: number, outward: 1 | -1 = 1): THREE.BufferGeometry {
  const size = [w, h, d];
  const order = [0, 1, 2].sort((a, b) => size[a] - size[b]);
  const thin = order[0], along = order[1], across = order[2];
  const width = size[across], thick = size[thin], pitch = size[along];
  const pieces: THREE.BufferGeometry[] = [];
  emitSpareLink((g, x, y, z) => pieces.push(xform(g, x, y, z)), width, 0, { barrelSegments: 6, boltHeads: false });
  const link = mergeAll(pieces);
  for (const g of pieces) g.dispose();
  // into the box: the link frame's extent onto (width, thick, pitch), centred
  link.translate(0, -(LINK_Y0 + LINK_Y1) / 2, 0);
  link.scale(1, thick / (LINK_Y1 - LINK_Y0), pitch / (2 * LINK_Z));
  // link x -> across, y -> thin (outward), z -> along
  const axis = (k: number, sign = 1): THREE.Vector3 => new THREE.Vector3().setComponent(k, sign);
  const ex = axis(across), ey = axis(thin, outward), ez = axis(along);
  _basis.makeBasis(ex, ey, ez);
  if (_basis.determinant() < 0) _basis.makeBasis(ex, ey, ez.negate());
  link.applyMatrix4(_basis);
  return link;
}
