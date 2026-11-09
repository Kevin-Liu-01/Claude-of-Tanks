/**
 * The crew's procedure on the radio (crew-lines-269; the owner, 2026-11-03: "more and better voice lines of more military
 * terms and of things happening, more special terms for AC-130, all the special modes"): the moments the engine's sound
 * handlers leave unvoiced, read from the same bus events and frames and spoken through the engine's `say`, which turns a
 * tank crew's line into the mode's and the seat's own (voiceLines.ts resolveCrewLine).
 *
 *   - the fire command when our sight settles on a spotted enemy with the gun loaded (the round's name), the gunner's
 *     "identified" on a quiet net after it, "on the way" on the shot it commanded, "re-engage" when the round left the
 *     target alive and the gun is loaded again, "cease fire" when the kill left no spotted enemy near;
 *   - APS and ERA (an intercept of ours or theirs), our drone's battery, link, recovery and loss to enemy fire, an enemy
 *     drone our roof gun brings down, enemy smoke, backing out under fire, driving through an obstacle, a jump, and the
 *     countdown's crew report;
 *   - each mode's own moments: a flag dropped or recovered, a capture against us, a point we contest, a goal against us
 *     and the ball's reset, the Horde's runner and swarm waves, the Frontline's counter-attack and final line, a survivor
 *     turned (or our own crew), Gun Game's last weapon, the Juggernaut sighted;
 *   - the AC-130's fire control: the sensor's tally (or a shift of fire after a kill), "rifle" on a missile, "danger
 *     close" when our round lands by a friendly, "rounds complete" after a fire mission, a friendly extracted.
 *
 * Presentation only, like the rest of src/audio: it reads events and frames and changes no outcome. Its own timing reads
 * the audio clock; nothing here draws from the battle's random streams.
 *
 * Two declared scopes, each with one owner (round 8 Y3, s1-01 and s1-03). The battle's calls (CrewBattle) start afresh
 * through `startBattle`, from the engine's one per-battle reset (audioEngine.ts resetBattlePlay: a battle edge, a network
 * restart). Our tank's life's calls (CrewLife) start afresh through `startLife`, from the engine's respawn edge for our
 * hull, and end with our death as the engine hears it once a life (`onDestroyed`, its death latch): nothing a life armed
 * (a cease fire, a drone's recovery, a fire mission) is called in the next. The pause edge (`pause`) cancels every call
 * armed so far; the engine runs no crew frame while paused and its radio takes no line (the crew is silent behind the
 * pause menu, a network battle's included, as the engine's quiet-radio rule always was). Where the game holds a fact the
 * crew reads it rather than keeping its own copy: the gun is loaded while our reload channel is ready (`combat.reload.t`),
 * an enemy is named only while the player sees it (the engine's frame index, src/game/playerVisibility.ts).
 */

import { AERIAL_RULES, GUN_GAME_WEAPONS } from '../sim/matchRuleset.ts';
import type { GameModeId } from '../sim/gameModeCatalog.ts';
import type { ModeEventType } from './modeSounds.ts';
import type { CrewLineContext, CrewSeat } from './voiceLines.ts';

type Vec3 = readonly [number, number, number];

interface SayOptions {
  prob?: number;
  delayS?: number;
}

/** Our own vehicle as the frame shows it (the engine's AudioEntity, the fields read here). */
export interface CrewPlayer {
  id: string;
  team?: string;
  spec?: { gun?: { shells?: readonly { type?: unknown; guided?: unknown; soundProfile?: unknown }[] } };
  state: { pos: { x: number; y: number; z: number }; speed: number; grounded?: boolean; overturned?: boolean };
  aerial?: { kind?: string; active?: boolean; x?: number; y?: number; z?: number; batteryS?: number; recallS?: number; returnS?: number };
  /** `reload` is the selected round's channel (sim/damage.ts combat.reload; a network seat's mirrors the row's): t 0 is a
   *  round in the breech. */
  combat?: { destroyed?: boolean; shellSlot?: number; reload?: { readonly t?: number } };
}

/** Another hull as the engine tracks it. */
export interface CrewTank {
  readonly team: string;
  readonly pos: { x: number; y: number; z: number };
  readonly alive: boolean;
}

