/**
 * The presentation contract between MatchClient and whatever draws the
 * match (charter §3 "presentation/"). The client owns every rule; the
 * adapter only shows what a frame says: sampled remote poses, the viewer's
 * predicted tank, shells, clocks, persistent destroyed props, the verdict,
 * spotting visibility (an entity absent from a frame is hidden), and the
 * reliable events the client releases on its presentation budget.
 * `bindMatchPresentation` is the whole glue; the recording adapter is what
 * the headless soak and the receipts observe.
 */
import type { RosterEntry, VerdictId, WireEvent } from '../wire/index.ts';
import type { MatchClient, MatchFrame } from '../match/matchClient.ts';
import type { Unsubscribe } from '../transport/transport.ts';

export interface RosterContext {
  /** The viewer's entity id (NO_ENTITY for a spectator) and roster player id. */
  ownEntityId: number;
  ownPlayerId: string;
  roomId: string;
  mapId: string;
  mode: string;
  rulesetJson: string;
}

export interface EventContext {
  /** The viewer's own accepted shot, delivered immediately instead of through the budget. */
  own: boolean;
  /** The muzzle flash for this shot already played from the fire edge. */
  feedbackPredicted: boolean;
}

export interface PresentationAdapter {
  /** WELCOME: create the actors for the roster (may load builders; resolves when the roster is ready). */
  applyRoster(roster: readonly RosterEntry[], context: RosterContext): Promise<void> | void;
  /** Once per display frame with the sampled world and the viewer's predicted tank. */
  applyFrame(frame: MatchFrame): void;
  /** A reliable one-shot released by the budget, or the viewer's own shot. */
  applyEvent(event: WireEvent, context: EventContext): void;
  /** The persistent verdict (from snapshot meta, or a `match_ended` event). */
  applyVerdict(verdict: VerdictId, reason: string): void;
  /** Spotting: whether an entity is disclosed this frame. */
  setVisibility(entityId: number, visible: boolean): void;
  dispose(): void;
}

/** Feed a client's frames, events, roster and verdict into an adapter. Returns the unbind. */
export function bindMatchPresentation(client: MatchClient, adapter: PresentationAdapter): Unsubscribe {
  const offWelcome = client.onWelcome((welcome) => {
    const own = welcome.roster.find((entry) => entry.entityId === welcome.entityId);
    void adapter.applyRoster(welcome.roster, {
      ownEntityId: welcome.entityId, ownPlayerId: own?.playerId ?? '',
      roomId: welcome.roomId, mapId: welcome.mapId, mode: welcome.mode, rulesetJson: welcome.rulesetJson,
    });
  });
  const offFrame = client.onFrame((frame) => {
    adapter.applyFrame(frame);
    for (const shot of frame.ownShots) adapter.applyEvent(shot.event, { own: true, feedbackPredicted: shot.feedbackPredicted });
    for (const event of frame.events) adapter.applyEvent(event, { own: false, feedbackPredicted: false });
  });
  return () => { offWelcome(); offFrame(); };
}

export interface RecordedFrame {
  tick: number;
  renderTimeMs: number;
  entities: number;
  ownX: number | null;
  ownZ: number | null;
  phase: number;
}

export interface RecordedPose {
  entityId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  destroyed: boolean;
}

/** A headless adapter that remembers what it was shown (soaks, receipts). */
export class RecordingPresentation implements PresentationAdapter {
  readonly frames: RecordedFrame[] = [];
  readonly events: Array<{ kind: string; own: boolean; feedbackPredicted: boolean }> = [];
  readonly hidden = new Set<number>();
  /** The newest presented pose of every disclosed entity (what a prediction world may collide with). */
  readonly poses = new Map<number, RecordedPose>();
  roster: readonly RosterEntry[] = [];
  context: RosterContext | null = null;
  verdict: { verdict: VerdictId; reason: string } | null = null;
  disposed = false;
  private readonly maxFrames: number;

  constructor(maxFrames = 8192) { this.maxFrames = maxFrames; }

  applyRoster(roster: readonly RosterEntry[], context: RosterContext): void {
    this.roster = roster;
    this.context = context;
  }

  applyFrame(frame: MatchFrame): void {
    const own = frame.viewer.state;
    this.frames.push({
      tick: frame.tick, renderTimeMs: frame.renderTimeMs, entities: frame.entities.length,
      ownX: own ? own.pos.x : null, ownZ: own ? own.pos.z : null, phase: frame.meta.phase,
    });
    if (this.frames.length > this.maxFrames) this.frames.splice(0, this.frames.length - this.maxFrames);
    const present = new Set(frame.entities.map((entity) => entity.entityId));
    for (const id of this.poses.keys()) if (!present.has(id)) this.poses.delete(id);
    for (const entity of frame.entities) {
      let pose = this.poses.get(entity.entityId);
      if (!pose) { pose = { entityId: entity.entityId, x: 0, y: 0, z: 0, yaw: 0, destroyed: false }; this.poses.set(entity.entityId, pose); }
      pose.x = entity.x; pose.y = entity.y; pose.z = entity.z; pose.yaw = entity.yaw;
      pose.destroyed = (entity.flags & 1) !== 0;
    }
    for (const entry of this.roster) this.setVisibility(entry.entityId, present.has(entry.entityId) || entry.entityId === frame.viewer.entityId);
    if (frame.meta.verdict !== 0 && !this.verdict) this.applyVerdict(frame.meta.verdict, frame.meta.verdictReason);
  }

  applyEvent(event: WireEvent, context: EventContext): void {
    this.events.push({ kind: event.kind, own: context.own, feedbackPredicted: context.feedbackPredicted });
    if (event.kind === 'match_ended' && !this.verdict) {
      const result = event.payload.result;
      const verdict = result === 'alpha' ? 1 : result === 'bravo' ? 2 : result === 'draw' ? 3 : 0;
      this.applyVerdict(verdict as VerdictId, String(event.payload.reason ?? ''));
    }
  }

  applyVerdict(verdict: VerdictId, reason: string): void {
    this.verdict = { verdict, reason };
  }

  setVisibility(entityId: number, visible: boolean): void {
    if (visible) this.hidden.delete(entityId);
    else this.hidden.add(entityId);
  }

  dispose(): void { this.disposed = true; }
}
