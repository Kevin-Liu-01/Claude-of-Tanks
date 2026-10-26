// The decoration's plan across a realm (UI-LOCKDOWN E, stage 2b pass 1, 2026-10-25). The page asks for a tank's plan
// with a replica of its graph (tankGraphWire.ts), its spec and its options; the planner (the decor worker,
// vehiclePassWorker.ts, or the proof's own realm) plans over the replica (decorations.ts planTankDecorationsSteps) and
// replies with each family's merged geometry, its smoke sockets, the seated loads, the summary and the spare-track
// receipts the plan wrote; the page rebuilds that plan and attaches it (attachDecorationPlanSteps) exactly as the
// in-line pass attaches its own. Each side's functions are pure: the proof runs both in one process.
import * as THREE from 'three';
import { planTankDecorationsSteps, type DecorationAttachmentArgs, type DecorPlan } from './decorations.ts';
import { addGeometryBuffers, geometryFrom, geometryWire, type GeometryWire } from './geometryWire.ts';
import { tankGraphFrom, tankGraphTransfer, tankGraphWire, valueFrom, wireValue, type TankGraphWire } from './tankGraphWire.ts';
import type { FleetTankSpec } from './specContracts.ts';

type DecorOptions = NonNullable<DecorationAttachmentArgs['opts']>;
type BucketPlan = DecorPlan['buckets'][number];
type FamilyPlan = BucketPlan['families'][number];

export interface DecorPlanRequest {
  readonly graph: TankGraphWire;
  /** the hull and turret frames' node indices in the graph */
  readonly hull: number;
  readonly turret: number;
  readonly spec: FleetTankSpec;
  readonly opts: DecorOptions;
}
interface FamilyWire extends Omit<FamilyPlan, 'near' | 'coarse'> {
  readonly near: GeometryWire | null;
  readonly coarse: GeometryWire | null;
}
export interface DecorPlanReply {
  readonly buckets: readonly (Omit<BucketPlan, 'families'> & { readonly families: readonly FamilyWire[] })[];
  readonly seatedLoads: { readonly hull: number[][]; readonly turret: number[][] };
  readonly summary: DecorPlan['summary'];
  /** the replica root's spare-track receipts after the plan: whether the plan made the list, and what it added */
  readonly spareTrack: { readonly made: boolean; readonly added: unknown[] } | null;
  /** what of the request or the plan could not travel (tankGraphWire.ts) */
  readonly lossy: readonly string[];
}

// ---- the page ----------------------------------------------------------------------------------------------------

/** The request for a decoration the page has decided to make (decorationWanted), and the arrays it hands over. */
export function decorPlanRequest(a: DecorationAttachmentArgs): { request: DecorPlanRequest; transfer: ArrayBuffer[] } {
  const { wire, refs: [hull, turret] } = tankGraphWire(a.root, [a.hullG, a.turretG]);
  if (hull < 0 || turret < 0) throw new Error('decor plan: the hull and turret frames are not under the root');
  return { request: { graph: wire, hull, turret, spec: a.spec, opts: { ...a.opts, decor: true } }, transfer: tankGraphTransfer(wire) };
}

/** The reply's plan for the page's own tank; the receipts the plan wrote land on its root as the in-line plan's do. */
export function decorPlanFrom(reply: DecorPlanReply, a: DecorationAttachmentArgs): DecorPlan {
  if (reply.spareTrack) {
    const receipts = a.root.userData.spareTrack as unknown[] | undefined;
    if (receipts) receipts.push(...reply.spareTrack.added);
    else if (reply.spareTrack.made) a.root.userData.spareTrack = [...reply.spareTrack.added];
  }
  const box = (v: number[]): THREE.Box3 => new THREE.Box3(new THREE.Vector3(v[0], v[1], v[2]), new THREE.Vector3(v[3], v[4], v[5]));
  const geometry = (wire: GeometryWire | null): THREE.BufferGeometry | null => wire
    && geometryFrom(wire, (value) => (valueFrom(value) ?? {}) as Record<string, unknown>);
  return {
    buckets: reply.buckets.map((bucket) => ({ ...bucket,
      families: bucket.families.map((family) => ({ ...family, near: geometry(family.near), coarse: geometry(family.coarse) })) })),
    seatedLoads: { hull: reply.seatedLoads.hull.map(box), turret: reply.seatedLoads.turret.map(box) },
    summary: reply.summary,
  };
}

// ---- the planner -------------------------------------------------------------------------------------------------

/** Plan over a replica of the request's graph (null: the tank takes no decoration, as the in-line pass decides). */
export function planDecorRequest(request: DecorPlanRequest): DecorPlanReply | null {
  const nodes = tankGraphFrom(request.graph);
  const root = nodes[0];
  const had = root.userData.spareTrack as unknown[] | undefined;
  const before = had?.length ?? 0;
  const args: DecorationAttachmentArgs = {
    root, hullG: nodes[request.hull] as THREE.Group, turretG: nodes[request.turret] as THREE.Group,
    spec: request.spec, opts: request.opts, engineCtx: null, disposables: [],
  };
  const steps = planTankDecorationsSteps(args);
  let result = steps.next();
  while (!result.done) result = steps.next();
  const plan = result.value;
  if (!plan) return null;
  const lossy = [...request.graph.lossy];
  const userData = (where: string) => (value: Record<string, unknown>) => wireValue(value, where, lossy);
  const after = root.userData.spareTrack as unknown[] | undefined;
  return {
    buckets: plan.buckets.map((bucket) => ({ frame: bucket.frame, functional: bucket.functional,
      families: bucket.families.map((family) => ({ matKey: family.matKey, smokeSockets: family.smokeSockets,
        near: family.near && geometryWire(family.near, userData(`${bucket.frame}/${family.matKey}#near`)),
        coarse: family.coarse && geometryWire(family.coarse, userData(`${bucket.frame}/${family.matKey}#coarse`)) })) })),
    seatedLoads: {
      hull: plan.seatedLoads.hull.map((b) => [...b.min.toArray(), ...b.max.toArray()]),
      turret: plan.seatedLoads.turret.map((b) => [...b.min.toArray(), ...b.max.toArray()]),
    },
    summary: plan.summary,
    spareTrack: after ? { made: !had, added: after.slice(before) } : null,
    lossy,
  };
}

/** The arrays a reply can hand over without a copy. */
export function decorPlanTransfer(reply: DecorPlanReply): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const bucket of reply.buckets) for (const family of bucket.families) {
    if (family.near) addGeometryBuffers(family.near, buffers);
    if (family.coarse) addGeometryBuffers(family.coarse, buffers);
  }
  return [...buffers];
}
