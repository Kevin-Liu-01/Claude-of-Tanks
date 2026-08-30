import type { InstancedMesh, Object3D, Scene, Vector3 } from 'three';
import type {
  ArmorIntersection,
  ArmorModel,
  ArmorPoseState,
  TankArmorPose,
} from '../sim/armor.ts';
import type {
  CombatState,
  DamageShell,
  DamageShellSpec,
  DamageTankSpec,
  DamageTarget,
  HitEvent,
} from '../sim/damage.ts';
import type { ShotViewName } from './shotContract.ts';

type ShotRecipe = () => void | Promise<void>;

interface ForcedHudFrame {
  distM: number;
  penRatio: number | null;
  reload: { t: number; totalS: number };
  shellSlot: number;
  dispersionRadM: number;
  zoom?: number;
  shells?: readonly unknown[];
}

export interface ShotTankSpec extends DamageTankSpec {
  name: string;
  hydropneumaticAim?: unknown;
  dims: { heightM: number; widthM: number };
  armor: ArmorModel & { boundingRadiusM: number };
  gun: DamageTankSpec['gun'] & {
    caliberMm: number;
    shells: DamageShellSpec[];
    weaponSound?: string | null;
  };
}

export interface ShotVisual {
  root: Object3D;
  syncFromState(state: ArmorPoseState): void;
  setTrackState(module: 'trackL' | 'trackR', destroyed: boolean): void;
  recoilKick(ageS: number): number | null;
  gunMuzzleWorld(target: Vector3, muzzleIndex?: number): Vector3;
  gunDirWorld(target: Vector3): Vector3;
  setDestroyed(options: { pop: boolean; ageS: number }): void;
}

export interface ShotEntity {
  id: string;
  specId: string;
  team: string;
  isPlayer?: boolean;
  displayName?: string;
  state: ArmorPoseState;
  spec: ShotTankSpec;
  combat: CombatState;
  visual: ShotVisual;
}

export interface RequiredShotTankRegistry {
  /** Engineering shots stage these guaranteed members before recipes run. */
  get(specId: string): ShotEntity;
}

export interface ShotGame {
  player: ShotEntity;
  tanks: ShotEntity[];
  tankById: RequiredShotTankRegistry;
}

interface HeightField {
  getHeightAt(x: number, z: number): number;
}

interface RaycastHit {
  dist: number;
}

interface ConcealmentCircle {
  x: number;
  z: number;
  r: number;
}

interface WorldObstacle {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface ShotWorld {
  heightField: HeightField;
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): RaycastHit | null;
  getConcealment?(): ConcealmentCircle[];
  getObstacles?(): WorldObstacle[];
}

export interface ShotHud {
  setMode(mode: string): void;
  stageSpectateBar(options: {
    id: string;
    name: string;
    vehicle: string;
    specId: string;
    count: number;
    index: number;
  }): void;
}

export interface ShotRig {
  setExternalPose(position: Vector3, target: Vector3, fovDeg: number): void;
  snapArcade(zoom: number, yaw: number, pitch: number): void;
  snapSniper(zoom: number, yaw: number, pitch: number): void;
}

export interface ShotBus {
  emit(event: string, payload: unknown): void;
}

export interface ShotFx {
  composeFiringMoment(options: {
    muzzlePos: Vector3;
    dir: Vector3;
    caliberMm: number;
    tracerType: string;
    ageS: number;
  }): void;
  composeExplosionMoment(options: { pos: Vector3; ageS: number }): void;
}

export interface ShotGarage {
  show(specId: string): void;
  drainThumbs?(): void;
}

export interface ShotGarageDressing {
  ensureBuilt(): Promise<unknown>;
}

export interface ShotShowroom {
  reset(): void;
}

export interface ShotKillcam {
  stageReplayShot(payload: unknown, stage: string): void;
}

interface StagedHitEvent extends HitEvent {
  attackerName?: string;
  attackerSpecId?: string;
  targetName?: string;
  targetSpecId?: string;
  timeS?: number;
}

