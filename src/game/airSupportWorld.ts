/**
 * airSupportWorld.ts — Air Support over the battlefield (air-support-270): every call-in's aircraft, flown from its public
 * record (sim/strikeRuns.ts runPose: the same run the authority fires its rounds from and tests hits against, so what a
 * crew sees is what it shoots, and the footprint is drawn from that same run), and every footprint and the crew's own aiming reticle painted on the ground (engine/strikeMarks.ts: a term of
 * the aerial post pass, fixed cost, on the terrain, the roofs and the walls alike).
 *
 * The strike jet (strikeJetAirframe.ts) flies the recon pass, the strafing run and the bomb; the AC-130 orbit is the
 * gunship's own airframe (gunshipVisual.ts, its props turning, banked into the pylon turn). A downed aircraft rolls and
 * falls along its last heading and is gone at the ground. Part of the mode world's chunk (matchModeWorldPresentation.ts):
 * the Garage and the other modes never load it. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';
import { AIR_SUPPORT_RULES, airStrikeFlies } from '../sim/matchRuleset.ts';
import { strikeDangerS } from '../sim/airSupport.ts';
import type { AirSupportView } from '../sim/airSupport.ts';
import { BOMB_GRAVITY_MPS2, bombReleaseOffsetS, runExitS, runFootprint, runMuzzle, runPose, runVelocity,
  type RunPose, type StrikeFootprint } from '../sim/strikeRuns.ts';
import { releasedBombs } from './airSupportBridge.ts';
import { buildStrikeJetAirframe, type BuiltStrikeJet } from './strikeJetAirframe.ts';
import { hideGunshipVisual, syncGunshipVisual } from './gunshipVisual.ts';
import { STRIKE_MARK_MAX, clearStrikeMarks, setStrikeMarks, type StrikeMark, type StrikeMarkShape } from '../engine/strikeMarks.ts';
import { sideColor } from '../ui/objectiveGlyphs.ts';
import { strikeView } from './strikeViewState.ts';
import { strikeCallBlocker } from './strikeOrder.ts';

interface AirSupportWorldOptions {
  viewerPosition?: () => { x: number; y: number; z: number } | null;
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

type PublicStrike = AirSupportView['strikes'][number];
interface Craft { kind: 'jet' | 'gunship'; root: THREE.Object3D; jet: BuiltStrikeJet | null; seen: boolean;
  /** The bomb once it has left the jet's pylon: falling in the world on its own arc. */
  dropped: THREE.Object3D | null }

const R = AIR_SUPPORT_RULES;
const G = 9.81;

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
      craft = { kind: 'gunship', root: anchor, jet: null, seen: true, dropped: null };
    } else {
      const jet = buildStrikeJetAirframe(hooks);
      jet.root.name = `air-support jet ${strike.id}`;
      // the recon jet and the strafer carry no bombs; the bomber drops its port one at the release
      for (const bomb of jet.bombs) bomb.visible = strike.kind === 'bomb';
      root.add(jet.root);
      craft = { kind: 'jet', root: jet.root, jet, seen: true, dropped: null };
    }
    crafts.set(strike.id, craft);
    return craft;
  }

  function release(id: number, craft: Craft): void {
    craft.dropped?.removeFromParent();
    if (craft.jet) craft.jet.dispose();
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
    const onPylon = craft.jet!.bombs[1]!;
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

  /** A downed aircraft: rolling and nosing over along its last heading, falling under gravity; null once it is down. */
  function fallPose(strike: PublicStrike, t: number): boolean {
    const downedS = strike.downedS!;
    runPose(R, strike, downedS, pose);
    const dt = t - downedS;
    const speed = strike.kind === 'gunship' ? R.gunship.speedMps : R[strike.kind].speedMps;
    pose.x += Math.sin(pose.yaw) * speed * dt;
    pose.z += Math.cos(pose.yaw) * speed * dt;
    pose.y -= 0.5 * G * dt * dt + 6 * dt;
    pose.bank += dt * 1.4;
    return pose.y > strike.y - 2 && dt < 9;
  }

  function aimMark(air: AirSupportView): void {
    if (!strikeView.open || strikeView.blend < 0.05) return;
    const footprint = runFootprint(R, strikeView.kind);
    // locked while the call is under way or taken (game/strikeOrder.ts); the reticle's colour: the side's own when the
    // authority would take the call, the contested amber when it would not
    const phase = strikeView.order.read(lastTimeS).phase;
    const locked = phase === 'sent' || phase === 'called';
    aimColour.set(sideColor(locked || !strikeCallBlocker(air, strikeView.kind, strikeView.rangeM) ? 'own' : 'contested'));
    pushFootprint(footprint, strikeView.kind === 'recon', true, strikeView.x, strikeView.y, strikeView.z, strikeView.heading,
      aimColour, locked ? 1 : 0.2);
  }

  function update(air: AirSupportView | null | undefined, perspective: 'alpha' | 'bravo', timeS: number): void {
    if (!air) {
      for (const [id, craft] of crafts) release(id, craft);
      clearStrikeMarks();
      return;
    }
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
      const flying = strike.downedS == null ? t < runExitS(R, strike) : fallPose(strike, t);
      if (!flying) continue;
      if (strike.downedS == null) runPose(R, strike, t, pose);
      const craft = craftFor(strike);
      craft.seen = true;
      if (craft.kind === 'gunship') {
        _p.set(pose.x, pose.y, pose.z);
        const eye = options.viewerPosition?.();
        // banked into its pylon turn (the run's bank: the left wing down on the mark)
        syncGunshipVisual(craft.root, _p, pose.yaw, 1 / 60, true, eye ? _eye.set(eye.x, eye.y, eye.z) : null, pose.bank, pose.pitch);
      } else {
        craft.root.position.set(pose.x, pose.y, pose.z);
        // the jet's attitude from its run: its heading, its climb or dive (nose up positive; three.js pitches nose down
        // for a positive x) and its bank in the turns
        craft.root.rotation.set(-pose.pitch, pose.yaw, pose.bank, 'YXZ');
        if (strike.kind === 'bomb' && craft.jet) dropBomb(strike, craft, t);
      }
    }
    for (const [id, craft] of crafts) if (!craft.seen) release(id, craft);
    aimMark(air);
    if (markCount) setStrikeMarks(marks, t, markCount); else clearStrikeMarks();
  }

  return {
    update,
    dispose(): void { for (const [id, craft] of crafts) release(id, craft); clearStrikeMarks(); },
  };
}
const AIM_SHAPE = Object.freeze({ circle: 'aim-circle', lane: 'aim-lane', orbit: 'aim-orbit', track: 'aim-track' } as const);
const _p = new THREE.Vector3(), _eye = new THREE.Vector3(), _b0 = new THREE.Vector3(), _bv = new THREE.Vector3();
const _bombPose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
