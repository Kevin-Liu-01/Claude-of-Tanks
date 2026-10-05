/**
 * combat/combatFx.ts — the combat media layer effects.ts composes (combat-fx lane, 2026-10-05).
 *
 * Owns two media pools (mediaShader.ts: 'earth' = dust, soil, powder, spray on the wisp sheet; 'smoke' = combustion
 * smoke, fireball bodies, propellant clouds on the billow sheet), the thrown clods, the crater batch, and the per-frame
 * state they read: the shared fx clock, the scene's sun and sky (scene.userData.lightRig / sunDirWorld), the scene
 * wind (the volumetric cloud layer's wind, slowed to the ground; a temperate default where there is no cloud layer)
 * and the pooled explosion light. The recipes (impactBurst.ts, muzzleBlast.ts, killBlast.ts) draw from the battle's
 * seeded fx stream through the context, so Studio's resetSeed and frozen captures stay deterministic.
 *
 * Seams with effects.ts (deliberately few): construction, update, warm, reset, the clock rebase, the late-pass
 * activity, and the recipe entry points. Nothing here edits the battle particle system; it only reads its clock,
 * its copied scene-depth uniforms and its pool emitters.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from '../layers.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import { MediaPool, makeMediaPuff, type MediaPuff } from './mediaPool.ts';
import { MEDIA_FRAG, MEDIA_VERT } from './mediaShader.ts';
import { bakeMediaAtlasSteps, makeMediaNoiseTexture } from './mediaAtlas.ts';
import { ClodPool, makeClodRecord, type ClodRecord } from './clods.ts';
import { CraterDecals, type CraterKind } from './craters.ts';
import type { BattleJet, BattlePuff, BattleStreak, CombatContext } from './context.ts';
import { groundBurst, waterBurst } from './impactBurst.ts';
import { muzzleBlast, type MuzzleBlastInput } from './muzzleBlast.ts';
import { columnPuff, deckFlame, killBlast, smolderPuff, type KillCause } from './killBlast.ts';
import type { SurfaceField, SurfaceKind } from './surface.ts';

interface Vec3Like { x: number; y: number; z: number }

interface SoftParticleUniforms {
  uSceneDepth: { value: unknown };
  uSoftViewport: { value: THREE.Vector2 };
  uCameraNear: { value: number };
  uCameraFar: { value: number };
}

interface LightRigLike {
  sunIntensity?: number; sunColor?: THREE.Color; hemiIntensity?: number; hemiSky?: THREE.Color; hemiGround?: THREE.Color;
}

interface LightModelLike {
  mode?: string; envIntensity?: number; envDiffuseGain?: number; groundRadiance?: readonly number[];
}

export interface CombatFxOptions {
  seed: number;
  scene?: THREE.Scene | null;
  camera?: () => THREE.Camera | null | undefined;
  field: (SurfaceField & { getHeightAt?(x: number, z: number): number }) | null;
  /** the battle's seeded stream (effects.ts rng), read through a closure so resetSeed reaches the recipes */
  rand: () => number;
  /** the shared fx clock (particles.getTime) */
  now: () => number;
  soft: SoftParticleUniforms;
  /** the battle pools for additive light */
  emitBattle: {
    flash(o: BattlePuff): void; fire(o: BattlePuff): void; sparks(o: BattleStreak): void; jet(o: BattleJet): void;
  };
  lightPulse(x: number, y: number, z: number, peakK: number, delayS: number): void;
  distBoost(x: number, y: number, z: number): number;
  explosionLight?: THREE.PointLight | null;
  /** 'mobile' halves every recipe's counts and the pools; default from the resolved device tier */
  tier?: 'mobile' | 'desktop';
}

/** Ground wind from the cloud layer's wind aloft (m/s), and the temperate default direction (treeClimate's). */
const DEFAULT_WIND_DIR: readonly [number, number] = [0.8, 0.6];
const DEFAULT_WIND_MPS = 2.2;
export function groundWindFromAloft(speedAloft: number): number {
  return Math.min(5, Math.max(1.3, speedAloft * 0.42));
}

