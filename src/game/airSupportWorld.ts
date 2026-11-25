/**
 * airSupportWorld.ts — Air Support over the battlefield (air-support-270): every call-in's aircraft, flown from its public
 * record (sim/strikeRuns.ts runPose: the same run the authority fires its rounds from and tests hits against, so what a
 * crew sees is what it shoots, and the footprint is drawn from that same run), and every footprint and the crew's own aiming reticle painted on the ground (engine/strikeMarks.ts: a term of
 * the aerial post pass, fixed cost, on the terrain, the roofs and the walls alike).
 *
 * The A-10 (strikeJetAirframe.ts) flies the recon pass and the strafing run; the fighter (fighterJetAirframe.ts,
 * air-support-275) the precision bomb and the Maverick run, its stores leaving it where and when the run releases them;
 * the AC-130 orbit is the gunship's own airframe (gunshipVisual.ts, its props turning, banked into the pylon turn). An
 * aircraft struck by the other side trails smoke (more the nearer it is to falling); a downed one rolls, noses over and
 * falls along its last heading, burning, and bursts where it meets the ground (air-support-275: "be able to shoot down
 * planes if u land shots"). Part of the mode world's chunk (matchModeWorldPresentation.ts): the Garage and the other
 * modes never load it. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';
import { AIR_CRASH_RULES, AIR_SUPPORT_RULES, airStrikeFlies } from '../sim/matchRuleset.ts';
import { AIRFRAME_BOXES, airframeOf, fromAirframe, fromAirframeDir, seatWreck as seatWreckFrame, toAirframe, wreckAttitude, wreckBreak,
  type AircraftWreck } from '../sim/airframeVolumes.ts';
import { strikeDangerS } from '../sim/airSupport.ts';
import { strikeCallBlocker } from '../sim/strikeCall.ts';
import type { AirSupportView } from '../sim/airSupport.ts';
import { BOMB_GRAVITY_MPS2, bombReleaseOffsetS, crashFall, missileLaunchOffsetS, runExitS, runFootprint, runMuzzle, runPose, runVelocity,
  type RunPose, type StrikeFootprint } from '../sim/strikeRuns.ts';
import { aircraftHits, crashedStrikes, releasedBombs } from './airSupportBridge.ts';
import { buildStrikeJetAirframe, type BuiltStrikeJet } from './strikeJetAirframe.ts';
import { buildFighterJetAirframe, type BuiltFighterJet } from './fighterJetAirframe.ts';
import { gunshipModelRoot, hideGunshipVisual, syncGunshipVisual } from './gunshipVisual.ts';
import { SUPPORT_STEP_UP_M } from '../sim/structureSupport.ts';
import { STRIKE_MARK_MAX, clearStrikeMarks, setStrikeMarks, type StrikeMark, type StrikeMarkShape } from '../engine/strikeMarks.ts';
import { sideColor } from '../ui/objectiveGlyphs.ts';
import { strikeView } from './strikeViewState.ts';
import { killcamStage } from './killcamStage.ts';
import { createAircraftStreaks, type AircraftStreaks } from './aircraftStreaks.ts';
import { paintTeamTrim, weatherAirframe, type AirframeTear } from './airframeParts.ts';

/** The battle's effects for an aircraft (main.ts hands the FX runtime's: absent, nothing is drawn but the airframe). */
export interface AircraftFxPort {
  /** A struck or falling airframe's smoke at a point, `intensity` 0..1 (called a few times a second while it lasts). */
  smoke(x: number, y: number, z: number, intensity: number): void;
  /** A downed aircraft bursting where it meets the ground. */
  crash(x: number, y: number, z: number): void;
  /** (aircraft-solid-277) A round striking an airframe at a point on its skin facing (nx, ny, nz): sparks off the metal,
   *  a burst for an explosive round or a drone's warhead. */
  hit?(x: number, y: number, z: number, nx: number, ny: number, nz: number, caliberMm: number, explosive: boolean): void;
}

