// Where a tank id enters from outside this build (SSOT 2.19, ID.03): Studio
// scene JSON (files, slots, `?scene=` links and media scenes), kill-cam replay
// payloads, gallery links and telemetry. Each reads the record's
// `tankIdSchema` (missing = 1) and returns this build's ids; each writer stamps
// the schema it wrote. Pure and DOM-free; the resolver is injectable so the
// receipts can prove a swap resolves before the rename lands.
//
// Rule: a scene or replay built in the page from this build's ids (a Studio
// production preset, a staged shot) must spread `TANK_IDS.stamp()` into it,
// or a later rename would read it as schema 1 and rename it again. A file
// re-keyed to new ids must carry `"tankIdSchema": N` the same way; a file left
// as written needs nothing.

import { TANK_IDS, TANK_ID_SCHEMA_PARAM, type TankIdResolver } from '../vehicles/tankIdAliases.ts';

interface SceneActorLike { id?: string; specId?: string }
interface SceneLike { tankIdSchema?: unknown; actors?: readonly SceneActorLike[] }

/** A Studio scene with every actor's vehicle in this build's ids (the input is not mutated). */
export function sceneInCurrentTankIds<T extends SceneLike>(scene: T, resolver: TankIdResolver = TANK_IDS): T {
  if (!scene || !Array.isArray(scene.actors)) return scene;
  const schema = resolver.schemaOf(scene.tankIdSchema);
  if (schema >= resolver.schema) return scene;
  return {
    ...scene,
    actors: scene.actors.map((actor) => {
      if (!actor) return actor;
      const next = { ...actor };
      if (typeof actor.id === 'string' && actor.id) next.id = resolver.resolve(actor.id, schema);
      if (typeof actor.specId === 'string' && actor.specId) next.specId = resolver.resolve(actor.specId, schema);
      return next;
    }),
  };
}

interface ReplayEntityLike { specId?: string }
interface ReplayEventLike { attackerSpecId?: string; targetSpecId?: string }
interface ReplayLike {
  tankIdSchema?: unknown;
  ev?: ReplayEventLike | null;
  attackerEnt?: ReplayEntityLike | null;
  targetEnt?: ReplayEntityLike | null;
}

/** A kill-cam replay payload with its vehicles in this build's ids (the input is not mutated). */
export function replayInCurrentTankIds<T extends ReplayLike>(replay: T, resolver: TankIdResolver = TANK_IDS): T {
  if (!replay || typeof replay !== 'object') return replay;
  const schema = resolver.schemaOf(replay.tankIdSchema);
  if (schema >= resolver.schema) return replay;
  const id = (value: string | undefined): string | undefined => (value ? resolver.resolve(value, schema) : value);
  const entity = <E extends ReplayEntityLike>(ent: E | null | undefined): E | null | undefined => (
    ent && typeof ent === 'object' && ent.specId ? { ...ent, specId: id(ent.specId) } : ent
  );
  return {
    ...replay,
    ...(replay.ev ? { ev: { ...replay.ev, attackerSpecId: id(replay.ev.attackerSpecId), targetSpecId: id(replay.ev.targetSpecId) } } : {}),
    ...(replay.attackerEnt ? { attackerEnt: entity(replay.attackerEnt) } : {}),
    ...(replay.targetEnt ? { targetEnt: entity(replay.targetEnt) } : {}),
  };
}

/** The vehicle a link names: `?id=` read under `?ids=` (missing = schema 1). */
export function linkTankId(params: { get(name: string): string | null }, resolver: TankIdResolver = TANK_IDS): string | null {
  const raw = params.get('id');
  if (!raw) return null;
  return resolver.resolve(raw, params.get(TANK_ID_SCHEMA_PARAM));
}

/** Stamp a link this build writes with its id schema (nothing while schema 1). */
export function stampTankIdLink(params: { set(name: string, value: string): void; delete(name: string): void }, resolver: TankIdResolver = TANK_IDS): void {
  if (resolver.schema > 1) params.set(TANK_ID_SCHEMA_PARAM, String(resolver.schema));
  else params.delete(TANK_ID_SCHEMA_PARAM);
}

/** `/gallery?id=…` (plus `&ids=N` once a rename has landed). */
export function galleryHref(id: string, resolver: TankIdResolver = TANK_IDS): string {
  const stamp = resolver.linkParam();
  return `/gallery?id=${encodeURIComponent(id)}${stamp ? `&${stamp}` : ''}`;
}

/** A tank id inside a telemetry note: `<id>` while schema 1, `<id>.s<N>` after a rename. */
export function telemetryTankId(id: string, resolver: TankIdResolver = TANK_IDS): string {
  return resolver.schema > 1 ? `${id}.s${resolver.schema}` : id;
}