export interface CrewListener {
  readonly pos: { x: number; y: number; z: number };
  readonly forward: { x: number; y: number; z: number };
}

export interface CrewProcedureHost {
  say(id: string, options?: SayOptions): boolean;
  /** The audio clock (s). */
  now(): number;
  /** In a battle that has rolled out, not ended and not paused, our tank alive (the engine's battle mode, battleMode.ts). */
  live(): boolean;
  /** In a battle's countdown (rolled out or not), not ended. */
  inBattle(): boolean;
  playerId(): string | null;
  player(): CrewPlayer | null;
  tanks(): ReadonlyMap<string, CrewTank>;
  /** Whether the player sees the hull now (src/game/playerVisibility.ts, as this frame's index read it): the crew names
   *  only what the player can see. */
  visible(id: string): boolean;
  sameTeam(a: string | null | undefined, b: string | null | undefined): boolean;
  /** Our side in the mode's objective events. */
  objectiveTeam(): 'alpha' | 'bravo';
  mode(): GameModeId;
  bossId(): string | null;
  /** The net is free (nothing waiting, the last call and its breath over). */
  radioQuiet(): boolean;
  lastTransmission(): { readonly id: string; readonly t: number; readonly dur: number } | undefined;
  /** Our round met the target's APS: it is not a miss. */
  forgetOwnRound(shellId: number): void;
}

type On = <T>(event: string, listener: (payload: T) => void) => void;

/** The fire command's lay: the sight within this much of a hull (m, or the share of its range), held this long (s). */
const LAY = Object.freeze({ missM: 5, missShare: 0.015, minM: 40, maxM: 2600, holdS: 0.35, sameTargetS: 30 });
/** The gunner answers a fire command on a quiet net within this long, while still laid on. */
const IDENTIFY_S = 3;
/** "On the way" for the shot a fire command called for, within this long. */
const COMMANDED_SHOT_S = 10;
/** "Re-engage": a round that left its target alive, the gun loaded again within this long. */
const REENGAGE_S = 14;
/** "Cease fire" after a kill when no enemy the player sees stands within this range, this long after the kill call. */
export const CEASE = Object.freeze({ rangeM: 1500, afterS: 2.4 });
const DRONE = AERIAL_RULES.drone;
/** Gun Game's last weapon on the ladder. */
const LADDER_FINAL = GUN_GAME_WEAPONS.length - 1;
/** Our drone: the battery low call (s left, and not in its last seconds), the link's warning (share of its range). */
const DRONE_WARN = Object.freeze({ batteryS: 10, lastS: 2, linkShare: 0.85 });
/** Enemy smoke: a screen whose launcher stood this close to a hull (m), within this range of us (m). */
const SMOKE = Object.freeze({ hullM: 8, rangeM: 900 });
/** Backing out: reversing this fast (m/s) within this long of a hit or of being seen (s). */
const REVERSE = Object.freeze({ mps: 3, afterS: 6 });
/** Airborne this long (s) is a jump, not a bump. */
const JUMP_S = 0.45;
/** The AC-130: "danger close" when our heavy round lands this near a friendly tank (m); a fire mission of at least this
 *  many heavy rounds is complete after this long without one (s); a new target this far from the last kill, this soon
 *  after it, is a shift of fire. */
export const GUNSHIP = Object.freeze({ dangerM: 35, heavyMm: 100, missionRounds: 3, missionQuietS: 7, shiftM: 150, shiftS: 25 });

/** A hull's death as the engine hears it, once a life (its death latch dedupes a re-sent network event). */
export interface CrewDeath {
  readonly id: string;
  readonly killerId?: string | null;
  readonly pos?: Vec3;
  readonly source?: string;
}