interface AirSupportWorldOptions {
  viewerPosition?: () => { x: number; y: number; z: number } | null;
  /** The drawn ground (main.ts: the battle's vehicle ground sampler, world/vehicleGroundSampler.ts, on the dug terrain):
   *  with a `ceiling`, the standable tops (a roof, a deck) at or under it as well, by the movement solve's own rule. */
  groundHeight?: (x: number, z: number, ceiling?: number) => number;
  aircraftFx?: AircraftFxPort;
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

type PublicStrike = AirSupportView['strikes'][number];
interface Craft { kind: 'jet' | 'gunship'; root: THREE.Object3D; jet: BuiltStrikeJet | null; fighter: BuiltFighterJet | null;
  seen: boolean;
  /** (aircraft-streaks-277) its wingtip streaks, in its side's team colour (aircraftStreaks.ts). */
  streaks: AircraftStreaks;
  /** The bomb once it has left the fighter's pylon: falling in the world on its own arc. */
  dropped: THREE.Object3D | null;
  /** When it last trailed smoke (presentation time), and whether its crash has burst. */
  smokedAt: number; crashed: boolean;
  /** (air-crash-he-276) its wreck on the ground: when it came down (presentation time; null while it flies or falls), the
   *  crash point, and the drawn ground under it when it was last seated (a crater dug after it re-seats it). */
  wreckAt: number | null; wreckX: number; wreckY: number; wreckZ: number; wreckGround: number;
  /** (aircraft-solid-277) the sim's wreck record this wreck was posed by (null: posed by the same law locally, until the
   *  record arrives), whether a view has listed it, its tear, and the scorch its damage state shows. */
  wreckRecord: AircraftWreck | null; wreckListed: boolean; tear: AirframeTear | null; soot: number }

const R = AIR_SUPPORT_RULES;
/** (air-crash-he-276; the owner: "plane wrecks and so on should leave the biggest craters and actual wrecks") A crashed
 *  airframe stays where it came down, nosed into its crater and burning, for the sim's wreck life, at most its cap at once
 *  (aircraft-solid-277: the wreck is the sim's solid, sim/airframeVolumes.ts; drawn where its record lies). */
const WRECK_S = AIR_CRASH_RULES.wreck.lifeS;
const WRECK_MAX = AIR_CRASH_RULES.wreck.max;
/** A wreck's smoke: thick at first, thinning to a smoulder over the wreck's time. */
const WRECK_SMOKE_EVERY_S = 0.18;
/** A struck aircraft's scorch by its damage state: past a third of its hit points lost, and past two thirds. */
const DAMAGE_SOOT = [0, 0.35, 0.7] as const;

/** The wreck's tear in its airframe's frame, from the sim's break (sim/airframeVolumes.ts wreckBoxes: the same cut). */
function tearOf(kind: PublicStrike['kind'], id: number): AirframeTear {
  const boxes = AIRFRAME_BOXES[airframeOf(kind)], brk = wreckBreak(id);
  const wing = boxes.find((b) => b.role === 'wing')!.b, body = boxes.find((b) => b.role === 'fuselage')!.b;
  const half = Math.max(-wing[0], wing[3]), length = body[5] - body[2];
  const noseZ = body[5] - length * brk.noseFrac;
  return { wing: brk.wing, tearX: half * brk.tipFrac, bodyHalfX: Math.max(-body[0], body[3]), tipZ: body[5], noseZ, crumpleFromZ: noseZ - 1 };
}
/** The standable tops a wreck may rest on reach this far above where it came down (m): a hull's step-up. */
const WRECK_CEILING_M = SUPPORT_STEP_UP_M;

/**
 * The lowest drawn point of `body` against the ground under it: min over its drawn vertices of (y - ground(x, z)). Every
 * vertex, once per seat (a few thousand; a seat is rare), so the lowest is exact on any attitude. Exported for the receipt.
 */
export function lowestGap(body: THREE.Object3D, ground: (x: number, z: number, ceiling?: number) => number, ceiling?: number): number {
  body.updateMatrixWorld(true);
  let gap = Infinity;
  body.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    const position = mesh.isMesh ? mesh.geometry?.attributes?.position : null;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      _v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const g = _v.y - ground(_v.x, _v.z, ceiling);
      if (g < gap) gap = g;
    }
  });
  return gap;
}

