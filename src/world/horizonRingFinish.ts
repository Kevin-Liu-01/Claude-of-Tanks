// The horizon ring's terrain-bound finish (perf-248): the vertex streams the battlefield's material reads past the edge
// (the strand, the road exits, the field parcels, the railway, the farm tracks), the seam's refinement at the playable
// mesh's sampling scale (horizonSeam.ts) and the fold. All of it is geometry from the height field: the ring worker runs
// it where it builds the ring, after the pipeline, so the page takes a finished ring; a ring the page builds itself
// (no worker, or the worker not yet answered) is finished by the same function there. The order is the terrain build's:
// each stream before the refinement, which carries every attribute into its new vertices, and the fold after it.
import { BufferAttribute, type BufferGeometry } from 'three';
import { continueHorizonFold, refineHorizonGroundSeam } from './horizonSeam.ts';
import type { CanyonGround } from './horizonRedrock.ts';

/** The road exits as they lie on the finished ring (terrain.ts roadExitOnRing). */
interface RingRoadExits {
  at(x: number, z: number, out: [number, number]): [number, number];
}

/** The height field's border functions the streams read (terrain.ts HeightField). */
export interface HorizonRingFinishGround extends CanyonGround {
  _roadExitAt?(x: number, z: number, out: [number, number]): [number, number];
  _borderParcelAt?(x: number, z: number, out: [number, number, number, number]): [number, number, number, number];
  _railExitAt?(x: number, z: number, out: [number, number], surfaceY?: number): [number, number];
  _borderTrackAt?(x: number, z: number, out: [number, number, number, number]): [number, number, number, number];
}

export interface HorizonRingFinishInputs {
  ground: HorizonRingFinishGround;
  /** terrain.ts createShoreAt: null on a dry or frozen map. */
  shoreAt: ((x: number, z: number) => number) | null;
  /** terrain.ts foldFieldSteps: null for a height field without heights. */
  foldAt: ((x: number, z: number) => number) | null;
  /** The ring's own exits (the height field's _roadExitOnRing over the ring's rows), else the field's. */
  roadExits: RingRoadExits | null;
  columns: number;
  /** The rim bands bound to the terrain (the ring's ridge row, at least 2): the topology's lower bound. */
  bands: number;
}

/** userData flag on a finished ring's geometry: the page binds it without finishing it again. */
export const HORIZON_RING_FINISHED = 'horizonRingFinished';

export function horizonRingFinished(geometry: BufferGeometry): boolean {
  return geometry.userData[HORIZON_RING_FINISHED] === true;
}

/** Finish a ring built by the pipeline (in place). Throws on a geometry that is not the ring's topology. */
export function finishHorizonRingGeometry(geometry: BufferGeometry, inputs: HorizonRingFinishInputs): void {
  const { ground, shoreAt, foldAt, roadExits, columns, bands } = inputs;
  const position = geometry.getAttribute('position');
  // The continued coast uses the same strand distances as the playable shore.
  // Leaving the ring's default attribute at zero made the sand/wrack band stop
  // on an exact square even when the bank geometry was continuous.
  if (shoreAt) {
    const shore = new Uint8Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const metres = shoreAt(position.getX(i), position.getZ(i));
      shore[i] = metres >= 32 ? 0 : 255 - Math.round(Math.max(0, metres) * (255 / 32));
    }
    geometry.setAttribute('shore', new BufferAttribute(shore, 1, true));
  }
  // The map-borders lane (2026-10-03): the roads that leave the square run on across the ring — the carriageway rides
  // the ring's vertices as [signed offset from the exit line, presence] (terrain.ts roadExits)
  if (ground._roadExitAt) {
    const exitAttr = new Float32Array(position.count * 2);
    const hit: [number, number] = [0, 0];
    // the exits as they lie on this ring (horizon.ts: each runs out at the foot of the ranges unless they open a pass)
    const exitAt = roadExits ? roadExits.at : ground._roadExitAt;
    let any = false;
    for (let i = 0; i < position.count; i++) {
      exitAt(position.getX(i), position.getZ(i), hit);
      exitAttr[i * 2] = hit[0]; exitAttr[i * 2 + 1] = hit[1];
      if (hit[1] > 0) any = true;
    }
    if (any) geometry.setAttribute('roadExit', new BufferAttribute(exitAttr, 2));
  }
  // The map-borders lane (2026-10-03, owner: "rolling ground with field patterns"): the farmland past the edge in
  // parcels between the hedgerows — each ring vertex carries its field's crop, premultiplied (borderLandform.ts parcelTintAt)
  if (ground._borderParcelAt) {
    const tintAttr = new Float32Array(position.count * 4);
    const tint: [number, number, number, number] = [0, 0, 0, 1];
    let any = false;
    for (let i = 0; i < position.count; i++) {
      ground._borderParcelAt(position.getX(i), position.getZ(i), tint);
      tintAttr.set(tint, i * 4);
      if (tint[3] < 1) any = true;
    }
    if (any) geometry.setAttribute('borderTint', new BufferAttribute(tintAttr, 4));
  }
  // ... and a railway's open line past the edge (terrain.ts railExitAt): its ballast rides the ring's vertices as
  // [signed offset from the line, presence]
  if (ground._railExitAt) {
    const railAttr = new Float32Array(position.count * 2);
    const hit: [number, number] = [0, 0];
    let any = false;
    for (let i = 0; i < position.count; i++) {
      ground._railExitAt(position.getX(i), position.getZ(i), hit, position.getY(i));
      railAttr[i * 2] = hit[0]; railAttr[i * 2 + 1] = hit[1];
      if (hit[1] > 0) any = true;
    }
    if (any) geometry.setAttribute('railExit', new BufferAttribute(railAttr, 2));
  }
  // ... and the farm tracks down some of the field boundaries (borderLandform.ts trackAt): per family the metres from the
  // nearest track and its boundary, so the shader draws a 3 m dirt track beside the hedge
  if (ground._borderTrackAt) {
    const trackAttr = new Float32Array(position.count * 4);
    const track: [number, number, number, number] = [0, 0, 0, 0];
    let any = false;
    for (let i = 0; i < position.count; i++) {
      ground._borderTrackAt(position.getX(i), position.getZ(i), track);
      trackAttr.set(track, i * 4);
      if (track[0] > 0) any = true;
    }
    if (any) geometry.setAttribute('borderTrack', new BufferAttribute(trackAttr, 4));
  }
  // the ring's topology (horizonAutumnGround.ts held it before the refinement there)
  const index = geometry.index;
  const rows = position.count / (columns + 1);
  if (!index || !Number.isInteger(rows) || rows < bands + 1 || index.count !== (rows - 1) * columns * 6)
    throw new Error('Expected the ring topology of ' + columns + ' columns');
  if (ground.getOutlandHeightAt) refineHorizonGroundSeam(geometry, columns, ground);
  // Curvature also controls turf moisture and ambient light. A missing
  // attribute reset both at the map edge even with identical materials.
  if (foldAt) continueHorizonFold(geometry, foldAt);
  geometry.userData[HORIZON_RING_FINISHED] = true;
}