/**
 * Light units: three's lambert divides irradiance by pi; the media take the same form, with a gain each. The sky
 * pole is the physical model's environment light (sky irradiance x envIntensity x envDiffuseGain, as the CSM lit
 * materials receive it) plus the hemisphere; the legacy rig (phones) has no published environment share, so its
 * hemisphere stands in at a higher gain. Live-tunable through group.userData.combatTune (diagnostics only).
 */
const DEFAULT_TUNE = Object.freeze({ sun: 1.0, amb: 1.0, legacyAmb: 2.2, fire: 0.32, glow: 1.0, alpha: 1.0 });

export interface CombatFx {
  readonly group: THREE.Group;
  update(): void;
  warmTextures(): void;
  warmTexturesChunked(yieldFrame: () => Promise<void>): Promise<void>;
  resetAll(): void;
  shiftTime(delta: number): void;
  isActive(): boolean;
  groundImpact(pos: Vec3Like, caliberMm: number, explosive: boolean, birthOffset?: number,
    surface?: SurfaceKind | null): SurfaceKind;
  waterImpact(pos: Vec3Like, caliberMm: number, explosive: boolean, birthOffset?: number, surfaceY?: number | null): void;
  muzzleBlast(o: MuzzleBlastInput): void;
  kill(pos: Vec3Like, cause: KillCause, birthOffset?: number): void;
  columnPuff(x: number, y: number, z: number, stage: number, scale: number, birthOffset?: number): void;
  smolderPuff(x: number, y: number, z: number, k: number, birthOffset?: number): void;
  deckFlame(x: number, y: number, z: number, scale: number, birthOffset?: number): void;
  /** receipts: live counts and the current wind */
  stats(): { earth: number; smoke: number; clods: number; wind: [number, number, number]; baked: boolean };
}