export function createAirSupportWorld(root: THREE.Object3D, options: AirSupportWorldOptions) {
  const crafts = new Map<number, Craft>();
  const hooks = { setup: (m: THREE.Material) => options.setupMaterial?.(m), release: (m: THREE.Material) => options.releaseMaterial?.(m) };
  // the frame's marks, from a fixed pool (no allocation a frame): `markCount` of them are live
  const marks: StrikeMark[] = Array.from({ length: STRIKE_MARK_MAX }, () => ({ x: 0, y: 0, z: 0, shape: 'circle' as StrikeMarkShape,
    sizeA: 0, sizeB: 0, heading: 0, r: 0, g: 0, b: 0, urgency: 0 }));
  let markCount = 0;
  function pushMark(x: number, y: number, z: number, shape: StrikeMarkShape, heading: number, sizeA: number, sizeB: number,
    colour: THREE.Color, urgency: number): void {
    if (markCount >= marks.length) return;
    const m = marks[markCount++]!;
    m.x = x; m.y = y; m.z = z; m.shape = shape; m.heading = heading; m.sizeA = sizeA; m.sizeB = sizeB;
    m.r = colour.r; m.g = colour.g; m.b = colour.b; m.urgency = urgency;
  }
  const pose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  const own = new THREE.Color(), enemy = new THREE.Color(), aimColour = new THREE.Color();
  // the presentation's clock: the record's mode time, advanced between snapshots by the frame's own time
  let lastNow = -1, baseS = 0, sinceS = 0, lastTimeS = 0;

  function craftFor(strike: PublicStrike): Craft {
    let craft = crafts.get(strike.id);
    if (craft) return craft;
    if (strike.kind === 'gunship') {
      const anchor = new THREE.Group();
      anchor.name = `air-support gunship ${strike.id}`;
      root.add(anchor);
      craft = { kind: 'gunship', root: anchor, jet: null, fighter: null, seen: true, streaks: createAircraftStreaks(root, 'gunship', anchor.name), dropped: null, smokedAt: -Infinity, crashed: false, wreckAt: null, wreckX: 0, wreckY: 0, wreckZ: 0, wreckGround: 0, wreckRecord: null, wreckListed: false, tear: null, soot: 0 };
    } else if (strike.kind === 'bomb' || strike.kind === 'missile') {
      // the fighter: the bomber carries its two GBU-12s (it drops the port one), the Maverick run its four missiles
      const fighter = buildFighterJetAirframe(hooks);
      fighter.root.name = `air-support fighter ${strike.id}`;
      for (const bomb of fighter.bombs) bomb.visible = strike.kind === 'bomb';
      for (const missile of fighter.missiles) missile.visible = strike.kind === 'missile';
      root.add(fighter.root);
      craft = { kind: 'jet', root: fighter.root, jet: null, fighter, seen: true, streaks: createAircraftStreaks(root, 'fighter', fighter.root.name), dropped: null, smokedAt: -Infinity, crashed: false, wreckAt: null, wreckX: 0, wreckY: 0, wreckZ: 0, wreckGround: 0, wreckRecord: null, wreckListed: false, tear: null, soot: 0 };
    } else {
      const jet = buildStrikeJetAirframe(hooks);
      jet.root.name = `air-support jet ${strike.id}`;
      // the recon jet and the strafer carry no bombs
      for (const bomb of jet.bombs) bomb.visible = false;
      root.add(jet.root);
      craft = { kind: 'jet', root: jet.root, jet, fighter: null, seen: true, streaks: createAircraftStreaks(root, 'strike', jet.root.name), dropped: null, smokedAt: -Infinity, crashed: false, wreckAt: null, wreckX: 0, wreckY: 0, wreckZ: 0, wreckGround: 0, wreckRecord: null, wreckListed: false, tear: null, soot: 0 };
    }
    crafts.set(strike.id, craft);
    return craft;
  }

  function release(id: number, craft: Craft): void {
    craft.dropped?.removeFromParent();
    craft.streaks.dispose();
    if (craft.jet) craft.jet.dispose();
    else if (craft.fighter) craft.fighter.dispose();
    else { hideGunshipVisual(craft.root); craft.root.removeFromParent(); }
    crafts.delete(id);
  }

  /** A footprint's mark: the lane (a recon pass's track), the orbit ring, or the circle (an ellipse when it has an across
   *  semi-axis: the bomb's, its long axis along the heading). */
  function pushFootprint(footprint: StrikeFootprint, track: boolean, aim: boolean, x: number, y: number, z: number, heading: number,
    colour: THREE.Color, urgency: number): void {
    const base = footprint.shape === 'lane' ? (track ? 'track' : 'lane') : footprint.shape === 'orbit' ? 'orbit' : 'circle';
    const shape = aim ? AIM_SHAPE[base] : base;
    if (footprint.shape === 'lane') pushMark(x, y, z, shape, heading, footprint.halfLengthM, footprint.halfWidthM, colour, urgency);
    else if (footprint.shape === 'ellipse') pushMark(x, y, z, shape, heading, footprint.alongM, footprint.acrossM, colour, urgency);
    else pushMark(x, y, z, shape, heading, footprint.radiusM, 0, colour, urgency);
  }

  /**
   * The bomb leaves the jet's port pylon at its release (the run's: strikeRuns.ts) and falls on its own arc: the launch
   * the authority announced (airSupportBridge.ts releasedBombs: its pylon point and velocity), else the run's release
   * point and the jet's velocity there; gone at the ground, where its burst is.
   */
  function dropBomb(strike: PublicStrike, craft: Craft, t: number): void {
    const releaseS = strike.landsS + bombReleaseOffsetS(R);
    // the port GBU-12 (sim/strikeRuns.ts FIGHTER_BOMB_PYLON: the run's release point)
    const onPylon = craft.fighter!.bombs[0]!;
    if (t < releaseS) { onPylon.visible = true; craft.dropped && (craft.dropped.visible = false); return; }
    onPylon.visible = false;
    if (!craft.dropped) {
      craft.dropped = onPylon.clone();
      craft.dropped.name = `air-support bomb ${strike.id}`;
      root.add(craft.dropped);
    }
    const launch = releasedBombs.get(strike.id);
    if (launch) { _b0.set(launch.x, launch.y, launch.z); _bv.set(launch.vx, launch.vy, launch.vz); }
    else {
      runMuzzle(runPose(R, strike, releaseS, _bombPose), 'bomb', _b0);
      runVelocity(R, strike, releaseS, _bv);
    }
    // the authority's round left in the first step at or after the release (one step at most later)
    const tau = t - releaseS;
    const y = _b0.y + _bv.y * tau - 0.5 * BOMB_GRAVITY_MPS2 * tau * tau;
    const vy = _bv.y - BOMB_GRAVITY_MPS2 * tau;
    const falling = y > strike.y - 1 && t < strike.landsS + R.fallMarginS + 0.1;
    craft.dropped.visible = falling;
    if (!falling) return;
    craft.dropped.position.set(_b0.x + _bv.x * tau, y, _b0.z + _bv.z * tau);
    // nose along its velocity (the bomb's +Z), its fins behind
    craft.dropped.rotation.set(-Math.atan2(vy, Math.hypot(_bv.x, _bv.z)), Math.atan2(_bv.x, _bv.z), 0, 'YXZ');
  }

  /** A downed aircraft: rolling and nosing over, on the arc its crash round flies (sim/strikeRuns.ts crashFall: the
   *  authority bursts it where the arc meets the world); false once it is down (its last pose is where it met the
   *  ground, or where its crash round met a roof or a wall: airSupportBridge.ts crashedStrikes). */
  const _fall = { x: 0, y: 0, z: 0 };
  function fallPose(strike: PublicStrike, t: number): boolean {
    const downedS = strike.downedS!;
    runPose(R, strike, downedS, pose);
    const dt = Math.max(0, t - downedS);
    crashFall(R, strike, downedS, t, _fall);
    pose.x = _fall.x; pose.y = _fall.y; pose.z = _fall.z;
    pose.bank += dt * 1.4;
    // the nose drops toward its fall (never past straight down)
    pose.pitch = Math.max(-1.4, pose.pitch - dt * 0.35);
    if (crashedStrikes.has(strike.id)) return false;
    const ground = options.groundHeight?.(pose.x, pose.z) ?? strike.y;
    if (pose.y <= ground + 1) { pose.y = ground; return false; }
    return dt < 12;
  }

  /** The airframe comes to rest where it crashed, as the sim lays its wreck (sim/airframeVolumes.ts: one law, so the drawn
   *  wreck is the solid the hulls meet): nosed down into its crater, on its belly or its back as its roll left it, its
   *  lowest point over the crash point at the crater's heart; burned and torn (its wing short at its tear, its nose
   *  crumpled), its markings still its side's; then seated on the drawn ground (seatWreck). Posed by the sim's record once
   *  the view carries it (placeWreck). */
  function settleWreck(strike: PublicStrike, craft: Craft, t: number, record: AircraftWreck | null): void {
    craft.streaks.hide();
    craft.wreckAt = t; craft.wreckX = pose.x; craft.wreckY = pose.y; craft.wreckZ = pose.z;
    if (craft.dropped) craft.dropped.visible = false;
    craft.tear = tearOf(strike.kind, strike.id);
    const body = wreckBody(craft);
    if (body) weatherAirframe(body, 1, craft.tear);
    if (record) placeWreck(craft, record);
    else {
      // the sim's law where the record has not arrived yet (a networked client's next snapshot)
      const local = _local;
      local.id = strike.id; local.kind = strike.kind;
      wreckAttitude(R, strike, strike.downedS ?? t, t, local);
      seatWreckFrame(airframeOf(strike.kind), wreckBreak(strike.id), local, pose.x,
        options.groundHeight?.(pose.x, pose.z, pose.y + WRECK_CEILING_M) ?? pose.y, pose.z, local);
      poseWreck(craft, local);
    }
    // the oldest wrecks go first past WRECK_MAX
    let wrecks = 0, oldestId = -1, oldestAt = Infinity;
    for (const [id, other] of crafts) {
      if (other.wreckAt == null) continue;
      wrecks++;
      if (other.wreckAt < oldestAt) { oldestAt = other.wreckAt; oldestId = id; }
    }
    if (wrecks > WRECK_MAX && oldestId >= 0) release(oldestId, crafts.get(oldestId)!);
  }
  const _local: AircraftWreck = { id: 0, kind: 'strafe', team: 'alpha', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, atS: 0, untilS: 0 };

  /** The wreck's frame at a wreck pose, then seated on the drawn ground. */
  function poseWreck(craft: Craft, wreck: AircraftWreck): void {
    if (craft.kind === 'gunship') {
      _p.set(wreck.x, wreck.y, wreck.z);
      syncGunshipVisual(craft.root, _p, wreck.yaw, 0, true, null, wreck.bank, wreck.pitch);
    } else {
      craft.root.position.set(wreck.x, wreck.y, wreck.z);
      craft.root.rotation.set(-wreck.pitch, wreck.yaw, wreck.bank, 'YXZ');
    }
    craft.wreckX = wreck.x; craft.wreckZ = wreck.z;
    seatWreck(craft);
  }

  /** The sim's record of the wreck: posed where it lies (once; it never moves). */
  function placeWreck(craft: Craft, record: AircraftWreck): void {
    if (craft.wreckRecord && craft.wreckRecord.atS === record.atS && craft.wreckRecord.x === record.x) return;
    craft.wreckRecord = record;
    poseWreck(craft, record);
  }

  /** The wreck's drawn airframe: the gunship's model (gunshipVisual.ts keeps it beside its anchor), else the jet's root. */
  function wreckBody(craft: Craft): THREE.Object3D | null {
    return craft.kind === 'gunship' ? gunshipModelRoot(craft.root) : craft.root;
  }

  /** Seats a wreck as a hull's running gear is seated (the same drawn ground, the battle's vehicle ground sampler): its
   *  lowest drawn point on the ground under that point, the standable tops admitted up to just above where it came down
   *  (a roof it crashed on holds it; the floors above do not). Moves the body up or down by the one gap. */
  function seatWreck(craft: Craft): void {
    const body = wreckBody(craft), ground = options.groundHeight;
    craft.wreckGround = ground?.(craft.wreckX, craft.wreckZ, craft.wreckY + WRECK_CEILING_M) ?? craft.wreckY;
    if (!body || !ground) return;
    const gap = lowestGap(body, ground, craft.wreckY + WRECK_CEILING_M);
    if (Number.isFinite(gap)) { body.position.y -= gap; body.updateMatrixWorld(true); }
  }

  /** A wreck burns: its smoke thinning over WRECK_S; true while it stands. A crater dug under it (its own crash's,
   *  raised a frame after it came down, or a later shell's) re-seats it. */
  function burnWreck(craft: Craft, t: number): boolean {
    const age = t - craft.wreckAt!;
    if (age > WRECK_S || age < 0) return false;
    // (aircraft-solid-277) the sim's wreck: gone with its record (its life out, or the oldest past the cap)
    const under = options.groundHeight?.(craft.wreckX, craft.wreckZ, craft.wreckY + WRECK_CEILING_M);
    if (under != null && Math.abs(under - craft.wreckGround) > 0.005) seatWreck(craft);
    if (t - craft.smokedAt >= WRECK_SMOKE_EVERY_S) {
      craft.smokedAt = t;
      options.aircraftFx?.smoke(craft.wreckX, craft.wreckY + 1.2, craft.wreckZ, Math.max(0.2, 1 - age / WRECK_S));
    }
    return true;
  }

  /** A struck aircraft's smoke (thicker the less of it is left, a fire's once it falls), and its burst at the ground. */
  function damageFx(strike: PublicStrike, craft: Craft, t: number, falling: boolean): void {
    const fxPort = options.aircraftFx;
    if (!fxPort) return;
    const hurt = strike.maxHp > 0 ? 1 - strike.hp / strike.maxHp : 0;
    if (strike.downedS == null && hurt <= 0.01) return;
    if (!falling) {
      if (!craft.crashed) { craft.crashed = true; fxPort.crash(pose.x, pose.y, pose.z); }
      return;
    }
    // a puff every 1/12 s (1/20 s falling): the trail a moving airframe leaves is the puffs' spacing
    if (t - craft.smokedAt < (strike.downedS != null ? 0.05 : 0.085)) return;
    craft.smokedAt = t;
    fxPort.smoke(pose.x, pose.y, pose.z, strike.downedS != null ? 1 : Math.min(1, 0.25 + hurt));
  }

  /** (aircraft-solid-277) A struck aircraft's damage state: its skin scorched more the less of it is left. */
  function sootOf(strike: PublicStrike): number {
    const hurt = strike.maxHp > 0 ? 1 - strike.hp / strike.maxHp : 0;
    return strike.downedS != null || hurt >= 2 / 3 ? DAMAGE_SOOT[2] : hurt >= 1 / 3 ? DAMAGE_SOOT[1] : DAMAGE_SOOT[0];
  }

  /** (aircraft-solid-277) The rounds that struck this aircraft since the last frame (airSupportBridge.ts aircraftHits):
   *  each drawn on the airframe where it struck it, carried from the sim's pose at the hit to the drawn pose now (a
   *  networked viewer draws the aircraft a little behind its host), as sparks off the metal or a burst. */
  function strikeHits(strike: PublicStrike, craft: Craft): void {
    const fxPort = options.aircraftFx;
    if (!fxPort?.hit || !aircraftHits.length || !craft.root.visible) return;
    for (const hit of aircraftHits) {
      if (hit.strikeId !== strike.id) continue;
      runPose(R, strike, hit.atS, _hitPose);
      _hp.x = hit.x; _hp.y = hit.y; _hp.z = hit.z;
      toAirframe(_hitPose, _hp, _hl);
      fromAirframe(pose, _hl, _hp);
      // the face's normal, from the frame at the hit to the frame now
      _hp2.x = hit.nx; _hp2.y = hit.ny; _hp2.z = hit.nz;
      toAirframe({ x: 0, y: 0, z: 0, yaw: _hitPose.yaw, pitch: _hitPose.pitch, bank: _hitPose.bank }, _hp2, _hl);
      fromAirframeDir(pose, _hl, _hp2);
      fxPort.hit(_hp.x, _hp.y, _hp.z, _hp2.x, _hp2.y, _hp2.z, hit.caliberMm, hit.explosive);
    }
  }

  /** The Maverick run's missiles: each gone from its rack once its launch has come (sim/airSupportFire.ts launch order). */
  function launchMissiles(strike: PublicStrike, craft: Craft, t: number): void {
    const missiles = craft.fighter!.missiles;
    for (let k = 0; k < missiles.length; k++) {
      missiles[k]!.visible = k >= R.missile.missiles || t < strike.landsS + missileLaunchOffsetS(R, k);
    }
  }

  function aimMark(air: AirSupportView): void {
    if (!strikeView.open || strikeView.blend < 0.05) return;
    const footprint = runFootprint(R, strikeView.kind);
    // locked while the call is under way or taken (game/strikeOrder.ts); the reticle's colour: the side's own when the
    // authority would take the call, the contested amber when it would not
    const phase = strikeView.order.read(lastTimeS).phase;
    const locked = phase === 'sent' || phase === 'called';
    aimColour.set(sideColor(locked || !strikeCallBlocker(R, air, strikeView.kind, strikeView.rangeM) ? 'own' : 'contested'));
    pushFootprint(footprint, strikeView.kind === 'recon', true, strikeView.x, strikeView.y, strikeView.z, strikeView.heading,
      aimColour, locked ? 1 : 0.2);
  }

  /** A drawn aircraft at `pose` on its run at time `t` (the stores it still carries or has let go), its streaks and its
   *  markings (the airframe's team trim, airframeParts.ts) in `side`: the team colour its side shows everywhere else
   *  (sideColor own or enemy, the footprints' own). */
  function poseCraft(strike: PublicStrike, craft: Craft, t: number, side: THREE.Color): void {
    craft.root.visible = true;
    const viewer = options.viewerPosition?.();
    const eye = viewer ? _eye.set(viewer.x, viewer.y, viewer.z) : null;
    if (craft.kind === 'gunship') {
      _p.set(pose.x, pose.y, pose.z);
      // banked into its pylon turn (the run's bank: the left wing down on the mark)
      syncGunshipVisual(craft.root, _p, pose.yaw, 1 / 60, true, eye, pose.bank, pose.pitch);
      const model = gunshipModelRoot(craft.root);
      if (model) { paintTeamTrim(model, side); weatherAirframe(model, sootOf(strike)); craft.streaks.update(model, t, side, eye); }
      else craft.streaks.hide();
      return;
    }
    craft.root.position.set(pose.x, pose.y, pose.z);
    // the jet's attitude from its run: its heading, its climb or dive (nose up positive; three.js pitches nose down
    // for a positive x) and its bank in the turns
    craft.root.rotation.set(-pose.pitch, pose.yaw, pose.bank, 'YXZ');
    paintTeamTrim(craft.root, side);
    weatherAirframe(craft.root, sootOf(strike));
    craft.streaks.update(craft.root, t, side, eye);
    // a jet downed before its release keeps what it had not let go (the authority released nothing after it fell)
    const storeT = strike.downedS != null ? Math.min(t, strike.downedS) : t;
    if (strike.kind === 'bomb' && craft.fighter && (strike.downedS == null || strike.downedS > strike.landsS + bombReleaseOffsetS(R))) dropBomb(strike, craft, t);
    if (strike.kind === 'missile' && craft.fighter) launchMissiles(strike, craft, storeT);
  }

  /**
   * (killcam-strike-shot-276) A kill cam replay of an airstrike is on screen (killcamStage.ts): only its strike's
   * aircraft is drawn, flown from its record at the replay's clock, with its footprint; every live aircraft is hidden
   * (kept, not released: the battle's frame takes them back when the replay leaves).
   */
  function updateReplay(staged: NonNullable<typeof killcamStage.strike>, t: number): void {
    markCount = 0;
    for (const [id, craft] of crafts) {
      // (the gunship's airframe is the anchor's sibling: gunshipVisual.ts hides it)
      if (craft.kind === 'gunship') hideGunshipVisual(craft.root); else craft.root.visible = false;
      // (the replayed strike's own streaks carry on: it is posed below)
      if (id !== staged.id) craft.streaks.hide();
      if (craft.dropped) craft.dropped.visible = false;
    }
    const strike = staged as PublicStrike;
    pushFootprint(runFootprint(R, staged.kind), staged.kind === 'recon', false, staged.x, staged.y, staged.z, staged.heading,
      enemy.set(sideColor('enemy')), 1);
    if (airStrikeFlies(staged.kind) && t >= staged.calledS && t < runExitS(R, staged)) {
      runPose(R, staged, t, pose);
      poseCraft(strike, craftFor(strike), t, enemy);
    } else crafts.get(staged.id)?.streaks.hide();
    if (markCount) setStrikeMarks(marks, t, markCount); else clearStrikeMarks();
  }

  function update(air: AirSupportView | null | undefined, perspective: 'alpha' | 'bravo', timeS: number): void {
    if (!air) {
      for (const [id, craft] of crafts) release(id, craft);
      clearStrikeMarks();
      return;
    }
    if (killcamStage.strike) { updateReplay(killcamStage.strike, killcamStage.strikeTimeS); return; }
    if (air.nowS !== lastNow) { lastNow = air.nowS; baseS = air.nowS; sinceS = 0; }
    else sinceS = Math.min(0.25, sinceS + Math.max(0, timeS - lastTimeS));
    lastTimeS = timeS;
    const t = baseS + sinceS;
    own.set(sideColor('own')); enemy.set(sideColor('enemy'));
    markCount = 0;
    for (const craft of crafts.values()) craft.seen = false;
    for (const strike of air.strikes) {
      const mine = strike.team === perspective;
      // the footprint: public until its danger is past (the minimap's derivation keeps the same rule)
      if (strike.downedS == null && t < strike.landsS + Math.max(1, strikeDangerS(R, strike.kind))) {
        const warning = R[strike.kind].warningS;
        pushFootprint(runFootprint(R, strike.kind), strike.kind === 'recon', false, strike.x, strike.y, strike.z, strike.heading,
          mine ? own : enemy, Math.max(0, Math.min(1, 1 - (strike.landsS - t) / warning)));
      }
      if (!airStrikeFlies(strike.kind) || t < strike.calledS) continue;
      // the aircraft flies its whole run out (its egress beyond the strike's end), or falls
      const wrecked = crafts.get(strike.id);
      if (wrecked?.wreckAt != null) continue;
      const flying = strike.downedS == null ? t < runExitS(R, strike) : fallPose(strike, t);
      if (!flying) {
        // its burst where it met the ground, once (fallPose left its pose there), and its wreck stays there
        const fallen = strike.downedS != null ? crafts.get(strike.id) : undefined;
        if (fallen) { damageFx(strike, fallen, t, false); settleWreck(strike, fallen, t, wreckRecordOf(air, strike.id)); }
        continue;
      }
      if (strike.downedS == null) runPose(R, strike, t, pose);
      const craft = craftFor(strike);
      craft.seen = true;
      damageFx(strike, craft, t, true);
      poseCraft(strike, craft, t, mine ? own : enemy);
      strikeHits(strike, craft);
    }
    // a wreck burns where it came down (its record may be gone); an aircraft no record holds any more is gone
    for (const [id, craft] of crafts) {
      if (craft.wreckAt != null) {
        const record = wreckRecordOf(air, id);
        if (record) { craft.wreckListed = true; placeWreck(craft, record); }
        // a wreck the sim no longer lists (its life out, or past the cap) is gone; one it has not listed yet stands
        if ((craft.wreckListed && !record) || !burnWreck(craft, t)) release(id, craft);
        continue;
      }
      if (!craft.seen) release(id, craft);
    }
    aircraftHits.length = 0;
    aimMark(air);
    if (markCount) setStrikeMarks(marks, t, markCount); else clearStrikeMarks();
  }

  return {
    update,
    dispose(): void { for (const [id, craft] of crafts) release(id, craft); clearStrikeMarks(); },
  };
}
/** The sim's wreck record of strike `id` in the view (null: not listed). */
function wreckRecordOf(air: AirSupportView, id: number): AircraftWreck | null {
  const list = air.wrecks;
  if (!list) return null;
  for (const wreck of list) if (wreck.id === id) return wreck;
  return null;
}
const _hitPose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
const _hp = { x: 0, y: 0, z: 0 }, _hp2 = { x: 0, y: 0, z: 0 }, _hl = { x: 0, y: 0, z: 0 };
const AIM_SHAPE = Object.freeze({ circle: 'aim-circle', lane: 'aim-lane', orbit: 'aim-orbit', track: 'aim-track' } as const);
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _eye = new THREE.Vector3(), _b0 = new THREE.Vector3(), _bv = new THREE.Vector3();
const _bombPose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
