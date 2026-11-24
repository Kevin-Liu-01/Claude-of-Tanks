/**
 * The recording's state digest (replay-system-275, docs/REPLAY.md §1 "Checksums"): every fielded hull's pose and combat
 * state as Float64 bytes, folded with FNV-1a into 8 hex characters. The recorder stores one every
 * REPLAY_CHECKSUM_EVERY steps; a replay computes the same at the same steps and stops at the first that differs, so a
 * replay never shows a battle other than the one recorded. Node-runnable; allocation-free past its scratch.
 */
interface DigestHull {
  id: string;
  state: { pos: { x: number; y: number; z: number }; yaw: number; speed: number; turretYaw: number; gunPitch: number } | null;
  combat: { hp: number; destroyed?: boolean } | null;
}

interface DigestGame {
  tanks: readonly DigestHull[];
  shells: readonly unknown[];
  nextShellId: number;
  timeS: number;
}

const scratch = new DataView(new ArrayBuffer(8));
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function foldNumber(hash: number, value: number): number {
  scratch.setFloat64(0, value, true);
  for (let i = 0; i < 8; i++) hash = Math.imul(hash ^ scratch.getUint8(i), FNV_PRIME);
  return hash;
}

function foldString(hash: number, text: string): number {
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME);
  return hash;
}

export function replayStateDigest(game: DigestGame): string {
  let hash = FNV_OFFSET;
  hash = foldNumber(hash, game.timeS);
  hash = foldNumber(hash, game.shells.length);
  hash = foldNumber(hash, game.nextShellId);
  for (const hull of game.tanks) {
    hash = foldString(hash, hull.id);
    const s = hull.state, c = hull.combat;
    if (!s || !c) continue;
    hash = foldNumber(hash, s.pos.x);
    hash = foldNumber(hash, s.pos.y);
    hash = foldNumber(hash, s.pos.z);
    hash = foldNumber(hash, s.yaw);
    hash = foldNumber(hash, s.speed);
    hash = foldNumber(hash, s.turretYaw);
    hash = foldNumber(hash, s.gunPitch);
    hash = foldNumber(hash, c.hp);
    hash = foldNumber(hash, c.destroyed ? 1 : 0);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
