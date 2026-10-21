// landmarkPlacement.test-support.mjs — every map's named set pieces stand in the world it ships (MAPS Lane A, 2026-10-17).
//
// 227's LOOKS pass found Jade River Delta's aat-chala temple missing from the game: the composer (compose.ts) refused it
// "solid structure", because the char village's corner shop twin (deltaVillage.ts, 2026-10-14) stood on its site, and
// only its brick court was laid. Nothing failed: the composer names every refusal in its receipt (props group
// userData.landmarks), but no receipt read it on the built maps, and landmarks.selftest.mjs's shard check ("a structure
// record within the piece's footprint") was met by the corner shop's own record.
//
// The check rides on a world build that already runs (the owner: "tests much shorter"): the collision drift receipt
// (server/collisionManifestDrift.selftest.mjs) rebuilds every map's base world in Node at the shards' seeds, and its
// capture tool (tools/capture-world-collision-manifests.mjs --check, COT_LANDMARK_PLACEMENT=1) reads the composer's
// receipt on that same build. tools/landmark-placement-check.mjs runs the same audit on both variants (base and
// assault-trenches) for a release gate.

/**
 * The set pieces a map's build refuses, allowed: { [mapId]: [[name, composer's reason, why it is allowed]] } (a key
 * `${mapId}@assault-trenches` names the trenches variant's own). Empty on 2026-10-17: the fleet-wide run found only Delta's
 * temple refused, and Delta's plan now vacates the corner shop twin's site for it (deltaVillage.ts).
 */
export const SKIPPED_ALLOWANCE = {};

/** Every authored piece has its receipt entry and stands, or is allowed; an allowance that no longer holds fails too. */
export function landmarkPlacementFailures(label, receipt, landmarks) {
  const failures = [];
  const mapId = label.replace(/@assault-trenches$/, '');
  if (!receipt) return { failures: ['the set-piece pass left no receipt'], placed: 0, skipped: 0 };
  const pieces = receipt.pieces ?? [];
  if ((receipt.placed ?? 0) + (receipt.skipped ?? 0) !== pieces.length) failures.push('a piece counted twice or not at all');
  for (const placement of landmarks) {
    const name = placement.name ?? null;
    if (!pieces.some((p) => p.kind === placement.kind && (p.name ?? null) === name && p.x === placement.x && p.z === placement.z)) {
      failures.push(`${name ?? placement.kind} has no receipt entry`);
    }
  }
  const allowed = SKIPPED_ALLOWANCE[label] ?? SKIPPED_ALLOWANCE[mapId] ?? [];
  for (const piece of pieces) {
    if (piece.status === 'placed') continue;
    if (!allowed.some(([name, reason]) => name === (piece.name ?? piece.kind) && reason === piece.reason)) {
      failures.push(`${piece.name ?? piece.kind} (${piece.kind}) at (${piece.x}, ${piece.z}) is refused: ${piece.reason}`);
    }
  }
  for (const [name, reason] of allowed) {
    if (!pieces.some((p) => (p.name ?? p.kind) === name && p.status === 'skipped' && p.reason === reason)) {
      failures.push(`the allowance for ${name} (${reason}) no longer holds`);
    }
  }
  return { failures, placed: receipt.placed ?? 0, skipped: receipt.skipped ?? 0 };
}
