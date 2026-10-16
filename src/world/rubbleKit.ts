// src/world/rubbleKit.ts — the hitbox lane's round 3 in props.ts's stone and rubble passes (physics stream, 2026-10-15:
// extracted from props.ts under the coordinator's token, extract-then-own): the low stones that rise past ROCK_LOW_STONE_M
// under the drive-over line turn crushable, and a crushed one presses into the ground leaving its flakes, chips and scuff
// (crushedStones.ts); the street rubble balances band by band along the deployments' axis (PropsSettings.rubbleHalvesAbout).
// props.ts keeps only the call sites.
import * as THREE from 'three';
import type { CollisionRecord } from './collision.ts';
import type { CrushableClutter } from './crushableClutter.ts';
import { ROCK_LOW_STONE_M, rockCollisionProfile, type RockCollisionProfile, type RockForm } from './rockCollision.ts';
import {
  createCrushedStoneLayout, crushedStoneLayout, stoneFormOf, StonePiecePool, StoneScuffPool, type CrushedStoneLayout,
} from './crushedStones.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';

/**
 * A low stone's profile (the hitbox lane, 2026-10-10): a stone under the drive-over line that still rises ROCK_LOW_STONE_M
 * carries a crushable record, its own (shells and sight stop on it until a hull crushes it; no hull is stopped). Null for a
 * stone lower still.
 */
export function lowStoneProfile(
  form: RockForm, matrix: ArrayLike<number>, groundAt: (x: number, z: number) => number,
): RockCollisionProfile | null {
  return rockCollisionProfile(form, matrix, groundAt, { minRise: ROCK_LOW_STONE_M });
}

/** The point a map's street rubble balances about (PropsSettings.rubbleHalvesAbout) and its band width (m, 75). */
export interface RubbleHalvesAbout { x: number; z: number; band?: number }

/**
 * The street rubble's balance (the hitbox lane, round 3, 2026-10-12; the coordinator's ruling on Blackglass's fairness, map
 * revival's banded halves): once a pile's records follow the chunks it draws, where the piles lie decides whose cover they
 * are, so the rubble balances along the deployments' axis (from the player's deployment to the enemies' centroid) through
 * the turning point, band by band: the piles in the band `band` m wide at a signed distance from the point are counted
 * against the band at the same distance on the other side, and a pile whose seat lies in the fuller of the two (every
 * rubble record so far counts, a ruin's included) waits for a seat in the other. Whole halves can even out while the
 * fight zone still leans. The rubble's own stream draws on, so no other prop moves. Null where a map declares no point.
 */
export function createRubbleBalance(
  about: RubbleHalvesAbout | null | undefined,
  spawns: { player: { x: number; z: number }; enemies: ReadonlyArray<{ x: number; z: number }> },
  obstacles: readonly CollisionRecord[],
): { admit(x: number, z: number): boolean } | null {
  if (!about || !spawns.enemies.length) return null;
  const bandM = about.band ?? 75;
  const ex = spawns.enemies.reduce((sum, e) => sum + e.x, 0) / spawns.enemies.length - spawns.player.x;
  const ez = spawns.enemies.reduce((sum, e) => sum + e.z, 0) / spawns.enemies.length - spawns.player.z;
  const len = Math.hypot(ex, ez) || 1;
  const ax = ex / len, az = ez / len;
  const bands = new Map<number, number>();
  const bandKey = (x: number, z: number): number => {
    const d = (x - about.x) * ax + (z - about.z) * az;
    return (d < 0 ? -1 : 1) * (Math.floor(Math.abs(d) / bandM) + 1);
  };
  const inPlay = (x: number, z: number): boolean => Math.max(Math.abs(x), Math.abs(z)) <= PLAYABLE_HALF_EXTENT_M;
  for (const record of obstacles) {
    if (record.kind !== 'rubble') continue;
    const cx = (record.min[0] + record.max[0]) / 2, cz = (record.min[2] + record.max[2]) / 2;
    if (inPlay(cx, cz)) { const key = bandKey(cx, cz); bands.set(key, (bands.get(key) ?? 0) + 1); }
  }
  return {
    admit(x: number, z: number): boolean {
      if (!inPlay(x, z)) return true;
      const key = bandKey(x, z);
      if ((bands.get(key) ?? 0) > (bands.get(-key) ?? 0)) return false;
      bands.set(key, (bands.get(key) ?? 0) + 1);
      return true;
    },
  };
}

/** A rock seat's fields the low stones read and set (props.ts rockSeats). */
export interface StoneSeat {
  x: number; y: number; z: number; sc: number; sink: number; placement: THREE.Matrix4;
  rec: CollisionRecord | null; col: CollisionRecord | null; clutter: CrushableClutter | null;
}

/** What the crushed stones draw with (props.ts's rock pass, bound once its pools are laid). */
export interface CrushedStoneScene {
  group: THREE.Group;
  material: THREE.Material;
  depth: THREE.Material;
  groundAt: (x: number, z: number) => number;
  /** The variant's geometry its pieces take (the phone form on the desktop), and the form its layout reads. */
  pieceGeometry: (vi: number) => THREE.BufferGeometry;
  formGeometry: (vi: number) => THREE.BufferGeometry;
  /** Shadow settings for the pieces' mesh (props.ts's cascade and profile helpers). */
  dressShadows: (mesh: THREE.InstancedMesh) => void;
}