export interface CrewProcedure {
  /**
   * Subscribe on the engine's bus: `cue` takes the moments the crew calls (heard once the engine's graph exists), `fact`
   * what it keeps whether or not the graph exists yet (why the battle ended: the result call reads it).
   */
  bind(cue: On, fact: On): void;
  frame(dt: number, listener: CrewListener | null, entities: readonly CrewFrameEntity[]): void;
  /** The context the engine resolves each line in (voiceLines.ts resolveCrewLine). */
  context(): CrewLineContext;
  /** A new battle (the engine's per-battle reset: a battle edge, a network restart): the battle's calls and our life's. */
  startBattle(): void;
  /** Our tank's new life (the engine's respawn edge for our hull): the life's calls start afresh. */
  startLife(): void;
  /** A hull's death, heard once a life: ours ends our life's calls, one we made is a kill. */
  onDestroyed(event: CrewDeath): void;
  /** The pause edge: every call armed so far is cancelled (none fires behind the menu, or late on the resume). */
  pause(): void;
}

/** A hull of the frame's list, for the AC-130's extraction (mode-active hulls leave the field when extracted). */
export interface CrewFrameEntity {
  readonly id: string;
  readonly modeActive?: boolean;
  readonly combat?: { readonly destroyed?: boolean };
}

/** The battle's calls: one battle (`startBattle`). */
interface CrewBattle {
  /** Infected: our crew has turned. */
  turned: boolean;
  /** Turbo Ball: the last goal's kick-off, which revives every tank. */
  kickoffAt: number;
  /** Why the battle ended: the mode's own reason (mode:completed) names it before the battle's (battle:ended, the first
   *  a battle), whichever arrives first (a network seat hears a generic 'elimination' after the mode's own). */
  modeReason: string | null;
  battleReason: string | null;
  /** The countdown's crew report (once a battle) and the window for its answer. */
  reported: boolean;
  readyUntil: number;
  /** Each target's last fire command: a target is commanded once in LAY.sameTargetS. */
  commandedAt: Map<string, number>;
  /** The newest smoke screen heard (its birth on the battle's sim clock). */
  smokeBorn: number;
  /** The AC-130's escorts: whether each was extracted at its last look. */
  extracted: Map<string, boolean>;
}

/** Our tank's life's calls: one life (`startLife`; our death ends them). */
interface CrewLife {
  /** The lay: the enemy under our sight and since when; the last fire command, its target and the answer's window. */
  layId: string | null;
  layFrom: number;
  commandAt: number;
  commandTarget: string | null;
  identifyUntil: number;
  /** Our last shot, and the last the fire command called for. */
  commandedShotAt: number;
  ownShotAt: number;
  /** Our main-gun rounds in flight (shell id -> what the sight was on), and the re-engage a round that left its target
   *  standing asks for. */
  ownShots: Map<number, string | null>;
  reengage: { target: string | null; at: number } | null;
  /** The cease fire a kill armed. */
  ceaseAt: number;
  /** A threat that makes backing out the driver's call; the jump's airtime. */
  threatAt: number;
  reverseCalled: boolean;
  airS: number;
  jumped: boolean;
  /** Our drone's flight. */
  droneFlying: boolean;
  batteryCalled: boolean;
  linkCalled: boolean;
  recalling: boolean;
  /** The AC-130's fire mission, and the last kill a shift of fire is measured from. */
  heavyRounds: number;
  lastHeavyAt: number;
  lastKill: { x: number; z: number; at: number } | null;
}

function freshBattle(): CrewBattle {
  return {
    turned: false, kickoffAt: -1e9, modeReason: null, battleReason: null, reported: false, readyUntil: -1,
    commandedAt: new Map(), smokeBorn: -1, extracted: new Map(),
  };
}

function freshLife(): CrewLife {
  return {
    layId: null, layFrom: 0, commandAt: -1e9, commandTarget: null, identifyUntil: -1, commandedShotAt: -1e9, ownShotAt: -1e9,
    ownShots: new Map(), reengage: null, ceaseAt: -1, threatAt: -1e9, reverseCalled: false, airS: 0, jumped: false,
    droneFlying: false, batteryCalled: false, linkCalled: false, recalling: false, heavyRounds: 0, lastHeavyAt: -1e9, lastKill: null,
  };
}

function ammoCall(shell: { type?: unknown; guided?: unknown } | undefined): string {
  const type = String(shell?.type || '');
  return shell?.guided ? 'fire_command_missile' : type === 'HEAT' ? 'fire_command_heat'
    : type === 'HE' || type === 'HESH' ? 'fire_command_he' : 'fire_command_kinetic';
}