export function createCombatFx(o: CombatFxOptions): CombatFx {
  const mobile = (o.tier ?? getDeviceTier()) === 'mobile';
  const group = new THREE.Group();
  group.name = 'fx-combat-media';
  group.matrixAutoUpdate = false;

  const placeholder = new THREE.DataTexture(new Uint8Array([128, 128, 0, 0]), 1, 1);
  placeholder.needsUpdate = true;
  const noise = makeMediaNoiseTexture(o.seed);
  const uTime = { value: 0 };
  const uWind = { value: new THREE.Vector3(DEFAULT_WIND_DIR[0] * DEFAULT_WIND_MPS, 0, DEFAULT_WIND_DIR[1] * DEFAULT_WIND_MPS) };
  const uSunDir = { value: new THREE.Vector3(0.527, 0.574, -0.627).normalize() };
  const uSunCol = { value: new THREE.Vector3(1.4, 1.35, 1.25) };
  const uSkyCol = { value: new THREE.Vector3(0.3, 0.36, 0.45) };
  const uGroundCol = { value: new THREE.Vector3(0.16, 0.15, 0.13) };
  const uSunUp = { value: 0.6 };
  const uFirePos = { value: new THREE.Vector4(0, -1e4, 0, 13) };
  const uFireCol = { value: new THREE.Vector3(0, 0, 0) };
  const uNoise = { value: noise };
  const uGrade = { value: new THREE.Vector2(1, 1) }; // media alpha, emissive gain
  const tune = { ...DEFAULT_TUNE };
  group.userData.combatTune = tune;

  function mediaMaterial(nearFade: readonly [number, number]): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: MEDIA_VERT,
      fragmentShader: MEDIA_FRAG,
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime, uWind, uSunDir, uSunCol, uSkyCol, uGroundCol, uFirePos, uFireCol, uNoise, uGrade,
        uMap: { value: placeholder as THREE.Texture },
        uNearFade: { value: new THREE.Vector2(nearFade[0], nearFade[1]) },
        uSceneDepth: o.soft.uSceneDepth,
        uSoftViewport: o.soft.uSoftViewport,
        uCameraNear: o.soft.uCameraNear,
        uCameraFar: o.soft.uCameraFar,
      }),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      fog: true,
    });
  }

  const earth = new MediaPool('Combat media: earth', mobile ? 512 : 1024, mediaMaterial([0.6, 2.6]));
  const smoke = new MediaPool('Combat media: smoke', mobile ? 1024 : 2048, mediaMaterial([0.8, 3.2]));
  // draw order inside the late pass: battle dust 20 < earth media < battle smoke 21 ... psmoke 21.2 < smoke media <
  // battle billow 21.5 < additive fire 22 (the glow lands on top of the media bodies)
  earth.mesh.renderOrder = 20.5;
  smoke.mesh.renderOrder = 21.35;
  earth.mesh.layers.set(LATE_FX_LAYER);
  smoke.mesh.layers.set(LATE_FX_LAYER);
  const clods = new ClodPool(mobile ? 128 : 320, o.seed, { uTime, uSunDir, uSunCol, uSkyCol, uGroundCol });
  const craters = new CraterDecals({ uTime, uNoise, uSunCol, uSkyCol, uSunUp });
  group.add(clods.mesh, craters.mesh, earth.mesh, smoke.mesh);

  // --- the sheets: baked once (seeded), cooperatively when a covered warm offers frames
  let baked = false;
  let bakeGen: Generator<void, void, void> | null = null;
  function* bakeSteps(): Generator<void, void, void> {
    const billow = bakeMediaAtlasSteps('billow', o.seed);
    let r = billow.next();
    while (!r.done) { yield; r = billow.next(); }
    (smoke.mesh.material.uniforms.uMap as THREE.IUniform).value = r.value;
    const wisp = bakeMediaAtlasSteps('wisp', o.seed);
    let w = wisp.next();
    while (!w.done) { yield; w = wisp.next(); }
    (earth.mesh.material.uniforms.uMap as THREE.IUniform).value = w.value;
  }
  function warmTextures(): void {
    if (baked) return;
    const g = bakeGen || (bakeGen = bakeSteps());
    for (let r = g.next(); !r.done; r = g.next()) { /* drain */ }
    bakeGen = null;
    baked = true;
  }
  async function warmTexturesChunked(yieldFrame: () => Promise<void>): Promise<void> {
    if (baked) return;
    const g = bakeGen || (bakeGen = bakeSteps());
    for (;;) {
      if (bakeGen !== g) return;
      const r = g.next();
      if (r.done) { bakeGen = null; baked = true; return; }
      await yieldFrame();
    }
  }

  // --- the recipe context
  const now = o.now;
  const ground = (x: number, z: number): number => o.field?.getHeightAt?.(x, z) ?? 0;
  const m = makeMediaPuff();
  const k = makeClodRecord();
  const bp: BattlePuff = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 2, rot: 0, rotVel: 0,
    col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 };
  const bs: BattleStreak = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18,
    col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 };
  const bj: BattleJet = { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.2, width: 0.4, len0: 0.5, len1: 3, seed: 0,
    col: [1, 1, 1], alpha: 1, birthOffset: 0 };
  const ensureBaked = (): void => { if (!baked) warmTextures(); };
  const C: CombatContext = {
    rand: o.rand,
    groundY: ground,
    field: o.field,
    earth: (p: MediaPuff) => earth.emit(p, now()),
    smoke: (p: MediaPuff) => smoke.emit(p, now()),
    clod: (p: ClodRecord) => clods.emit(p, now()),
    crater: (x: number, z: number, radius: number, kind: CraterKind, explosive: boolean, birthOffset: number) =>
      craters.stamp(x, z, radius, kind, explosive, o.rand(), o.rand() * Math.PI * 2, now() + birthOffset, ground),
    flash: o.emitBattle.flash,
    fire: o.emitBattle.fire,
    sparks: o.emitBattle.sparks,
    jet: o.emitBattle.jet,
    lightPulse: o.lightPulse,
    distBoost: o.distBoost,
    tier: mobile ? 0.5 : 1,
    m, k, bp, bs, bj,
  };

  // --- per-frame state
  const _sun = new THREE.Vector3();
  function refreshLight(): void {
    const ud = o.scene?.userData as { sunDirWorld?: THREE.Vector3; lightRig?: LightRigLike; lightModel?: LightModelLike;
      skyIrradiance?: THREE.Color; volumetricClouds?: { currentPreset?: { windDirRad?: number; windSpeed?: number } | null } }
      | undefined;
    const sunDir = ud?.sunDirWorld;
    if (sunDir && sunDir.lengthSq() > 1e-8) uSunDir.value.copy(_sun.copy(sunDir).normalize());
    const rig = ud?.lightRig;
    if (rig) {
      const si = (rig.sunIntensity ?? 4.5) * tune.sun / Math.PI;
      const sc = rig.sunColor;
      uSunCol.value.set(sc ? sc.r * si : si, sc ? sc.g * si : si, sc ? sc.b * si : si);
      const model = ud?.lightModel;
      const irr = ud?.skyIrradiance;
      const physical = model?.mode === 'physical' && !!irr;
      const hi = (rig.hemiIntensity ?? 0.4) * (physical ? tune.amb : tune.legacyAmb) / Math.PI;
      const sky = rig.hemiSky, gnd = rig.hemiGround;
      uSkyCol.value.set(sky ? sky.r * hi : hi, sky ? sky.g * hi : hi, sky ? sky.b * hi : hi);
      uGroundCol.value.set(gnd ? gnd.r * hi : hi, gnd ? gnd.g * hi : hi, gnd ? gnd.b * hi : hi);
      if (physical && irr) {
        const k = (model?.envIntensity ?? 1) * (model?.envDiffuseGain ?? 1) * tune.amb;
        uSkyCol.value.x += irr.r * k; uSkyCol.value.y += irr.g * k; uSkyCol.value.z += irr.b * k;
        const gr = model?.groundRadiance;
        if (gr && gr.length >= 3) {
          uGroundCol.value.x += gr[0] * k; uGroundCol.value.y += gr[1] * k; uGroundCol.value.z += gr[2] * k;
        }
      }
    }
    uSunUp.value = Math.max(0.05, uSunDir.value.y);
    uGrade.value.set(tune.alpha, tune.glow);
    const preset = ud?.volumetricClouds?.currentPreset;
    if (preset && Number.isFinite(preset.windDirRad) && Number.isFinite(preset.windSpeed)) {
      const speed = groundWindFromAloft(preset.windSpeed as number);
      uWind.value.set(Math.cos(preset.windDirRad as number) * speed, 0, Math.sin(preset.windDirRad as number) * speed);
    }
    const fl = o.explosionLight;
    if (fl && fl.intensity > 0.01) {
      uFirePos.value.set(fl.position.x, fl.position.y, fl.position.z, fl.distance || 13);
      const fi = fl.intensity * tune.fire / Math.PI;
      uFireCol.value.set(fl.color.r * fi, fl.color.g * fi, fl.color.b * fi);
    } else {
      uFireCol.value.set(0, 0, 0);
    }
  }

  return {
    group,
    update(): void {
      uTime.value = now();
      refreshLight();
      earth.flush();
      smoke.flush();
      clods.flush();
    },
    warmTextures,
    warmTexturesChunked,
    resetAll(): void {
      earth.reset();
      smoke.reset();
      clods.reset();
      craters.reset();
    },
    shiftTime(delta: number): void {
      earth.shiftTime(delta);
      smoke.shiftTime(delta);
      clods.shiftTime(delta);
      craters.shiftTime(delta);
    },
    isActive(): boolean {
      const t = now();
      return t <= earth.liveUntil || t <= smoke.liveUntil;
    },
    groundImpact(pos, caliberMm, explosive, birthOffset = 0, surface = null) {
      ensureBaked();
      return groundBurst(C, pos, caliberMm, explosive, birthOffset, surface);
    },
    waterImpact(pos, caliberMm, explosive, birthOffset = 0, surfaceY = null) {
      ensureBaked();
      waterBurst(C, pos, caliberMm, explosive, birthOffset, surfaceY);
    },
    muzzleBlast(input) {
      ensureBaked();
      muzzleBlast(C, input);
    },
    kill(pos, cause, birthOffset = 0) {
      ensureBaked();
      killBlast(C, pos, cause, birthOffset);
    },
    columnPuff(x, y, z, stage, scale, birthOffset = 0) {
      ensureBaked();
      columnPuff(C, x, y, z, stage, scale, birthOffset);
    },
    smolderPuff(x, y, z, kk, birthOffset = 0) {
      ensureBaked();
      smolderPuff(C, x, y, z, kk, birthOffset);
    },
    deckFlame(x, y, z, scale, birthOffset = 0) {
      ensureBaked();
      deckFlame(C, x, y, z, scale, birthOffset);
    },
    stats() {
      return { earth: earth.count, smoke: smoke.count, clods: clods.count,
        wind: [uWind.value.x, uWind.value.y, uWind.value.z], baked };
    },
  };
}
