// Shared browser acquisition for resource and frame comparisons. These
// functions must remain standalone: Puppeteer/agent-browser serialize them.
export const PINNED_SCENE = Object.freeze({
  protocol: 'm1a2-fixed-roster-v1',
  storageKey: 'cot.lastTank.v1',
  playerSpecId: 'm1a2',
  roster: Object.freeze([
    'm1a2', 'm1a3', 'm1a1', 'm1a1ha',
    'm1a2_tusk', 'm1a2_sepv2', 'm1a2_sepv3', 'abramsx',
  ]),
});

/** Install with evaluateOnNewDocument BEFORE navigation, not after hero bake. */
export function primePinnedSceneStorage(specification) {
  globalThis.localStorage.setItem(specification.storageKey, specification.playerSpecId);
}

/** Call after __DEBUG readiness and before the first __SHOTS.set. */
export function configurePinnedScene(specification) {
  const D = window.__DEBUG;
  if (!D?.flags || D.selectedSpecId !== specification.playerSpecId) {
    throw new Error('Pinned scene boot selection unavailable or mismatched');
  }
  D.flags.forceRoster = [...specification.roster];
  D.flags.rosterExact = true;
}

/** Actual entity order, teams and visual identity; no retained scene handles. */
export function capturePinnedScene(specification) {
  const D = window.__DEBUG;
  const game = D?.game;
  if (!game?.player || !Array.isArray(game.tanks)) throw new Error('Pinned scene roster unavailable');
  const receipt = {
    protocol: specification.protocol,
    selectedSpecId: D.selectedSpecId,
    playerEntityId: game.player.id,
    playerSpecId: game.player.specId,
    entities: game.tanks.map(entity => ({
      entityId: entity.id, team: entity.team, specId: entity.specId,
      isPlayer: entity.isPlayer, visualSpecId: entity.visual?.specId ?? null,
    })),
  };
  const expected = {
    protocol: specification.protocol,
    selectedSpecId: specification.playerSpecId,
    playerEntityId: specification.playerSpecId,
    playerSpecId: specification.playerSpecId,
    entities: specification.roster.map((specId, index) => ({
      entityId: specId, team: index < 4 ? 'player' : 'enemy', specId,
      isPlayer: index === 0, visualSpecId: specId,
    })),
  };
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) {
    throw new Error(`Pinned scene identity mismatch: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

function entityMatches(entity, specId, index) {
  return entity?.entityId === specId && entity.specId === specId
    && entity.visualSpecId === specId && entity.isPlayer === (index === 0)
    && entity.team === (index < 4 ? 'player' : 'enemy');
}

/** Validate against the fixed contract, never expectations copied from a report. */
export function isPinnedSceneReceipt(receipt) {
  return receipt?.protocol === PINNED_SCENE.protocol
    && receipt.selectedSpecId === PINNED_SCENE.playerSpecId
    && receipt.playerEntityId === PINNED_SCENE.playerSpecId
    && receipt.playerSpecId === PINNED_SCENE.playerSpecId
    && Array.isArray(receipt.entities) && receipt.entities.length === PINNED_SCENE.roster.length
    && receipt.entities.every((entity, index) => entityMatches(entity, PINNED_SCENE.roster[index], index));
}
