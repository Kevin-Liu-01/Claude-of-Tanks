// src/world/maps/sarajevoCemetery.ts — Ruinspires' siege cemeteries on the slopes below the ridges (props census #11, the
// looks lane, 2026-10-15): moved out of sarajevoStreets.ts (the map-revival lane's Sarajevo dressing) unchanged, so the
// family's rebuild lives in a file of its own; sarajevoStreets.ts dressSarajevo still lays them, after the tram line.
import type * as THREE from 'three';
import { PartSink, hashSeed, streamFrom } from './regional/geometry.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import type { CollisionRecord } from '../collision.ts';
import { createRecordClearance } from './recordClearance.ts';

/** What the cemeteries read of the dressing context (sarajevoStreets.ts TramContext). */
interface TramContext {
  heightField: { getHeightAt(x: number, z: number): number };
  buckets: Record<string, THREE.BufferGeometry[] | undefined>;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
}

function push(ctx: TramContext, sink: PartSink): void {
  const parts = sink.finish();
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) (ctx.buckets[bucket] ??= []).push(g);
}

/** The cemeteries' plots on Ruinspires' slopes below the ridges (a rotation pair about the Square): centre, half sizes. */
const CEMETERIES: ReadonlyArray<{ x: number; z: number; hx: number; hz: number }> = [
  { x: -170, z: -262, hx: 30, hz: 22 }, { x: 170, z: 262, hx: 30, hz: 22 },
];

/** A cross of white stone on its plinth. (x, z) its foot. */
function cross(sink: PartSink, x: number, y: number, z: number, h: number, yaw: number): void {
  sink.placed(yaw, x, y, z, () => {
    sink.span('stone', -0.16, -0.2, -0.1, 0.16, 0.1, 0.1, { decor: true });
    sink.span('stone', -0.05, 0.1, -0.04, 0.05, h, 0.04, { decor: true });
    sink.span('stone', -0.24, h * 0.66, -0.04, 0.24, h * 0.66 + 0.1, 0.04, { decor: true });
  });
}

/**
 * The cemeteries: rows of graves along the contour, each a white nišan (a turban on a man's, a pointed head on a
 * woman's, the plain rounded pillar of the siege's dead) or a cross, gaps where the rows break, clear of every record.
 */
function dressCemeteries(ctx: TramContext): void {
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  const records = createRecordClearance([...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])]);
  for (const [k, c] of CEMETERIES.entries()) {
    const look = streamFrom(hashSeed('sarajevo-cemetery', k, c.x, c.z));
    const sink = new PartSink([look() * 5, look() * 5]);
    const step = mobile ? 2.2 : 1.15, rowGap = 2.3;
    for (let z = c.z - c.hz; z <= c.z + c.hz; z += rowGap) {
      let x = c.x - c.hx + look() * step;
      while (x <= c.x + c.hx) {
        const gap = look();
        if (gap < 0.22) { x += step * (1 + look() * 3); continue; }
        const px = x + (look() - 0.5) * 0.25, pz = z + (look() - 0.5) * 0.3;
        x += step * (0.85 + look() * 0.3);
        if (!records.clears(px, pz, 0.3, 0.3, 1, 0, 0.25)) continue;
        const y = hf.getHeightAt(px, pz), roll = look(), h = 0.7 + look() * 0.6, yaw = (look() - 0.5) * 0.25;
        if (roll < 0.14) cross(sink, px, y, pz, h + 0.2, yaw);
        else sink.placed(yaw, px, y, pz, () => {
          // a nišan: plinth, shaft, head (turban / pointed / the šehid's rounded pillar)
          sink.span('stone', -0.17, -0.25, -0.12, 0.17, 0.1, 0.12, { decor: true });
          sink.span('stone', -0.12, 0.1, -0.09, 0.12, h, 0.09, { decor: true });
          if (roll < 0.5) sink.cylinder('stone', [0, h - 0.02, 0], 'y', 0.24, 0.17, 6, { decor: true }, 0.13);
          else if (roll < 0.75) sink.cylinder('stone', [0, h, 0], 'y', 0.2, 0.12, 4, { decor: true }, 0.01, true, Math.PI / 4);
          else sink.cylinder('stone', [0, h, 0], 'y', 0.1, 0.12, 6, { decor: true }, 0.07);
        });
      }
    }
    push(ctx, sink);
  }
}

export { dressCemeteries };