export interface ShotViewDependencies {
  hud: ShotHud;
  world: ShotWorld;
  _v1: Vector3;
  _v2: Vector3;
  _v3: Vector3;
  rig: ShotRig;
  DEG: number;
  forcedHudFrame(mode: string, frame: ForcedHudFrame): void;
  computeDispersionRadM(spec: ShotTankSpec, state: ArmorPoseState, distanceM: number): number;
  game: ShotGame;
  shellCards: readonly unknown[];
  scene: Scene;
  closeupStage(entity: ShotEntity): void;
  orbitPose(
    entity: ShotEntity,
    distanceM: number,
    azimuthDeg: number,
    elevationDeg: number,
    fovDeg: number,
  ): void;
  bus: ShotBus;
  fx: ShotFx;
  setPedestalTank(specId: string): Promise<unknown>;
  garage: ShotGarage;
  garageDressing: ShotGarageDressing;
  showroom: ShotShowroom;
  mapEstablishingShot(): void;
  tankPoseFromState(state: ArmorPoseState): TankArmorPose;
  traceTank(
    from: Vector3,
    to: Vector3,
    pose: TankArmorPose,
    armor: ArmorModel,
    eraSpent?: ReadonlySet<string>,
  ): ArmorIntersection[];
  createShell(
    spec: DamageShellSpec,
    shooterId: string,
    isPlayer: boolean,
    muzzlePosition: Vector3,
    direction: Vector3,
    id: number,
  ): DamageShell;
  resolveShellHit(
    shell: DamageShell,
    target: DamageTarget,
    hits: ArmorIntersection[],
    rng: () => number,
  ): HitEvent;
  createCombatState(spec: DamageTankSpec): CombatState;
  mulberry32(seed: number): () => number;
  VIEW_TIME: Readonly<Partial<Record<ShotViewName, number>>>;
  killcam: ShotKillcam;
}

/**
 * Deterministic screenshot recipes. Player boot never transfers this module;
 * the stable __SHOTS facade acquires it on the first explicit capture.
 *
 * The host contract is deliberately dependency-injected so this engineering
 * runtime cannot pull battle/fleet modules back into the ordinary entry graph.
 */