/** A crushed stone's scuff disc (collectFoundationDecals): darkest where it was pressed in, thinning to its rim. */
const STONE_SCUFF_SHARES: readonly number[] = [1, 0.95, 0.7, 0.35];
const STONE_SCUFF_PROFILE: readonly number[] = [0.05, 0.05, 0.04, 0.03];

/** The crushable low stones of one props build: which they are, their crushed pieces and their scuffs. */
export class LowStones {
  /** The low stones that settled crushable: they keep the bed they stood in (buildRockBeds), pressed into it crushed. */
  readonly placements = new Set<THREE.Matrix4>();
  private readonly scuffs: Array<{ clutter: CrushableClutter; x: number; z: number; r: number }> = [];
  private readonly discs: Array<{ clutter: CrushableClutter; disc: THREE.BufferGeometry }> = [];

  /** A low stone with a legacy record that stood solid: it turns crushable, its record keeping its index. */
  turnCrushable(seat: StoneSeat, make: (seat: StoneSeat) => CrushableClutter): void {
    seat.rec!.kind = seat.col!.kind = 'small-rock';
    seat.clutter = make(seat);
  }

  /**
   * A variant's crushable stones (the coordinator's condition on round 3: "a crushed stone must read physically. It splits
   * and presses into the ground, leaving fragments and a scuff that persist, and never just vanishes"): each one's crushed
   * pose (its middle pressed into the ground) and its flakes and chips, from one pool of the variant's phone form, laid once
   * from the stone's place at its first crush; and its scuff disc's place.
   */
  addPieces(vi: number, placements: readonly THREE.Matrix4[], clutterOf: Map<THREE.Matrix4, CrushableClutter>, scene: CrushedStoneScene): void {
    const crushable = placements.filter((placement) => clutterOf.has(placement));
    if (!crushable.length) return;
    const pieces = new StonePiecePool(scene.pieceGeometry(vi), scene.material, crushable.length, 'rock-variant-' + vi + '-pieces');
    pieces.mesh.castShadow = true;
    pieces.mesh.receiveShadow = true;
    pieces.mesh.customDepthMaterial = scene.depth;
    scene.dressShadows(pieces.mesh);
    scene.group.add(pieces.mesh);
    const form = stoneFormOf(scene.formGeometry(vi));
    for (const placement of crushable) {
      const clutter = clutterOf.get(placement)!;
      let layout: CrushedStoneLayout | null = null;
      const laid = (): CrushedStoneLayout => (layout ??= crushedStoneLayout(placement, form, scene.groundAt, createCrushedStoneLayout()));
      clutter.pressedPose = (_home, out) => { out.copy(laid().body); };
      clutter.crushHooks.push((crushed) => {
        if (crushed) pieces.show(clutter, laid().pieces);
        else pieces.hide(clutter);
      });
      const e = placement.elements;
      const reach = form.halfLocal * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10]));
      this.scuffs.push({ clutter, x: e[12], z: e[14], r: Math.max(0.6, reach * 1.6) });
    }
  }

  /** Each scuff's disc, conformed now with the contact layer's own law (props.ts conformedDisc), laid at its crush. */
  *collectScuffs(
    conformedDisc: (x: number, z: number, r: number, profile: readonly number[], onMesh: boolean, shares: readonly number[], strength: number) => THREE.BufferGeometry,
    strength: number,
  ): Generator<void, void, void> {
    for (const scuff of this.scuffs) {
      this.discs.push({ clutter: scuff.clutter, disc: conformedDisc(scuff.x, scuff.z, scuff.r, STONE_SCUFF_PROFILE, true, STONE_SCUFF_SHARES, strength) });
      yield;
    }
  }

  /** The discs still unlaid, released (a cancelled build). */
  releasePendingDiscs(): void {
    for (const { disc } of this.discs) {
      try { disc.dispose(); } catch (_) { /* continue releasing private inputs */ }
    }
    this.discs.length = 0;
  }

  /**
   * The crushed stones' scuffs: their discs in one pool drawn with the contact layer's own material, each laid at its
   * stone's crush and folded at a rematch; nothing is drawn while no stone lies crushed.
   */
  layScuffs(group: THREE.Group, contact: THREE.BufferGeometry | null, fallback: () => THREE.Material): void {
    if (!this.discs.length) return;
    const layer = group.children.find((object) => (object as THREE.Mesh).geometry === contact) as THREE.Mesh | undefined;
    const material = (layer?.material as THREE.Material | undefined) ?? fallback();
    const pool = new StoneScuffPool(material, 'stone-scuffs');
    for (const { clutter, disc } of this.discs) { pool.register(clutter, disc); disc.dispose(); }
    pool.seal();
    Object.assign(pool.mesh.userData, { groundContactDecal: true, terrainDecal: true, terrainDecalKind: 'stone-scuff', decalParts: 0 });
    group.add(pool.mesh);
    for (const { clutter } of this.discs) {
      clutter.crushHooks.push((crushed) => { if (crushed) pool.show(clutter); else pool.hide(clutter); });
    }
    this.discs.length = 0;
  }
}
