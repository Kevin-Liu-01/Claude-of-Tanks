/**
 * airSupportWorld.ts — Air Support over the battlefield (air-support-270): every call-in's aircraft, flown from its public
 * record (sim/airSupport.ts aircraftPose: the same path the authority tests rounds against, so what a crew sees is what it
 * shoots), and every footprint and the crew's own aiming reticle painted on the ground (engine/strikeMarks.ts: a term of
 * the aerial post pass, fixed cost, on the terrain, the roofs and the walls alike).
 *
 * The strike jet (strikeJetAirframe.ts) flies the recon pass, the strafing run and the bomb; the AC-130 orbit is the
 * gunship's own airframe (gunshipVisual.ts, its props turning, banked into the pylon turn). A downed aircraft rolls and
 * falls along its last heading and is gone at the ground. Part of the mode world's chunk (matchModeWorldPresentation.ts):
 * the Garage and the other modes never load it. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';
import { AIR_SUPPORT_RULES, airStrikeFlies } from '../sim/matchRuleset.ts';
import { aircraftPose, strikeDangerS, strikeFootprint } from '../sim/airSupport.ts';
import type { AirSupportView } from '../sim/airSupport.ts';
import { buildStrikeJetAirframe, type BuiltStrikeJet } from './strikeJetAirframe.ts';
import { hideGunshipVisual, syncGunshipVisual } from './gunshipVisual.ts';
import { STRIKE_MARK_MAX, clearStrikeMarks, setStrikeMarks, type StrikeMark, type StrikeMarkShape } from '../engine/strikeMarks.ts';
import { sideColor } from '../ui/objectiveGlyphs.ts';
import { strikeView } from './strikeViewState.ts';

interface AirSupportWorldOptions {
  viewerPosition?: () => { x: number; y: number; z: number } | null;
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

type PublicStrike = AirSupportView['strikes'][number];
interface Craft { kind: 'jet' | 'gunship'; root: THREE.Object3D; jet: BuiltStrikeJet | null; seen: boolean }

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
  const pose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0 };
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
      craft = { kind: 'gunship', root: anchor, jet: null, seen: true };
    } else {
      const jet = buildStrikeJetAirframe(hooks);
      jet.root.name = `air-support jet ${strike.id}`;
      // the recon jet and the strafer carry no bombs; the bomber drops one at the release
      for (const bomb of jet.bombs) bomb.visible = strike.kind === 'bomb';
      root.add(jet.root);
      craft = { kind: 'jet', root: jet.root, jet, seen: true };
    }
    crafts.set(strike.id, craft);
    return craft;
  }

  function release(id: number, craft: Craft): void {
    if (craft.jet) craft.jet.dispose();
    else { hideGunshipVisual(craft.root); craft.root.removeFromParent(); }
    crafts.delete(id);
  }

  /** A downed aircraft: rolling and nosing over along its last heading, falling under gravity; null once it is down. */
  function fallPose(strike: PublicStrike, t: number): boolean {
    const downedS = strike.downedS!;
    aircraftPose(R, strike, downedS, pose);
    const dt = t - downedS;
    const speed = strike.kind === 'gunship' ? R.gunship.speedMps : R[strike.kind].speedMps;
    pose.x += Math.sin(pose.yaw) * speed * dt;
    pose.z += Math.cos(pose.yaw) * speed * dt;
    pose.y -= 0.5 * G * dt * dt + 6 * dt;
    pose.bank += dt * 1.4;
    return pose.y > strike.y - 2 && dt < 9;
  }

  function aimMark(): void {
    if (!strikeView.open || strikeView.blend < 0.05) return;
    const footprint = strikeFootprint(R, strikeView.kind);
    const shape: StrikeMarkShape = strikeView.kind === 'recon' ? 'aim-track' : footprint.shape === 'lane' ? 'aim-lane'
      : strikeView.kind === 'gunship' ? 'aim-orbit' : 'aim-circle';
    const locked = lastTimeS < strikeView.lockedUntilS;
    // the reticle's colour: the side's own when it can be called, the contested amber when it cannot
    aimColour.set(sideColor(strikeView.ready || locked ? 'own' : 'contested'));
    pushMark(strikeView.x, strikeView.y, strikeView.z, shape, strikeView.heading,
      footprint.shape === 'circle' ? footprint.radiusM : footprint.halfLengthM, footprint.shape === 'lane' ? footprint.halfWidthM : 0,
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
        const footprint = strikeFootprint(R, strike.kind);
        const colour = mine ? own : enemy;
        const shape: StrikeMarkShape = strike.kind === 'recon' ? 'track' : footprint.shape === 'lane' ? 'lane' : strike.kind === 'gunship' ? 'orbit' : 'circle';
        const warning = R[strike.kind].warningS;
        pushMark(strike.x, strike.y, strike.z, shape, strike.heading,
          footprint.shape === 'circle' ? footprint.radiusM : footprint.halfLengthM, footprint.shape === 'lane' ? footprint.halfWidthM : 0,
          colour, Math.max(0, Math.min(1, 1 - (strike.landsS - t) / warning)));
      }
      if (!airStrikeFlies(strike.kind) || t < strike.calledS) continue;
      const flying = strike.downedS == null ? t < strike.endS : fallPose(strike, t);
      if (!flying) continue;
      if (strike.downedS == null) aircraftPose(R, strike, t, pose);
      const craft = craftFor(strike);
      craft.seen = true;
      if (craft.kind === 'gunship') {
        _p.set(pose.x, pose.y, pose.z);
        const eye = options.viewerPosition?.();
        syncGunshipVisual(craft.root, _p, pose.yaw, 1 / 60, true, eye ? _eye.set(eye.x, eye.y, eye.z) : null);
      } else {
        craft.root.position.set(pose.x, pose.y, pose.z);
        // the jet's attitude: its heading, its dive (the strafe's 20 degrees) and its roll
        const pitch = strike.kind === 'strafe' && t >= strike.landsS && t <= strike.landsS + R.strafe.fireS ? 0.32 : 0;
        craft.root.rotation.set(pitch, pose.yaw, pose.bank, 'YXZ');
        // the bomb leaves its pylon at the release
        if (strike.kind === 'bomb' && craft.jet && t >= strike.landsS - R.bomb.fallS) craft.jet.bombs[0]!.visible = false;
      }
    }
    for (const [id, craft] of crafts) if (!craft.seen) release(id, craft);
    aimMark();
    if (markCount) setStrikeMarks(marks, t, markCount); else clearStrikeMarks();
  }

  return {
    update,
    dispose(): void { for (const [id, craft] of crafts) release(id, craft); clearStrikeMarks(); },
  };
}
const _p = new THREE.Vector3(), _eye = new THREE.Vector3();