export function createShotViews({
  hud, world, _v1, _v2, _v3, rig, DEG, forcedHudFrame,
  computeDispersionRadM, game, shellCards, scene, closeupStage, orbitPose,
  bus, fx, setPedestalTank, garage, garageDressing, showroom,
  mapEstablishingShot, tankPoseFromState, traceTank, createShell,
  resolveShellHit, createCombatState, mulberry32, VIEW_TIME, killcam,
}: ShotViewDependencies): Record<ShotViewName, ShotRecipe> {
  let projectileReplayStage = 'xray';
  const SHOT_VIEWS = {
  battlefield() {
    hud.setMode('hidden');
    // Elevated SW of the village looking NE across the map: player tank at
    // its spawn in the near field, village mid-frame, enemy arc beyond.
    const h = world.heightField.getHeightAt(-60, -140);
    _v1.set(-60, h + 26, -140);
    _v2.set(80, world.heightField.getHeightAt(80, 160) + 4, 160);
    rig.setExternalPose(_v1, _v2, 55);
  },
  player_view() {
    rig.snapArcade(2, game.player.state.yaw, -12 * DEG);
    forcedHudFrame('battle', {
      distM: 240,
      penRatio: 1.3,
      reload: { t: 3.4, totalS: 6 }, // mid-reload: sweep ring + countdown visible
      shellSlot: 0,
      dispersionRadM: computeDispersionRadM(game.player.spec, game.player.state, 240),
      shells: shellCards,
    });
  },
  spectator_view() {
    const ally = game.tanks.find((ent) => ent && !ent.isPlayer && ent.team !== 'enemy');
    if (!ally) throw new Error('Spectator view requires a living allied vehicle');
    orbitPose(ally, 13.5, 174, 13, 48);
    forcedHudFrame('battle', {
      distM: 210,
      penRatio: null,
      reload: { t: 0, totalS: 6 },
      shellSlot: 0,
      dispersionRadM: computeDispersionRadM(game.player.spec, game.player.state, 210),
      shells: shellCards,
    });
    hud.stageSpectateBar({
      id: ally.id,
      name: ally.displayName || 'SteppeWolf_71',
      vehicle: ally.spec.name,
      specId: ally.specId,
      count: 5,
      index: 2,
    });
  },
  sniper_view() {
    // aim at the nearest enemy bearing WITH a clear sightline. r4: the old
    // check raycast ONE point (heightM*0.6) and accepted any blocker within
    // boundingRadius+1 m of the center — a wall 3 m in front of the hull
    // passed, so the flagship shot framed a nameplate floating over stone.
    // Now turret top, hull center AND both flank edges must all be reachable
    // (no static blocker more than 1 m short of the sample); when no living
    // enemy qualifies, the nearest one is RESTAGED onto surveyed open ground
    // so the contract ("aimed at an enemy") can never capture blind.
    const p = game.player;
    _v1.copy(p.state.pos);
    _v1.y += 2.2;
    // Canopy/bush proxies: world.raycast only sees terrain + prop AABBs, so a
    // bearing through a FOREST passed as "clear" (the r3 shot framed exactly
    // that). Sweep the concealer circles along the sight line too — anything
    // past the scope-corridor fade (~60 m) and short of the tank blocks.
    const conceal = world.getConcealment ? world.getConcealment() : [];
    const clearTo = (ent: ShotEntity): boolean => {
      const tp = ent.state.pos;
      const h = ent.spec.dims.heightM;
      const w = (ent.spec.dims.widthM || ent.spec.armor.boundingRadiusM) * 0.42;
      const bx = tp.x - p.state.pos.x;
      const bz = tp.z - p.state.pos.z;
      const flat = Math.max(Math.hypot(bx, bz), 1e-3);
      const inv = 1 / flat;
      const ux = bx * inv, uz = bz * inv;  // bearing unit (XZ)
      const lx = -uz, lz = ux;             // lateral unit ⟂ bearing
      for (const c of conceal) {
        const wx = c.x - _v1.x, wz = c.z - _v1.z;
        const t = wx * ux + wz * uz;
        if (t < 60 || t > flat - 8) continue;
        if (Math.abs(wx * uz - wz * ux) < c.r + 1.2) return false;
      }
      const samples = [
        [0, h * 0.92, 0],                 // turret top
        [0, h * 0.50, 0],                 // hull center
        [0, h * 0.25, 0],                 // lower hull (r4 hud_ui: a crest 2 m
        // short of the hull passed the old -1 m tolerance and hid the tank)
        [lx * w, h * 0.55, lz * w],       // left flank edge
        [-lx * w, h * 0.55, -lz * w],     // right flank edge
      ];
      for (const [ox, oy, oz] of samples) {
        _v2.set(tp.x + ox, tp.y + oy, tp.z + oz);
        _v3.copy(_v2).sub(_v1);
        const dd = _v3.length();
        _v3.multiplyScalar(1 / Math.max(dd, 1e-3));
        const block = world.raycast(_v1, _v3, dd);
        if (block && block.dist < dd - 0.25) return false;
      }
      return true;
    };
    // r4 hud_ui: the x8 frame must catch NO free-standing prop inside ~60 m
    // of the trunnion — a roadside pole or crop-row post crossing the frame
    // edge smears across the optics (scope-edge blur + vignette) and reads
    // as a corrupted capture. Many of these props are VISUAL-ONLY (planted
    // without colliders), so raycasts cannot see them: collect every
    // non-foliage instanced-prop origin near the eye once, then reject any
    // bearing that keeps one inside the near view cone. Foliage/grass is
    // excluded (the scope corridor fade already clears it); tank visuals are
    // excluded via their roots. Colliders get a dense ray fan on top.
    const nearProps: Array<[number, number, number]> = [];
    {
      const tankRoots = new Set();
      for (const t of game.tanks) if (t.visual && t.visual.root) tankRoots.add(t.visual.root);
      scene.traverse((object) => {
        if (!('isInstancedMesh' in object) || object.isInstancedMesh !== true) return;
        const mesh = object as InstancedMesh;
        for (let ancestor: Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
          if (tankRoots.has(ancestor)) return;
        }
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const key = mat && mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
        if (/^world-(tree|grass)/.test(key)) return; // corridor fade covers foliage
        mesh.updateMatrixWorld();
        const arr = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count; i++) {
          _v2.set(arr[i * 16 + 12], arr[i * 16 + 13], arr[i * 16 + 14])
            .applyMatrix4(mesh.matrixWorld);
          const d = Math.hypot(_v2.x - _v1.x, _v2.z - _v1.z);
          if (d > 1 && d < 60) nearProps.push([_v2.x, _v2.z, d]);
        }
      });
    }
    const nearClear = (yaw: number, pitch: number): boolean => {
      const hv = (55 / 8) * DEG * 0.55; // half vertical FOV at x8 + pad
      const hh = hv * (16 / 9);         // half horizontal
      for (const [pxp, pzp, d] of nearProps) {
        let da = Math.atan2(pxp - _v1.x, pzp - _v1.z) - yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < hh * 1.6 + 3 / d) return false; // prop in the x8 cone
      }
      for (let s = -4; s <= 4; s++) {
        for (const op of [0, -hv, hv]) {
          const oy = (s / 4) * hh;
          const cp = Math.cos(pitch + op);
          _v3.set(Math.sin(yaw + oy) * cp, Math.sin(pitch + op), Math.cos(yaw + oy) * cp);
          if (world.raycast(_v1, _v3, 15)) return false;
        }
      }
      return true;
    };
    const aimTo = (ent: ShotEntity): [number, number] => {
      const adx = ent.state.pos.x - p.state.pos.x;
      const adz = ent.state.pos.z - p.state.pos.z;
      const ady = (ent.state.pos.y + ent.spec.dims.heightM * 0.55) - (p.state.pos.y + 2.2);
      return [Math.atan2(adx, adz), Math.atan2(ady, Math.hypot(adx, adz))];
    };
    const enemies = game.tanks.filter((ent) =>
      // SYMMETRIC TEAMS: allies spawn 22-44 m away — scope must frame an ENEMY
      ent.team === 'enemy' && ent.state && ent.combat && !ent.combat.destroyed);
    let best = null;
    let bestD = Infinity;
    for (const ent of enemies) {
      const d = ent.state.pos.distanceTo(p.state.pos);
      if (d < bestD && clearTo(ent) && nearClear(...aimTo(ent))) { bestD = d; best = ent; }
    }
    if (!best) {
      // No enemy is genuinely visible from the trunnion: restage the nearest
      // one onto open ground along a surveyed bearing (deterministic sweep —
      // ±75° around the player's hull nose at WoT engagement ranges).
      let near = enemies[0];
      let nearD = Infinity;
      for (const ent of enemies) {
        const d = ent.state.pos.distanceTo(p.state.pos);
        if (d < nearD) { nearD = d; near = ent; }
      }
      const obstacles = world.getObstacles ? world.getObstacles() : [];
      const groundFree = (x: number, z: number): boolean => {
        for (const c of conceal) {
          const dx = c.x - x, dz = c.z - z;
          if (dx * dx + dz * dz < (c.r + 4) * (c.r + 4)) return false;
        }
        for (const o of obstacles) {
          if (x > o.min[0] - 3 && x < o.max[0] + 3 &&
              z > o.min[2] - 3 && z < o.max[2] + 3) return false;
        }
        return true;
      };
      // hud_ui r2: the sweep mutates near's REAL state each try — save the
      // original so a fully-failed sweep can restore it instead of leaving
      // the tank at the last FAILED (occluded) position.
      const origX = near.state.pos.x, origY = near.state.pos.y, origZ = near.state.pos.z;
      const origYaw = near.state.yaw;
      outer:
      for (const distM of [300, 240, 360, 190, 150, 420]) {
        for (let k = 0; k < 29; k++) {
          const ang = p.state.yaw +
            (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
          const x = p.state.pos.x + Math.sin(ang) * distM;
          const z = p.state.pos.z + Math.cos(ang) * distM;
          if (Math.abs(x) > 460 || Math.abs(z) > 460 || !groundFree(x, z)) continue;
          near.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
          near.state.yaw = ang + Math.PI * 0.72; // 3/4 aspect to the player
          if (clearTo(near) && nearClear(...aimTo(near))) { best = near; break outer; }
        }
      }
      if (!best) {
        // hud_ui r2 relaxed sweep: terrain LOS only (turret top + hull
        // center) — map dressing density can over-reject the strict pass
        // wholesale (concealer circles + near-prop cone).
        const terrainClear = (ent: ShotEntity): boolean => {
          const tp = ent.state.pos;
          const hh2 = ent.spec.dims.heightM;
          for (const oy of [hh2 * 0.92, hh2 * 0.5]) {
            _v2.set(tp.x, tp.y + oy, tp.z);
            _v3.copy(_v2).sub(_v1);
            const dd = _v3.length();
            _v3.multiplyScalar(1 / Math.max(dd, 1e-3));
            const block = world.raycast(_v1, _v3, dd);
            if (block && block.dist < dd - 0.25) return false;
          }
          return true;
        };
        outer2:
        for (const distM of [300, 240, 360, 190, 150, 420]) {
          for (let k = 0; k < 29; k++) {
            const ang = p.state.yaw +
              (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
            const x = p.state.pos.x + Math.sin(ang) * distM;
            const z = p.state.pos.z + Math.cos(ang) * distM;
            if (Math.abs(x) > 460 || Math.abs(z) > 460 || !groundFree(x, z)) continue;
            near.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
            near.state.yaw = ang + Math.PI * 0.72;
            if (terrainClear(near)) { best = near; break outer2; }
          }
        }
      }
      if (!best) {
        // TRUE original staging (the old code left the tank at the last
        // FAILED sweep position — captured frames aimed 420 m into an empty
        // hillside)
        near.state.pos.set(origX, origY, origZ);
        near.state.yaw = origYaw;
        best = near;
      }
      best.visual.syncFromState(best.state);
      bestD = best.state.pos.distanceTo(p.state.pos);
    }
    const dx = best.state.pos.x - p.state.pos.x;
    const dz = best.state.pos.z - p.state.pos.z;
    const yaw = Math.atan2(dx, dz);
    const dy = (best.state.pos.y + best.spec.dims.heightM * 0.55) - (p.state.pos.y + 2.2);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    rig.snapSniper(8, yaw, pitch);
    forcedHudFrame('sniper', {
      distM: Math.round(bestD),
      // r4 hud_ui: M829A4 vs a Tiger flank is a guaranteed pen — the flagship
      // shot must demonstrate the GREEN indicator state (0.95 showed
      // permanent ambiguous orange).
      penRatio: 1.5,
      reload: { t: 0, totalS: 6 },
      shellSlot: 0,
      zoom: 8,
      dispersionRadM: computeDispersionRadM(p.spec, p.state, bestD),
      shells: shellCards,
    });
  },
  tank_closeup_modern() {
    hud.setMode('hidden');
    // tank_models r2: sun-side close orbit (negative azimuth) — fills the
    // frame and keeps the running gear/M256 collar/skirt panels readable.
    // lighting_post r4: elev 9 -> 15, dist 7 -> 8 — the extra elevation puts
    // the hull-adjacent contact shadow above the hull's own horizon so the
    // closeup actually shows the vehicle grounded (shadow-read fix).
    const hero = game.tankById.get('m1a2');
    // tank_models r6 (minor): a flat background bot ("312") parked right
    // behind the hero undercut the closeup — push any OTHER vehicle inside
    // 55 m a further 30 m out along its own bearing (deterministic, no rng;
    // this view runs after the battlefield capture so wide shots keep their
    // original staging).
    for (const t of game.tanks) {
      if (t === hero || !t.state || !t.visual) continue;
      const ddx = t.state.pos.x - hero.state.pos.x;
      const ddz = t.state.pos.z - hero.state.pos.z;
      const d = Math.hypot(ddx, ddz);
      if (d > 0.01 && d < 55) {
        const s = (d + 30) / d;
        t.state.pos.x = hero.state.pos.x + ddx * s;
        t.state.pos.z = hero.state.pos.z + ddz * s;
        t.state.pos.y = world.heightField.getHeightAt(t.state.pos.x, t.state.pos.z);
        t.visual.syncFromState(t.state);
      }
    }
    closeupStage(hero);
    orbitPose(hero, 8, -42, 15, 45);
  },
  tank_closeup_ww2() {
    hud.setMode('hidden');
    // Sun-lit 3/4 front (tank_models r1): the old azimuth 35 put the running
    // gear and lower hull in their own shadow — the interleaved wheels, track
    // sag and camo bands were unreadable in the judged frame.
    closeupStage(game.tankById.get('tiger1'));
    orbitPose(game.tankById.get('tiger1'), 9, -35, 15, 45); // tank_models r5: elev/fov match the other closeups (shared sun read)
  },
  tank_closeup_t90m() {
    hud.setMode('hidden');
    // tank_models r3: every core roster tank gets a judged closeup — the
    // T-90M shipped unauditable as a carousel thumb.
    closeupStage(game.tankById.get('t90m'));
    orbitPose(game.tankById.get('t90m'), 8, -38, 15, 45); // lighting_post r4: elev 10 -> 15 (contact shadow read)
  },
  tank_closeup_leo2a7() {
    hud.setMode('hidden');
    closeupStage(game.tankById.get('leo2a7'));
    orbitPose(game.tankById.get('leo2a7'), 8, -35, 15, 45); // lighting_post r4: elev 10 -> 15 (contact shadow read)
  },
  detrack() {
    // effects_combat r2: de-track destruction visuals — slumped band, thrown
    // track ribbon, scattered road wheel + fx burst (rubric item).
    hud.setMode('hidden');
    const ent = game.tankById.get('tiger1');
    orbitPose(ent, 10, 120, 10, 45);           // rear-quarter, running gear side
    // effects_combat r1: break the RIGHT track — the 120-deg orbit frames the
    // right flank, and the de-track rework removes the band from the broken
    // side (bare road wheels + ground ribbon must be the side on camera).
    ent.visual.setTrackState('trackR', true);
    bus.emit('module:state', { id: ent.id, module: 'trackR', state: 'red' });
  },
  combat_firing() {
    hud.setMode('hidden');
    const p = game.player;
    // effects_combat r2: pitch 8 → 14 lifts the barrel line onto the sunlit
    // road so the dark tube no longer vanishes against the shadowed bank.
    orbitPose(p, 13, 55, 18, 45); // lighting_post r4: elev 14 -> 18 (left-side shadow readable)
    // effects_combat r4: recoil timelines now advance on the SHARED FX CLOCK
    // (src/fx/clock.ts), which is pinned during __SHOTS.set — repeated
    // syncFromState calls advance 0 s. recoilKick(ageS) takes the composed
    // age directly: backdate the stroke 50 ms so the barrel sits visibly
    // out of battery in the staged still.
    // §5.362: twin-plant players alternate barrels here too — the kick
    // returns the fired barrel's index and the composed flash sits on THAT
    // tip (single-bore: null index, legacy center anchor).
    const fireIdx = p.visual.recoilKick(0.05); // backdate: stroke already 50 ms in
    p.visual.syncFromState(p.state);    // one call to apply the pose
    // controls_gunnery r3: staged flash direction along the real bore axis.
    p.visual.gunMuzzleWorld(_v1, fireIdx != null ? fireIdx : undefined);
    p.visual.gunDirWorld(_v3);
    fx.composeFiringMoment({
      muzzlePos: _v1.clone(),
      dir: _v3.clone(),
      caliberMm: p.spec.gun.caliberMm,
      tracerType: 'APFSDS',
      ageS: 0.05,
    });
  },
  explosion() {
    hud.setMode('hidden');
    // Prefer the third enemy for the original framing, but compact deterministic
    // screenshot rosters may field only one. Always remain team-filtered so an
    // ally can never become the staged victim.
    const victims = game.tanks.filter((t) => t.team === 'enemy');
    const ent = victims[2] || victims[0];
    if (!ent) throw new Error('Explosion view requires at least one enemy tank');
    _v2.copy(ent.state.pos);
    // effects_combat r1: frame center raised (was +1.4) and camera pulled
    // back to 26 m at a shallower 18 deg so fireball + leaning smoke column
    // + debris all fit — the old 22 m / 24 deg framing cropped everything
    // above ~6 m and cut the column.
    _v2.y += 3.2;
    const az = ent.state.yaw + 150 * DEG;
    _v1.set(
      _v2.x + Math.sin(az) * 26 * Math.cos(18 * DEG),
      _v2.y + Math.sin(18 * DEG) * 26 + 1.5,
      _v2.z + Math.cos(az) * 26 * Math.cos(18 * DEG),
    );
    rig.setExternalPose(_v1, _v2, 45);
    fx.composeExplosionMoment({ pos: _v2.clone(), ageS: 0.6 });
    // freeze the ammo-rack turret pop mid-arc — turret visibly airborne
    // above the fireball with spin at the 0.6 s composed moment
    ent.visual.setDestroyed({ pop: true, ageS: 0.6 });
  },
  async garage() {
    hud.setMode('hidden');
    await setPedestalTank('m1a2');
    garage.show('m1a2');
    if (garage.drainThumbs) garage.drainThumbs(); // portraits finished for the capture
    await garageDressing.ensureBuilt(); // deterministic capture: workshop fully dressed
    showroom.reset();
  },
  battlefield_desert() { mapEstablishingShot(); },
  battlefield_winter() { mapEstablishingShot(); },
  battlefield_urban() { mapEstablishingShot(); },
  // MAPS r1
  battlefield_coastal() { mapEstablishingShot(); },
  battlefield_autumn() { mapEstablishingShot(); },
  battlefield_steppe() { mapEstablishingShot(); },
  battlefield_railyard() { mapEstablishingShot(); },
  battlefield_frontier() { mapEstablishingShot(); },
  battlefield_fjord() { mapEstablishingShot(); },
  battlefield_delta() { mapEstablishingShot(); },
  battlefield_badlands() { mapEstablishingShot(); },
  battlefield_monsoon() { mapEstablishingShot(); },
  battlefield_alpine() { mapEstablishingShot(); },
  battlefield_caldera() { mapEstablishingShot(); },
  battlefield_foundry() { mapEstablishingShot(); },
  battlefield_ruinspires() { mapEstablishingShot(); },
  battlefield_blackglass() { mapEstablishingShot(); },
  battlefield_titan_gorge() { mapEstablishingShot(); },
  battlefield_skybridge() { mapEstablishingShot(); },
  // The projectile recipe below is shared so the firing and x-ray captures
  // resolve the exact same seeded shot. Only the staged playback beat differs.
  killcam_firing() {
    projectileReplayStage = 'firing';
    try { SHOT_VIEWS.killcam_xray(); } finally { projectileReplayStage = 'xray'; }
  },
  // Front-to-front ram staged at contact. Neither the recipe nor the replay
  // snapshot contains a shell trajectory, making phantom tracers observable
  // as a deterministic visual-regression failure.
  killcam_collision() {
    hud.setMode('hidden');
    const target = game.player;
    const attacker = game.tankById.get('t90m');
    const terrainOffset = target.state.pos.y
      - world.heightField.getHeightAt(target.state.pos.x, target.state.pos.z);
    const x = target.state.pos.x;
    const z = target.state.pos.z;
    const atY = (pz: number): number => world.heightField.getHeightAt(x, pz) + terrainOffset;
    const makePose = (
      ent: ShotEntity,
      px: number,
      py: number,
      pz: number,
      yaw: number,
    ) => ({
      pos: [px, py, pz], yaw,
      pitch: ent.state.visualPitch || 0,
      roll: ent.state.visualRoll || 0,
      turretYaw: 0, gunPitch: 0,
    });
    const moduleStates = (ent: ShotEntity): Record<string, string> => {
      const states: Record<string, string> = {};
      for (const [id, module] of Object.entries(ent.combat.modules)) {
        if (module) states[id] = module.state;
      }
      return states;
    };
    const targetImpact = makePose(target, x, atY(z), z, 0);
    const targetBefore = makePose(target, x, atY(z - 2.8), z - 2.8, 0);
    const attackerImpact = makePose(attacker, x, atY(z + 7.1), z + 7.1, Math.PI);
    const attackerBefore = makePose(attacker, x, atY(z + 10.3), z + 10.3, Math.PI);
    const preTargetModules = moduleStates(target);
    const postTargetModules = { ...preTargetModules, trackR: 'red', transmission: 'red' };
    const preAttackerModules = moduleStates(attacker);
    const modulesHit: HitEvent['modulesHit'] = [
      { module: 'trackR', newState: 'red', dmg: 100 },
      { module: 'transmission', newState: 'red', dmg: 140 },
    ];
    const contact = [x, Math.max(targetImpact.pos[1], attackerImpact.pos[1]) + 0.7, z + 3.55];
    killcam.stageReplayShot({
      replayKind: 'collision',
      ev: {
        kind: 'collision', cause: 'ram', shellId: null,
        attackerId: attacker.id, attackerName: attacker.spec.name,
        attackerSpecId: attacker.specId,
        targetId: target.id, targetName: target.spec.name, targetSpecId: target.specId,
        targetMaxHp: target.combat.maxHp, pos: contact, normal: [0, 0, -1],
        localPos: null, localDir: null, crewHit: [], modulesHit,
        damage: 620, destroyed: true, ammoRacked: false, flightDistM: 0,
        closingMps: 15.5,
      },
      timeS: VIEW_TIME.killcam_collision,
      trajPts: null,
      crewAlive: { ...target.combat.crew },
      moduleStates: postTargetModules,
      eraSpent: [...(target.combat.eraSpent || [])],
      preCrewAlive: { ...target.combat.crew },
      preModuleStates: preTargetModules,
      preEraSpent: [...(target.combat.eraSpent || [])],
      pose: targetImpact,
      prePose: targetBefore,
      attackerEnt: attacker,
      attackerPose: attackerBefore,
      attackerImpactPose: attackerImpact,
      attackerPreModuleStates: preAttackerModules,
      attackerPreEraSpent: [...(attacker.combat.eraSpent || [])],
      attackerPreDestroyed: false,
      attackerModuleStates: preAttackerModules,
      attackerEraSpent: [...(attacker.combat.eraSpent || [])],
      attackerModulesHit: [],
      muzzle: null, shotDir: null, muzzleVelocityMps: 0, firedTimeS: 0,
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    }, 'collision');
  },
  // KILL-CAM: deterministic staged x-ray replay frame. A synthetic T-90M
  // flank shot into the player's M1A2 SEPv3 is resolved through the
  // REAL sim pipeline (traceTank + resolveShellHit, seeded rng, throwaway
  // combat state) and handed to the kill-cam's staged x-ray renderer.
  killcam_xray() {
    hud.setMode('hidden');
    const target = game.player;
    const shooter = game.tankById.get('t90m');
    const shellSpec = shooter.spec.gun.shells[0]; // 125 mm APFSDS
    // Synthetic flank muzzle (staged frame): a front-right-quarter shot at
    // 440 m guarantees a penetration whose internal ray crosses track/engine/
    // fuel/ammo boxes — the frame must showcase module damage.
    const flankAz = target.state.yaw + Math.PI / 2 + 0.35;
    _v1.set(
      target.state.pos.x + Math.sin(flankAz) * 440,
      target.state.pos.y + 9,
      target.state.pos.z + Math.cos(flankAz) * 440,
    );
    const pose = tankPoseFromState(target.state);
    // Deterministic candidate scan: fixed aim heights / lateral offsets /
    // seeds, resolved through the REAL pipeline against a throwaway combat
    // state; first candidate that pens with ≥2 module/crew casualties wins.
    const rightX = Math.cos(target.state.yaw);
    const rightZ = -Math.sin(target.state.yaw);
    let ev: StagedHitEvent | null = null;
    const tryOne = (h: number, side: number, seed: number): StagedHitEvent | null => {
      _v2.copy(target.state.pos);
      _v2.y += h;
      _v2.x += rightX * side;
      _v2.z += rightZ * side;
      _v3.copy(_v2).sub(_v1);
      const distM = _v3.length();
      _v3.multiplyScalar(1 / distM);
      const from = _v2.clone().addScaledVector(_v3, -30);
      const to = _v2.clone().addScaledVector(_v3, 30);
      const hits = traceTank(from, to, pose, target.spec.armor, new Set());
      if (!hits.length) return null;
      const shell = createShell(shellSpec, shooter.id, true, from, _v3, 99001);
      shell.distM = distM;
      return resolveShellHit(
        shell,
        { id: target.id, spec: target.spec, state: target.state, combat: createCombatState(target.spec) },
        hits, mulberry32(seed),
      );
    };
    outer:
    for (const seed of [9001, 4242, 555, 77]) {
      for (const h of [0.85, 1.0, 1.2, 1.45]) {
        for (const side of [0, 0.55, -0.55]) {
          const cand = tryOne(h, side, seed);
          if (!cand || cand.kind !== 'pen' || !cand.localPos) continue;
          if (!ev) ev = cand;
          if ((cand.modulesHit.length + cand.crewHit.length) >= 2) { ev = cand; break outer; }
        }
      }
    }
    if (!ev) ev = tryOne(1.05, 0, 4242);
    if (!ev) throw new Error('Killcam x-ray recipe could not resolve a staged penetration');
    ev.attackerName = shooter.spec.name;
    // killcam_shotinfo r3: match live events (state.ts enriches every hit
    // with attackerSpecId) so pen-roll annotations can resolve the shell.
    ev.attackerSpecId = shooter.specId;
    ev.targetName = target.spec.name;
    ev.targetSpecId = target.specId;
    const replayTimeS = VIEW_TIME.killcam_xray ?? 1;
    ev.timeS = replayTimeS;
    const traj = [];
    for (let i = 0; i <= 24; i++) {
      traj.push(
        _v1.x + (ev.pos[0] - _v1.x) * (i / 24),
        _v1.y + (ev.pos[1] - _v1.y) * (i / 24),
        _v1.z + (ev.pos[2] - _v1.z) * (i / 24),
      );
    }
    const shotDir = _v3.clone().set(
      ev.pos[0] - _v1.x, ev.pos[1] - _v1.y, ev.pos[2] - _v1.z,
    ).normalize();
    const shooterGroundOffset = shooter.state.pos.y
      - world.heightField.getHeightAt(shooter.state.pos.x, shooter.state.pos.z);
    const shooterX = _v1.x - shotDir.x * 4.2;
    const shooterZ = _v1.z - shotDir.z * 4.2;
    const attackerPose = {
      pos: [
        shooterX,
        world.heightField.getHeightAt(shooterX, shooterZ) + shooterGroundOffset,
        shooterZ,
      ],
      yaw: Math.atan2(shotDir.x, shotDir.z), pitch: 0, roll: 0,
      turretYaw: 0,
      gunPitch: Math.atan2(shotDir.y, Math.hypot(shotDir.x, shotDir.z)),
    };
    const targetPose = {
      pos: [target.state.pos.x, target.state.pos.y, target.state.pos.z],
      yaw: target.state.yaw,
      pitch: target.state.visualPitch,
      roll: target.state.visualRoll,
      turretYaw: target.state.turretYaw,
      gunPitch: target.state.gunPitch,
    };
    const targetModules = Object.fromEntries(
      Object.entries(target.combat.modules || {}).map(([id, module]) => [id, module.state]),
    );
    const attackerModules = Object.fromEntries(
      Object.entries(shooter.combat.modules || {}).map(([id, module]) => [id, module.state]),
    );
    killcam.stageReplayShot({
      replayKind: 'projectile',
      ev,
      timeS: replayTimeS,
      trajPts: traj,
      pose: targetPose,
      impactPose: { ...targetPose, pos: targetPose.pos.slice() },
      preCrewAlive: { ...target.combat.crew },
      crewAlive: { ...target.combat.crew },
      preModuleStates: targetModules,
      moduleStates: targetModules,
      preEraSpent: [...(target.combat.eraSpent || [])],
      eraSpent: [...(target.combat.eraSpent || [])],
      attackerEnt: shooter,
      attackerPose,
      muzzle: [_v1.x, _v1.y, _v1.z],
      shotDir: shotDir.toArray(),
      muzzleVelocityMps: shellSpec.velocityMps || 1500,
      firedTimeS: replayTimeS - 0.4,
      caliberMm: shellSpec.caliberMm || shooter.spec.gun.caliberMm || 125,
      weaponSound: shooter.spec.gun.weaponSound || null,
      muzzleIndex: 0,
      recoilScale: 1,
      attackerPreModuleStates: attackerModules,
      attackerPreEraSpent: [...(shooter.combat.eraSpent || [])],
      attackerPreDestroyed: false,
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    }, projectileReplayStage);
  },
  };
  return SHOT_VIEWS;
}
