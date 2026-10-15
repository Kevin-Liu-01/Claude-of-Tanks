// src/world/maps/groundDressing.ts — the field's fallen timber (props lane A, family #19, 2026-10-15; WORKLIST.md #19
// site:logs-and-stumps). Extracted from props.ts createProps as it stood (the same text, the same shared stream):
// props.ts calls it where it ran. (The craters' clods stay in props.ts until Lane C r2d's drawn footprints land.)
import * as THREE from 'three';
import type { HeightField } from '../terrain.ts';
import type { FieldTimberPiece } from '../loggingYard.ts';
import { planGroundedSegment, sampleDiscGround, type GroundedSegmentEndpoint } from '../propPlacement.ts';
import { scaleUV } from '../propGeometry.ts';

type Rng = () => number;

// environment density pass 2 (2026-09-12): the per-map log and stump caps that used to be hard-coded (26 everywhere).
// Kept here rather than in the map modules, whose authoring the relief receipts pin; a map's own props.logCount still
// wins.
export const FIELD_LOG_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  autumn: 60, longleaf: 60, monsoon: 60, orchard: 56, verdant: 56, frontier: 56, fjord: 56, reservoir: 56,
  alpine: 52, delta: 52, coastal: 52, mangrove: 48, saltwind: 48, steppe: 44,
  polders: 40, skybridge: 40, railyard: 40, winter: 36, whiteout: 30, caldera: 30,
});

const _quat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _posv = new THREE.Vector3();

/** What a fallen log or a stump records of its grounding (props.ts DecorationGroundingReceipt). */
interface TimberGroundingReceipt {
  kind: string; x: number; y: number; z: number; relief?: number; baseClearance?: number;
  start?: GroundedSegmentEndpoint; end?: GroundedSegmentEndpoint; supportMin?: number; supportMax?: number;
}

/** createProps's own state the field timber reads and fills. */
export interface FieldTimberHost {
  P: { logs: boolean; logCount?: number };
  mapId: string;
  rng: Rng;
  heightField: HeightField;
  v: { x0: number; x1: number; z0: number; z1: number };
  noVeg: (x: number, z: number) => boolean;
  buckets: { wood: THREE.BufferGeometry[] };
  decorationGroundingReceipts: TimberGroundingReceipt[];
  fieldTimber: FieldTimberPiece[] | null;
}

/** The fallen logs and stumps strewn over the open field (and the logging yard's donors, fieldTimber). */
export function placeFieldLogsAndStumpsOf(host: FieldTimberHost): void {
  const { P, mapId, rng, heightField, v, noVeg, buckets, decorationGroundingReceipts, fieldTimber } = host;
  function placeFieldLogsAndStumps(): void {
  // environment density pass 2 (2026-09-12): the cap is per map (forest and
  // farm maps carry 44-60, snow and volcanic ground 30-36; a map's own
  // props.logCount overrides the table), attempts scale with it
  const logCap = Math.max(0, Math.round(P.logCount ?? FIELD_LOG_COUNTS[mapId] ?? 26));
  // the authored logging yard keeps its original donor budget (composeLoggingYard's
  // bounded allocation of 26 pieces); every log and stump past it stays in the field
  const yardDonors = 26;
  for (let i = 0, placed = 0; P.logs && i < logCap * 10 && placed < logCap; i++) {
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (x > v.x0 - 6 && x < v.x1 + 6 && z > v.z0 - 6 && z < v.z1 + 6) continue;
    if (heightField._roadDist(x, z) < 7) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    if (rng() < 0.6) { // log
      const r = 0.16 + rng() * 0.13, len = 2.2 + rng() * 1.9;
      const yaw = rng() * Math.PI * 2;
      const pose = planGroundedSegment(
        heightField, x, z, Math.cos(yaw), -Math.sin(yaw), len, r * 0.85, r * 0.1,
      );
      const log = new THREE.CylinderGeometry(r * 0.85, r, len, 7, 1);
      scaleUV(log, 1.0, len * 0.5);
      _quat.setFromUnitVectors(_upAxis, _posv.set(pose.axisX, pose.axisY, pose.axisZ));
      log.applyQuaternion(_quat);
      log.translate(pose.x, pose.y, pose.z);
      buckets.wood.push(log);
      decorationGroundingReceipts.push({
        kind: 'fallen-log', x: pose.x, y: pose.y, z: pose.z,
        relief: pose.relief, baseClearance: -r * 0.1,
        start: pose.start, end: pose.end,
      });
      if (fieldTimber && fieldTimber.length < yardDonors) fieldTimber.push({ geometry: log, grounding: decorationGroundingReceipts.at(-1)!, radius: r, length: len, height: 0, yaw });
    } else { // stump
      const r = 0.22 + rng() * 0.15, h = 0.35 + rng() * 0.3;
      const support = sampleDiscGround(heightField, x, z, r, 0.06);
      const st = new THREE.CylinderGeometry(r * 0.92, r * 1.15, h, 8, 1);
      scaleUV(st, 1.5, 0.5);
      const yaw = rng() * Math.PI;
      st.rotateY(yaw);
      st.translate(x, support.y + h / 2, z);
      buckets.wood.push(st);
      decorationGroundingReceipts.push({
        kind: 'stump', x, y: support.y, z, relief: support.spread, baseClearance: -0.06,
        supportMin: support.min, supportMax: support.max,
      });
      if (fieldTimber && fieldTimber.length < yardDonors) fieldTimber.push({ geometry: st, grounding: decorationGroundingReceipts.at(-1)!, radius: r, length: 0, height: h, yaw });
    }
    placed++;
  }
  }
  placeFieldLogsAndStumps();
}
