// A variant built on another mark's build (its donor): the one owner of the identity the build presents while the
// donor builds (2026-11-08 implicit-state-machine sweep, round 8 s5-05). First-party: Kevin B. Liu (NOTICE.md).
//
// The Australian M1A1 AIM SA (abramsAus.ts) and the Ukrainian M1A1 (ukraine.ts) build on the plain M1A1's and the
// M1A1HA's builds: buildTejasFamily branches on P.spec.id, so the variant presents the donor's id for the donor build
// only. Each copied that swap by hand and asked for its suit after the donor build, while the donor build asks for one
// under the donor's id (abrams.ts) and a port takes one suit (ghillieSuit.ts SUITED: the first claim wins). A donor row
// would have dressed the variant in the donor's suit and refused its own, with no error. One helper now holds the order.
//
// Per build, the variant's identity moves own -> donor -> own, inside one synchronous call (the donor's generator drains
// in its build()): no other code observes the donor id, and finally restores the variant's on a throw.
import type * as THREE from 'three';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** What a donor build needs of its port: the spec it presents an id on, the hull its host mark rides, the suit stage. */
export type DonorBuildPort = Parameters<typeof addVehicleGhillieSuit>[0] & {
  readonly spec: { id: string };
  readonly hullG: THREE.Group;
  /** The factory port's deferred stage (TankBuilderPort.afterAssemble): the variant's suit is laid there, after the build. */
  readonly afterAssemble: TankBuilderPort['afterAssemble'];
};

/**
 * Build `P` on `donorId`'s build:
 * 1. the variant claims its own suit first (as t90am does before its T-90SM build, profiles/t90.ts), so a suit asked for
 *    under the donor's id can never take the build's one suit; the suit is laid in afterAssemble, after the whole build,
 *    with the variant's id back, so the geometry is what claiming it last built;
 * 2. it names itself the donor's host (hullG.userData.m1a1BaseHost: buildTejasFamily and the M1A1 identity kits leave
 *    the donor mark's own kit off a host's shell, abramsM1A1Identity.ts);
 * 3. the donor build sees the donor's id, and the variant's is restored in finally.
 * A variant with no row of its own claims nothing here; no donor of today has a row (variantIdentity.selftest).
 */
export function buildOnDonor<P extends DonorBuildPort>(P: P, donorId: string, build: (port: P) => void): void {
  const id = P.spec.id;
  addVehicleGhillieSuit(P);
  P.hullG.userData.m1a1BaseHost = id;
  P.spec.id = donorId;
  try {
    build(P);
  } finally {
    P.spec.id = id;
  }
}
