/**
 * blackWorldGuardInstall.ts — the browser wiring of the black-world guard (blackWorldGuard.ts): the entry telemetry's
 * error path for the one record an incident sends and the battle entry's cover. The
 * battle entries (the solo deployment, the network reveal) import this chunk under their cover and arm the guard there:
 * it then resets the temporal histories before the reveal and snapshots the revealed state on the first battle frame.
 */
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { getEntryTelemetry } from '../entry/telemetry.ts';
import { resolvePresetName } from './quality.ts';
import { installBlackWorldGuard, type BlackWorldGuard, type BlackWorldGuardPorts, type GuardPost } from './blackWorldGuard.ts';
import { activeWorld, isBattlefieldRoot } from '../world/activeWorld.ts';
import { currentBattleScope } from '../game/battleScope.ts';

export interface BlackWorldGuardArming {
  renderer: unknown;
  scene: Scene;
  camera: unknown;
  post: unknown;
  game: BlackWorldGuardPorts['game'];
  /** The battle entry lifecycle (battleEntryLifecycle.ts): pending while an entry runs, renderingCovered under its cover. */
  lifecycle?: { readonly pending?: boolean; readonly renderingCovered?: boolean } | null;
  combatWarm?: unknown;
}

/** Install (or re-port) the guard and start a covered entry: fresh histories, a new reveal snapshot. */
export function armBlackWorldGuard(arming: BlackWorldGuardArming): BlackWorldGuard | null {
  const post = arming.post as Partial<GuardPost> | null | undefined;
  // a post runtime without the scene pass the guard watches (a test double, a Studio stand-in) is left alone
  if (!post?.sceneAA?.sceneTarget || typeof post.render !== 'function') return null;
  const renderer = arming.renderer as WebGLRenderer;
  const camera = arming.camera as PerspectiveCamera;
  const lifecycle = arming.lifecycle ?? null;
  const guard = installBlackWorldGuard({
    renderer,
    scene: arming.scene,
    camera,
    post: post as GuardPost,
    game: arming.game,
    // (mp-fixes-277) the battlefield from its one owner (src/world/activeWorld.ts), for every entry alike: the network
    // round armed this with no world port, and the old fallback (the first scene child named world-*) tracked a hidden
    // battlefield the Garage had planned, whose heal drew two maps
    getWorld: activeWorld,
    isBattlefieldRoot,
    battleId: () => currentBattleScope()?.id ?? null,
    isCovered: () => !!lifecycle && (lifecycle.pending === true || lifecycle.renderingCovered === true),
    combatWarm: (arming.combatWarm ?? null) as BlackWorldGuardPorts['combatWarm'],
    // (round 2, eng D2: no graphics-recovery relief of its own any more; H4's context restore takes the renderer's own
    // loss path, one rung, once a page)
    presetName: resolvePresetName,
    report: (stage, message, code) => { getEntryTelemetry().error(stage, { message }, code); },
  });
  // (eng D6) a chunk that resolved after the reveal arms the guard without resetting the presented frame's histories
  const loader = typeof document !== 'undefined' ? document.querySelector('.cot-bl') : null;
  const covered = (!!lifecycle && (lifecycle.pending === true || lifecycle.renderingCovered === true))
    || !!loader?.classList.contains('on');
  guard.onCoveredEntry({ covered });
  return guard;
}
