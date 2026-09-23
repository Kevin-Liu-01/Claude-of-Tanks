// Spawn pads for large fields (owner 2026-09-18: "have a switch that's default set to 7v7 but then switching
// it does 14v14 and you can also enter custom numbers of allies and enemies so you can do stuff like 1 v 20").
// Every map authors one player pad and seven enemy pads. A side larger than its pads re-uses them with a
// compact offset ring so no two vehicles ask for the same point, and the allied bots take lateral and forward
// slots around the player pad instead of marching off the playable edge behind it: on the southern-spawn
// maps the room behind the player pad is under 10 m (ruinspires: none), while 84 m of lateral room and the
// whole battlefield ahead exist on every map (scratch map-spawn probe, 2026-09-18). Pure tables + math so the
// browser sim (game/state.ts) and the authority (sim/authoritativeMatch.ts) seat a side the same way.

interface SpawnPadPoint { readonly x: number; readonly z: number; readonly yaw: number }

/**
 * (right, back) metres from a re-used enemy pad by re-use ordinal — ring 0 is the pad itself. Lateral reach
 * stays within 13 m because neighbouring pads sit 39 m apart on the tightest map (desert / winter), and the
 * rearward reach within 16 m because the coastal, ruinspires and reservoir pads have no more room behind them.
 */
export const SPAWN_PAD_REUSE_OFFSETS: readonly (readonly [number, number])[] = Object.freeze([
  [0, 0], [0, 12], [13, 4], [-13, 4], [13, 16], [-13, 16], [0, -12], [13, -8], [-13, -8],
].map((pair) => Object.freeze(pair as [number, number])));

/** (lateral, back) metres from the player pad by allied-bot ordinal: the authored 7v7 wedge, the 14v14 ring,
 * then forward ranks (12 m and 26 m ahead of the player, toward the battlefield) — never further back. */
export const ALLY_PAD_SLOTS: readonly (readonly [number, number])[] = Object.freeze([
  [26, 0], [-26, 0], [52, 8], [-52, 8], [20, 30], [-20, 30],
  [78, 4], [-78, 4], [40, 18], [-40, 18], [66, 22], [-66, 22], [8, 14], [-8, 14],
  [14, -12], [-14, -12], [34, -12], [-34, -12], [54, -12], [-54, -12], [74, -12], [-74, -12],
  [20, -26], [-20, -26], [40, -26], [-40, -26], [60, -26], [-60, -26], [80, -26], [-80, -26],
].map((pair) => Object.freeze(pair as [number, number])));

/** Offset ring for a pad re-use ordinal; past the table the ring spirals outward (never behind the pad). */
export function spawnPadReuseOffset(reuse: number): readonly [number, number] {
  const k = Math.max(0, Math.floor(reuse));
  if (k < SPAWN_PAD_REUSE_OFFSETS.length) return SPAWN_PAD_REUSE_OFFSETS[k];
  const extra = k - SPAWN_PAD_REUSE_OFFSETS.length;
  const rank = Math.floor(extra / 4), column = extra % 4;
  return [(column % 2 ? -1 : 1) * (13 + 13 * Math.floor(column / 2)), -24 - 12 * rank];
}

/** Lateral / back slot for an allied-bot ordinal; past the table further forward ranks follow, 14 m apart. */
export function allyPadSlot(index: number): readonly [number, number] {
  const i = Math.max(0, Math.floor(index));
  if (i < ALLY_PAD_SLOTS.length) return ALLY_PAD_SLOTS[i];
  const extra = i - ALLY_PAD_SLOTS.length;
  const rank = Math.floor(extra / 8), column = extra % 8;
  return [(column % 2 ? -1 : 1) * (20 + 20 * Math.floor(column / 2)), -40 - 14 * rank];
}

/** The k-th re-use of an enemy pad: the pad's own frame (yaw faces the opposing side), offset by the ring. */
export function reuseSpawnPad(pad: SpawnPadPoint, reuse: number): SpawnPadPoint {
  const [right, back] = spawnPadReuseOffset(reuse);
  if (right === 0 && back === 0) return pad;
  const sin = Math.sin(pad.yaw), cos = Math.cos(pad.yaw);
  // forward = (sin yaw, cos yaw); right = (cos yaw, -sin yaw); back is opposite to forward
  return { x: pad.x + right * cos - back * sin, z: pad.z - right * sin - back * cos, yaw: pad.yaw };
}

/** An allied-bot slot in the player pad's frame (player forward = (sin yaw, cos yaw)). */
export function allySpawnPoint(player: SpawnPadPoint, index: number): SpawnPadPoint {
  const [lat, back] = allyPadSlot(index);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  return { x: player.x + cos * lat - sin * back, z: player.z - sin * lat - cos * back, yaw: player.yaw };
}