export function createCrewProcedure(host: CrewProcedureHost): CrewProcedure {
  const battle = freshBattle();
  const life = freshLife();

  /** Our tank's life starts afresh (its respawn), or ends (its death): nothing the last life armed carries over. */
  function startLife(): void {
    Object.assign(life, freshLife());
  }

  function startBattle(): void {
    Object.assign(battle, freshBattle());
    startLife();
  }

  function seat(): CrewSeat {
    return host.player()?.aerial?.kind === 'gunship' ? 'gunship' : 'tank';
  }

  function context(): CrewLineContext {
    const boss = host.bossId();
    const me = host.playerId();
    return {
      mode: host.mode(),
      seat: seat(),
      juggernaut: host.mode() === 'juggernaut' && boss != null && me != null ? (boss === me ? 'boss' : 'hunter') : null,
      turned: battle.turned,
      kickoff: host.now() - battle.kickoffAt < 3,
      endReason: battle.modeReason ?? battle.battleReason,
    };
  }

  const mine = (id: string | null | undefined): boolean => id != null && id === host.playerId();
  const enemyOf = (id: string | null | undefined): boolean => id != null && !mine(id) && !host.sameTeam(id, host.playerId());

  /** An enemy our crew can name: alive, and seen by the player now (a mode that lights every hull is the rule's too). */
  function identifiable(id: string, tank: CrewTank): boolean {
    return tank.alive && enemyOf(id) && host.visible(id);
  }

  // ------------------------------------------------------------ the lay ---

  /** The enemy our sight is on: the nearest identifiable hull the sight line passes within a few metres of. */
  function laidOn(listener: CrewListener): string | null {
    let best: string | null = null;
    let bestAlong = Infinity;
    const { pos: p, forward: f } = listener;
    for (const [id, tank] of host.tanks()) {
      if (!identifiable(id, tank)) continue;
      const rx = tank.pos.x - p.x, ry = tank.pos.y + 1.2 - p.y, rz = tank.pos.z - p.z;
      const along = rx * f.x + ry * f.y + rz * f.z;
      if (along < LAY.minM || along > LAY.maxM || along >= bestAlong) continue;
      const miss = Math.hypot(rx - f.x * along, ry - f.y * along, rz - f.z * along);
      if (miss > Math.max(LAY.missM, along * LAY.missShare)) continue;
      best = id;
      bestAlong = along;
    }
    return best;
  }

  function updateLay(now: number, listener: CrewListener | null): void {
    const me = host.player();
    const gunship = seat() === 'gunship';
    const flyingDrone = !!me?.aerial?.active && me.aerial.kind === 'drone';
    // loaded while our reload channel is ready: a fresh hull's gun or a new weapon's (a respawn, a Gun Game step) is
    // loaded at once, though no reload ever finished for it
    const loaded = !((me?.combat?.reload?.t ?? 0) > 0);
    const target = listener && me && !flyingDrone && (loaded || gunship) ? laidOn(listener) : null;
    if (target !== life.layId) { life.layId = target; life.layFrom = now; }
    if (!target || now - life.layFrom < LAY.holdS) return;
    const last = battle.commandedAt.get(target);
    if (last != null && now - last < LAY.sameTargetS) return;
    let id: string;
    if (gunship) {
      // the sensor picks up the target; after a kill, a target far from it is a shift of fire
      const t = host.tanks().get(target);
      const lastKill = life.lastKill;
      id = lastKill && t && now - lastKill.at < GUNSHIP.shiftS && Math.hypot(t.pos.x - lastKill.x, t.pos.z - lastKill.z) > GUNSHIP.shiftM
        ? 'gunship_shift_fire' : 'fire_command_kinetic';
      if (id === 'gunship_shift_fire') life.lastKill = null;
    } else {
      const slot = me?.combat?.shellSlot ?? 0;
      id = ammoCall(me?.spec?.gun?.shells?.[slot]);
    }
    battle.commandedAt.set(target, now);
    if (!host.say(id, { delayS: 0.05 })) return;
    life.commandAt = now;
    life.commandTarget = target;
    life.identifyUntil = gunship ? -1 : now + IDENTIFY_S + 2;
  }

  /** The gunner's answer, once the commander's command has been spoken and the net is free, still laid on and not yet
   *  fired (after the shot it would follow the result). */
  function updateIdentify(now: number): void {
    if (life.identifyUntil < 0) return;
    if (now > life.identifyUntil || life.ownShotAt >= life.commandAt) { life.identifyUntil = -1; return; }
    if (!host.radioQuiet()) return;
    const last = host.lastTransmission();
    life.identifyUntil = -1;
    if (last && last.id.startsWith('fire_command_') && last.t >= life.commandAt - 0.01 && life.layId === life.commandTarget) host.say('identified');
  }

  // ------------------------------------------------------- per frame ---

  function updateDrone(me: CrewPlayer): void {
    const view = me.aerial;
    const flying = view?.kind === 'drone' && !!view.active;
    if (flying && !life.droneFlying) { life.batteryCalled = life.linkCalled = life.recalling = false; }
    if (flying && view) {
      if ((view.recallS ?? 0) > 0 || (view.returnS ?? 0) > 0) life.recalling = true;
      const battery = view.batteryS ?? DRONE.batteryS;
      // (a drone with a second or two left is about to be lost: that is the call then)
      if (!life.recalling && !life.batteryCalled && battery < DRONE_WARN.batteryS && battery >= DRONE_WARN.lastS) {
        life.batteryCalled = true;
        host.say('drone_battery_low', { delayS: 0.1 });
      }
      const range = Math.hypot((view.x ?? me.state.pos.x) - me.state.pos.x, (view.z ?? me.state.pos.z) - me.state.pos.z);
      if (!life.recalling && !life.linkCalled && range >= DRONE.rangeM * DRONE_WARN.linkShare) {
        life.linkCalled = true;
        host.say('drone_link_weak', { delayS: 0.1 });
      }
    } else if (life.droneFlying && life.recalling && !me.combat?.destroyed) host.say('drone_recovered', { delayS: 0.4 });
    life.droneFlying = flying;
  }

  function updateMobility(dt: number, now: number, me: CrewPlayer): void {
    if (seat() !== 'tank' || me.aerial?.active) { life.airS = 0; return; }
    const speed = Number(me.state.speed) || 0;
    if (speed < -REVERSE.mps && now - life.threatAt < REVERSE.afterS && !life.reverseCalled) {
      life.reverseCalled = true;
      host.say('reversing', { delayS: 0.1 });
    }
    if (speed > -0.5) life.reverseCalled = false;
    if (me.state.grounded === false && !me.state.overturned) {
      life.airS += dt;
      if (life.airS >= JUMP_S && !life.jumped) { life.jumped = true; host.say('jump_brace'); }
    } else { life.airS = 0; life.jumped = false; }
  }

  function updateGunship(now: number, entities: readonly CrewFrameEntity[]): void {
    if (seat() !== 'gunship') return;
    if (life.heavyRounds >= GUNSHIP.missionRounds && now - life.lastHeavyAt > GUNSHIP.missionQuietS) {
      life.heavyRounds = 0;
      host.say('gunship_rounds_complete');
    }
    // a friendly that leaves the field alive has reached the extraction point
    for (const entity of entities) {
      if (!entity || mine(entity.id) || !host.sameTeam(entity.id, host.playerId())) continue;
      const out = entity.modeActive === false && !entity.combat?.destroyed;
      const was = battle.extracted.get(entity.id);
      battle.extracted.set(entity.id, out);
      if (out && was === false) host.say('gunship_friendly_extracted', { delayS: 0.3 });
    }
  }

  /** "Cease fire": the kill call has been made and no enemy the player sees stands near. */
  function updateCease(now: number, me: CrewPlayer): void {
    if (life.ceaseAt < 0 || now < life.ceaseAt) return;
    life.ceaseAt = -1;
    for (const [id, tank] of host.tanks()) {
      if (!identifiable(id, tank)) continue;
      if (Math.hypot(tank.pos.x - me.state.pos.x, tank.pos.z - me.state.pos.z) < CEASE.rangeM) return;
    }
    host.say('cease_fire');
  }

  function updateReport(now: number): void {
    if (battle.readyUntil < 0) return;
    if (now > battle.readyUntil) { battle.readyUntil = -1; return; }
    if (!host.radioQuiet()) return;
    const last = host.lastTransmission();
    battle.readyUntil = -1;
    if (last?.id === 'crew_report') host.say('crew_ready');
  }

  // ------------------------------------------------------------ events ---

  function onMode(type: CrewModeEvent, payload: Record<string, unknown>): void {
    const ours = host.objectiveTeam();
    const team = payload.team === 'alpha' || payload.team === 'bravo' ? payload.team : null;
    switch (type) {
      case 'flag_dropped':
        host.say(team === ours ? 'flag_dropped_ours' : 'flag_dropped_theirs', { delayS: 0.3 });
        break;
      case 'flag_returned':
        if (team && team !== ours) host.say('enemy_flag_returned', { delayS: 0.3 });
        break;
      case 'flag_captured':
        if (team && team !== ours) host.say('flag_lost', { delayS: 0.3 });
        break;
      case 'zone_contested':
        // the holder is the other side: our side is on its point
        if (team && team !== ours) host.say('objective_contesting', { delayS: 0.3 });
        break;
      case 'goal_scored':
        battle.kickoffAt = host.now();
        if (team && team !== ours) host.say('goal_conceded', { delayS: 0.2 });
        break;
      case 'ball_reset':
        host.say('ball_reset', { delayS: 0.2 });
        break;
      case 'wave_started':
        // the wave's call goes first (the engine's), the kind of wave after it
        if (payload.special === 'runner') host.say('wave_runners', { delayS: 2.4 });
        else if (payload.special === 'swarm') host.say('wave_swarm', { delayS: 2.4 });
        break;
      case 'counter_attack':
        host.say('counter_attack', { delayS: 0.3 });
        break;
      case 'line_advanced': {
        const line = Number(payload.line), total = Number(payload.total);
        if (Number.isFinite(line) && Number.isFinite(total) && total > 1 && line === total - 1) host.say('final_line', { delayS: 2.6 });
        break;
      }
      case 'infected':
        if (mine(payload.id as string)) { battle.turned = true; host.say('infected_turned', { delayS: 0.8 }); }
        else if (!battle.turned && host.sameTeam(payload.id as string, host.playerId())) host.say('ally_infected', { delayS: 0.3 });
        break;
      case 'weapon_advanced': {
        const final = Number(payload.stage) >= LADDER_FINAL;
        if (!final) break;
        if (mine(payload.id as string)) host.say('gun_game_final', { delayS: 2.2 });
        else if (enemyOf(payload.id as string)) host.say('enemy_final_weapon', { delayS: 0.3 });
        break;
      }
      default: {
        const unheard: never = type;
        return unheard;
      }
    }
  }

  /** A hull's death, heard once a life: ours ends the life, one we made is a kill. */
  function onDestroyed(e: CrewDeath): void {
    if (!e) return;
    if (mine(e.id)) { startLife(); return; }
    if (!mine(e.killerId)) return;
    if (e.source === 'ac130' && e.pos) life.lastKill = { x: e.pos[0], z: e.pos[2], at: host.now() };
    else if (!e.source && seat() === 'tank') life.ceaseAt = host.now() + CEASE.afterS;
    life.reengage = null;
  }

  /** The pause edge: the calls armed so far die with it (a cease fire, the gunner's answer, a lay's hold, a fire mission's
   *  end, the countdown report's answer, a jump's airtime), so none is said behind the menu or minutes late on resume. */
  function pause(): void {
    life.ceaseAt = -1;
    life.identifyUntil = -1;
    life.layId = null;
    life.heavyRounds = 0;
    life.airS = 0;
    battle.readyUntil = -1;
  }

  function bind(cue: On, fact: On): void {
    // why the battle ended, kept whether or not the graph exists yet: the mode's own reason before the battle's
    fact<{ reason?: string }>('mode:completed', (e) => { if (typeof e?.reason === 'string') battle.modeReason = e.reason; });
    fact<{ reason?: string }>('battle:ended', (e) => { if (battle.battleReason == null && typeof e?.reason === 'string') battle.battleReason = e.reason; });
    cue<{ seconds?: number }>('battle:countdown', (e) => {
      if (battle.reported || !host.inBattle() || typeof e?.seconds !== 'number') return;
      battle.reported = true;
      // a count long enough for the report and its answer before the rollout's call
      if (e.seconds >= 4 && host.say('crew_report')) battle.readyUntil = host.now() + 3;
    });
    cue<{ id: string; team?: string; spotterId?: string | null }>('tank:spotted', (e) => {
      // the Juggernaut sighted by our side (the event's team is the spotting side): the spot's edge is the call's moment
      if (!e?.id || !enemyOf(e.id) || e.team == null || e.team !== host.player()?.team) return;
      const boss = host.bossId();
      if (boss != null && e.id === boss && !mine(boss) && host.live()) host.say('juggernaut_spotted', { delayS: 0.1 });
    });
    cue<undefined>('player:spotted', () => { life.threatAt = host.now() + 3; });
    cue<{ shellId?: number; shooterId?: string; isPlayer?: boolean; caliberMm?: number; weaponSound?: string }>('shell:fired', (e) => {
      if (!e?.isPlayer || !host.live()) return;
      const now = host.now();
      const caliber = e.caliberMm || 0;
      life.ownShotAt = now;
      if (e.weaponSound === 'gunship-missile') host.say('gunship_rifle', { delayS: 0.1 });
      else if (seat() === 'tank' && caliber >= 60 && now - life.commandAt < COMMANDED_SHOT_S && now - life.commandedShotAt > COMMANDED_SHOT_S) {
        // the shot the fire command called for: "on the way"
        life.commandedShotAt = now;
        host.say('firing', { delayS: 0.08 });
      }
      if (seat() === 'gunship' && caliber >= GUNSHIP.heavyMm) { life.heavyRounds++; life.lastHeavyAt = now; }
      if (caliber >= 60 && e.shellId != null) {
        if (life.ownShots.size >= 12) life.ownShots.delete(life.ownShots.keys().next().value as number);
        life.ownShots.set(e.shellId, life.layId);
      }
    });
    cue<{ total?: number; done?: boolean; progress?: number }>('player:reload', (e) => {
      // the gun loaded again: the re-engage a round that left its target standing asked for (whether the gun is loaded is
      // read from our reload channel, updateLay)
      if (!e) return;
      const done = !!e.done || (e.progress ?? 0) >= 1;
      if (!done || !life.reengage || !host.live() || seat() !== 'tank') return;
      const { target, at } = life.reengage;
      life.reengage = null;
      if (host.now() - at > REENGAGE_S) return;
      // the round's own target, or what the sight was on when it fired; a miss at nothing is not re-engaged
      const t = target ? host.tanks().get(target) : null;
      if (t?.alive) host.say('re_engage', { delayS: 0.15 });
    });
    cue<{ targetId?: string | null; attackerId?: string | null; damage?: number; destroyed?: boolean; shellId?: number; caliberMm?: number; pos?: Vec3 }>('shell:hit', (e) => {
      if (!e) return;
      if (mine(e.targetId) && host.live()) life.threatAt = host.now();
      if (!mine(e.attackerId)) return;
      if (e.shellId != null) life.ownShots.delete(e.shellId);
      // the main gun's round left an enemy standing: the commander will order it again
      if (!e.destroyed && enemyOf(e.targetId) && (e.caliberMm || 0) >= 60) life.reengage = (e.damage || 0) > 0 ? null : { target: e.targetId ?? null, at: host.now() };
      if (e.pos) dangerClose(e.pos, e.caliberMm || 0, e.targetId ?? null);
    });
    cue<{ shellId?: number; shooterId?: string; caliberMm?: number; pos?: Vec3 }>('shell:expired', (e) => {
      if (!e || !mine(e.shooterId)) return;
      if (e.shellId != null && life.ownShots.has(e.shellId)) {
        // a miss: re-engage what the sight was on when it fired
        const target = life.ownShots.get(e.shellId) ?? null;
        life.ownShots.delete(e.shellId);
        life.reengage = { target, at: host.now() };
      }
      if (e.pos) dangerClose(e.pos, e.caliberMm || 0, null);
    });
    cue<{ id?: string; shooterId?: string; shellId?: number }>('aps:intercept', (e) => {
      if (!e || !host.live()) return;
      if (mine(e.id)) host.say('aps_intercept_us', { delayS: 0.15 });
      else if (mine(e.shooterId)) {
        if (e.shellId != null) { host.forgetOwnRound(e.shellId); life.ownShots.delete(e.shellId); }
        life.reengage = { target: e.id ?? null, at: host.now() };
        host.say('aps_intercept_them', { delayS: 0.4 });
      }
    });
    cue<{ id?: string; killerId?: string }>('drone:down', (e) => {
      if (!e || !host.live()) return;
      if (mine(e.id)) host.say('drone_shot_down', { delayS: 0.35 });
      else if (mine(e.killerId)) host.say('enemy_drone_down', { delayS: 0.3 });
    });
    // a screen's source is its launcher: [vehicle, x, y, z]
    cue<{ screens?: readonly { born?: number; source?: readonly unknown[] }[] }>('auxiliary:smokeScreens', (e) => {
      const me = host.player();
      if (!e?.screens || !me || !host.live()) return;
      let newest = battle.smokeBorn;
      for (const screen of e.screens) {
        const born = Number(screen.born);
        const x = Number(screen.source?.[1]), z = Number(screen.source?.[3]);
        if (!(born > battle.smokeBorn) || !Number.isFinite(x) || !Number.isFinite(z)) continue;
        newest = Math.max(newest, born);
        if (Math.hypot(x - me.state.pos.x, z - me.state.pos.z) > SMOKE.rangeM) continue;
        for (const [id, tank] of host.tanks()) {
          if (!identifiable(id, tank) || Math.hypot(tank.pos.x - x, tank.pos.z - z) > SMOKE.hullM) continue;
          host.say('enemy_smoke', { delayS: 0.3 });
          break;
        }
      }
      battle.smokeBorn = newest;
    });
    cue<{ id?: string; isPlayer?: boolean; h?: number; speedMps?: number }>('prop:crushed', (e) => {
      if (!e || !(mine(e.id) || (e.id == null && e.isPlayer)) || !host.live()) return;
      if ((e.h ?? 0) >= 1.2 && (e.speedMps ?? 0) >= 2) host.say('obstacle_through', { prob: 0.5, delayS: 0.2 });
    });
    for (const type of CREW_MODE_EVENTS) cue<Record<string, unknown>>(`mode:${type}`, (payload) => { if (host.inBattle()) onMode(type, payload || {}); });
  }

  /** Our heavy gunship round landing by a friendly tank (not the one it hit). */
  function dangerClose(pos: Vec3, caliberMm: number, struck: string | null): void {
    if (seat() !== 'gunship' || caliberMm < GUNSHIP.heavyMm || !host.live()) return;
    for (const [id, tank] of host.tanks()) {
      if (!tank.alive || mine(id) || id === struck || !host.sameTeam(id, host.playerId())) continue;
      if (Math.hypot(tank.pos.x - pos[0], tank.pos.z - pos[2]) > GUNSHIP.dangerM) continue;
      host.say('gunship_danger_close', { delayS: 0.2 });
      return;
    }
  }

  return {
    bind,
    startBattle,
    startLife,
    onDestroyed,
    pause,
    context,
    frame(dt, listener, entities) {
      const now = host.now();
      updateReport(now);
      if (!host.live()) return;
      const me = host.player();
      if (!me) return;
      updateLay(now, listener);
      updateIdentify(now);
      updateCease(now, me);
      updateDrone(me);
      updateMobility(dt, now, me);
      updateGunship(now, entities);
    },
  };
}

/** The mode events whose crew calls live here (the engine's own handler voices the rest). Each is one the controller
 *  emits (modeSounds.ts MODE_EVENT_TYPES), so a renamed or retired event fails the typecheck here as it does in the
 *  engine's handler (round 8 Y3 s1-14); why a battle ended (mode:completed) is a fact `bind` keeps, not a call. */
const CREW_MODE_EVENTS = Object.freeze(['flag_dropped', 'flag_returned', 'flag_captured', 'zone_contested', 'goal_scored',
  'ball_reset', 'wave_started', 'counter_attack', 'line_advanced', 'infected', 'weapon_advanced'] as const satisfies readonly ModeEventType[]);
type CrewModeEvent = typeof CREW_MODE_EVENTS[number];
