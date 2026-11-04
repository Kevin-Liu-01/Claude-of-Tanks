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
 */

import { AERIAL_RULES, GUN_GAME_WEAPONS, matchRulesetFor } from '../sim/matchRuleset.ts';
import type { GameModeId } from '../sim/gameModeCatalog.ts';
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
  combat?: { destroyed?: boolean; shellSlot?: number };
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
  /** In a battle that has rolled out and not ended, our tank alive. */
  live(): boolean;
  /** In a battle's countdown (rolled out or not), not ended. */
  inBattle(): boolean;
  playerId(): string | null;
  player(): CrewPlayer | null;
  tanks(): ReadonlyMap<string, CrewTank>;
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
/** "Cease fire" after a kill when no spotted enemy stands within this range, this long after the kill call. */
const CEASE = Object.freeze({ rangeM: 1500, afterS: 2.4 });
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
const GUNSHIP = Object.freeze({ dangerM: 35, heavyMm: 100, missionRounds: 3, missionQuietS: 7, shiftM: 150, shiftS: 25 });

export interface CrewProcedure {
  bind(on: On): void;
  frame(dt: number, listener: CrewListener | null, entities: readonly CrewFrameEntity[]): void;
  /** The context the engine resolves each line in (voiceLines.ts resolveCrewLine). */
  context(): CrewLineContext;
  /** The rollout's start, a new battle's reset. */
  reset(): void;
}

/** A hull of the frame's list, for the AC-130's extraction (mode-active hulls leave the field when extracted). */
export interface CrewFrameEntity {
  readonly id: string;
  readonly modeActive?: boolean;
  readonly combat?: { readonly destroyed?: boolean };
}

function ammoCall(shell: { type?: unknown; guided?: unknown } | undefined): string {
  const type = String(shell?.type || '');
  return shell?.guided ? 'fire_command_missile' : type === 'HEAT' ? 'fire_command_heat'
    : type === 'HE' || type === 'HESH' ? 'fire_command_he' : 'fire_command_kinetic';
}

export function createCrewProcedure(host: CrewProcedureHost): CrewProcedure {
  // ---- battle state (reset per battle)
  const spotted = new Set<string>();
  let turned = false;
  let kickoffAt = -1e9;
  let endReason: string | null = null;
  let loaded = true;
  // the lay: the enemy under our sight and since when; the last fire command and its target
  let layId: string | null = null;
  let layFrom = 0;
  const commandedAt = new Map<string, number>();
  let commandAt = -1e9;
  let commandTarget: string | null = null;
  let identifyUntil = -1;
  let commandedShotAt = -1e9;
  let ownShotAt = -1e9;
  // a round that left its target alive (shell id → target), the re-engage it asks for
  const ownShots = new Map<number, string | null>();
  let reengage: { target: string | null; at: number } | null = null;
  let ceaseAt = -1;
  // threats that make backing out the driver's call; the jump's airtime
  let threatAt = -1e9;
  let reverseCalled = false;
  let airS = 0;
  let jumped = false;
  // our drone's flight
  let droneFlying = false;
  let batteryCalled = false;
  let linkCalled = false;
  let recalling = false;
  let smokeBorn = -1;
  // the countdown's crew report
  let reported = false;
  let readyUntil = -1;
  // the AC-130's fire mission and extraction
  let heavyRounds = 0;
  let lastHeavyAt = -1e9;
  let lastKill: { x: number; z: number; at: number } | null = null;
  const extracted = new Map<string, boolean>();
  // whether the mode lights every hull (read once per mode, not per frame)
  let visibleMode: string | null = null;
  let visibleAll = false;

  function reset(): void {
    spotted.clear();
    turned = false;
    kickoffAt = -1e9;
    endReason = null;
    loaded = true;
    layId = null;
    commandedAt.clear();
    commandAt = -1e9;
    commandTarget = null;
    identifyUntil = -1;
    commandedShotAt = -1e9;
    ownShotAt = -1e9;
    ownShots.clear();
    reengage = null;
    ceaseAt = -1;
    threatAt = -1e9;
    reverseCalled = false;
    airS = 0;
    jumped = false;
    droneFlying = false;
    batteryCalled = linkCalled = recalling = false;
    smokeBorn = -1;
    reported = false;
    readyUntil = -1;
    heavyRounds = 0;
    lastHeavyAt = -1e9;
    lastKill = null;
    extracted.clear();
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
      turned,
      kickoff: host.now() - kickoffAt < 3,
      endReason,
    };
  }

  const mine = (id: string | null | undefined): boolean => id != null && id === host.playerId();
  const enemyOf = (id: string | null | undefined): boolean => id != null && !mine(id) && !host.sameTeam(id, host.playerId());

  /** An enemy our crew can name: alive, and seen by our side (or every hull shows, as the mode lights them). */
  function identifiable(id: string, tank: CrewTank): boolean {
    if (!tank.alive || !enemyOf(id)) return false;
    const mode = host.mode();
    if (mode !== visibleMode) { visibleMode = mode; visibleAll = !!matchRulesetFor(mode).alwaysVisible; }
    return visibleAll || spotted.has(id);
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
    const target = listener && me && !flyingDrone && (loaded || gunship) ? laidOn(listener) : null;
    if (target !== layId) { layId = target; layFrom = now; }
    if (!target || now - layFrom < LAY.holdS) return;
    const last = commandedAt.get(target);
    if (last != null && now - last < LAY.sameTargetS) return;
    let id: string;
    if (gunship) {
      // the sensor picks up the target; after a kill, a target far from it is a shift of fire
      const t = host.tanks().get(target);
      id = lastKill && t && now - lastKill.at < GUNSHIP.shiftS && Math.hypot(t.pos.x - lastKill.x, t.pos.z - lastKill.z) > GUNSHIP.shiftM
        ? 'gunship_shift_fire' : 'fire_command_kinetic';
      if (id === 'gunship_shift_fire') lastKill = null;
    } else {
      const slot = me?.combat?.shellSlot ?? 0;
      id = ammoCall(me?.spec?.gun?.shells?.[slot]);
    }
    commandedAt.set(target, now);
    if (!host.say(id, { delayS: 0.05 })) return;
    commandAt = now;
    commandTarget = target;
    identifyUntil = gunship ? -1 : now + IDENTIFY_S + 2;
  }

  /** The gunner's answer, once the commander's command has been spoken and the net is free, still laid on and not yet
   *  fired (after the shot it would follow the result). */
  function updateIdentify(now: number): void {
    if (identifyUntil < 0) return;
    if (now > identifyUntil || ownShotAt >= commandAt) { identifyUntil = -1; return; }
    if (!host.radioQuiet()) return;
    const last = host.lastTransmission();
    identifyUntil = -1;
    if (last && last.id.startsWith('fire_command_') && last.t >= commandAt - 0.01 && layId === commandTarget) host.say('identified');
  }

  // ------------------------------------------------------- per frame ---

  function updateDrone(me: CrewPlayer): void {
    const view = me.aerial;
    const flying = view?.kind === 'drone' && !!view.active;
    if (flying && !droneFlying) { batteryCalled = linkCalled = recalling = false; }
    if (flying && view) {
      if ((view.recallS ?? 0) > 0 || (view.returnS ?? 0) > 0) recalling = true;
      const battery = view.batteryS ?? DRONE.batteryS;
      // (a drone with a second or two left is about to be lost: that is the call then)
      if (!recalling && !batteryCalled && battery < DRONE_WARN.batteryS && battery >= DRONE_WARN.lastS) {
        batteryCalled = true;
        host.say('drone_battery_low', { delayS: 0.1 });
      }
      const range = Math.hypot((view.x ?? me.state.pos.x) - me.state.pos.x, (view.z ?? me.state.pos.z) - me.state.pos.z);
      if (!recalling && !linkCalled && range >= DRONE.rangeM * DRONE_WARN.linkShare) {
        linkCalled = true;
        host.say('drone_link_weak', { delayS: 0.1 });
      }
    } else if (droneFlying && recalling && !me.combat?.destroyed) host.say('drone_recovered', { delayS: 0.4 });
    droneFlying = flying;
  }

  function updateMobility(dt: number, now: number, me: CrewPlayer): void {
    if (seat() !== 'tank' || me.aerial?.active) { airS = 0; return; }
    const speed = Number(me.state.speed) || 0;
    if (speed < -REVERSE.mps && now - threatAt < REVERSE.afterS && !reverseCalled) {
      reverseCalled = true;
      host.say('reversing', { delayS: 0.1 });
    }
    if (speed > -0.5) reverseCalled = false;
    if (me.state.grounded === false && !me.state.overturned) {
      airS += dt;
      if (airS >= JUMP_S && !jumped) { jumped = true; host.say('jump_brace'); }
    } else { airS = 0; jumped = false; }
  }

  function updateGunship(now: number, entities: readonly CrewFrameEntity[]): void {
    if (seat() !== 'gunship') return;
    if (heavyRounds >= GUNSHIP.missionRounds && now - lastHeavyAt > GUNSHIP.missionQuietS) {
      heavyRounds = 0;
      host.say('gunship_rounds_complete');
    }
    // a friendly that leaves the field alive has reached the extraction point
    for (const entity of entities) {
      if (!entity || mine(entity.id) || !host.sameTeam(entity.id, host.playerId())) continue;
      const out = entity.modeActive === false && !entity.combat?.destroyed;
      const was = extracted.get(entity.id);
      extracted.set(entity.id, out);
      if (out && was === false) host.say('gunship_friendly_extracted', { delayS: 0.3 });
    }
  }

  /** "Cease fire": the kill call has been made and no spotted enemy stands near. */
  function updateCease(now: number, me: CrewPlayer): void {
    if (ceaseAt < 0 || now < ceaseAt) return;
    ceaseAt = -1;
    for (const [id, tank] of host.tanks()) {
      if (!identifiable(id, tank)) continue;
      if (Math.hypot(tank.pos.x - me.state.pos.x, tank.pos.z - me.state.pos.z) < CEASE.rangeM) return;
    }
    host.say('cease_fire');
  }

  function updateReport(now: number): void {
    if (readyUntil < 0) return;
    if (now > readyUntil) { readyUntil = -1; return; }
    if (!host.radioQuiet()) return;
    const last = host.lastTransmission();
    readyUntil = -1;
    if (last?.id === 'crew_report') host.say('crew_ready');
  }

  // ------------------------------------------------------------ events ---

  function onMode(type: string, payload: Record<string, unknown>): void {
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
        kickoffAt = host.now();
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
        if (mine(payload.id as string)) { turned = true; host.say('infected_turned', { delayS: 0.8 }); }
        else if (!turned && host.sameTeam(payload.id as string, host.playerId())) host.say('ally_infected', { delayS: 0.3 });
        break;
      case 'weapon_advanced': {
        const final = Number(payload.stage) >= LADDER_FINAL;
        if (!final) break;
        if (mine(payload.id as string)) host.say('gun_game_final', { delayS: 2.2 });
        else if (enemyOf(payload.id as string)) host.say('enemy_final_weapon', { delayS: 0.3 });
        break;
      }
      case 'completed':
        if (typeof payload.reason === 'string') endReason = payload.reason;
        break;
      default:
        break;
    }
  }

  function bind(on: On): void {
    on<{ phase?: string }>('phase:change', (e) => { if (e?.phase === 'battle') reset(); });
    on<{ reason?: string }>('battle:ended', (e) => { if (typeof e?.reason === 'string') endReason = e.reason; });
    on<{ seconds?: number }>('battle:countdown', (e) => {
      if (reported || !host.inBattle() || typeof e?.seconds !== 'number') return;
      reported = true;
      // a count long enough for the report and its answer before the rollout's call
      if (e.seconds >= 4 && host.say('crew_report')) readyUntil = host.now() + 3;
    });
    on<{ id: string; team?: string; spotterId?: string | null }>('tank:spotted', (e) => {
      // seen by our side (the event's team is the spotting side)
      if (!e?.id || !enemyOf(e.id) || e.team == null || e.team !== host.player()?.team) return;
      spotted.add(e.id);
      const boss = host.bossId();
      if (boss != null && e.id === boss && !mine(boss) && host.live()) host.say('juggernaut_spotted', { delayS: 0.1 });
    });
    on<undefined>('player:spotted', () => { threatAt = host.now() + 3; });
    on<{ shellId?: number; shooterId?: string; isPlayer?: boolean; caliberMm?: number; weaponSound?: string }>('shell:fired', (e) => {
      if (!e?.isPlayer || !host.live()) return;
      const now = host.now();
      const caliber = e.caliberMm || 0;
      ownShotAt = now;
      if (e.weaponSound === 'gunship-missile') host.say('gunship_rifle', { delayS: 0.1 });
      else if (seat() === 'tank' && caliber >= 60 && now - commandAt < COMMANDED_SHOT_S && now - commandedShotAt > COMMANDED_SHOT_S) {
        // the shot the fire command called for: "on the way"
        commandedShotAt = now;
        host.say('firing', { delayS: 0.08 });
      }
      if (seat() === 'gunship' && caliber >= GUNSHIP.heavyMm) { heavyRounds++; lastHeavyAt = now; }
      if (caliber >= 60 && e.shellId != null) {
        if (ownShots.size >= 12) ownShots.delete(ownShots.keys().next().value as number);
        ownShots.set(e.shellId, layId);
      }
    });
    on<{ total?: number; done?: boolean; progress?: number }>('player:reload', (e) => {
      if (!e) return;
      const done = !!e.done || (e.progress ?? 0) >= 1;
      loaded = done;
      if (!done || !reengage || !host.live() || seat() !== 'tank') return;
      const { target, at } = reengage;
      reengage = null;
      if (host.now() - at > REENGAGE_S) return;
      // the round's own target, or what the sight was on when it fired; a miss at nothing is not re-engaged
      const t = target ? host.tanks().get(target) : null;
      if (t?.alive) host.say('re_engage', { delayS: 0.15 });
    });
    on<undefined>('ui:magazineReloadStarted', () => { loaded = false; });
    on<{ targetId?: string | null; attackerId?: string | null; damage?: number; destroyed?: boolean; shellId?: number; caliberMm?: number; pos?: Vec3 }>('shell:hit', (e) => {
      if (!e) return;
      if (mine(e.targetId) && host.live()) threatAt = host.now();
      if (!mine(e.attackerId)) return;
      if (e.shellId != null) ownShots.delete(e.shellId);
      // the main gun's round left an enemy standing: the commander will order it again
      if (!e.destroyed && enemyOf(e.targetId) && (e.caliberMm || 0) >= 60) reengage = (e.damage || 0) > 0 ? null : { target: e.targetId ?? null, at: host.now() };
      if (e.pos) dangerClose(e.pos, e.caliberMm || 0, e.targetId ?? null);
    });
    on<{ shellId?: number; shooterId?: string; caliberMm?: number; pos?: Vec3 }>('shell:expired', (e) => {
      if (!e || !mine(e.shooterId)) return;
      if (e.shellId != null && ownShots.has(e.shellId)) {
        // a miss: re-engage what the sight was on when it fired
        const target = ownShots.get(e.shellId) ?? null;
        ownShots.delete(e.shellId);
        reengage = { target, at: host.now() };
      }
      if (e.pos) dangerClose(e.pos, e.caliberMm || 0, null);
    });
    on<{ id?: string; shooterId?: string; shellId?: number }>('aps:intercept', (e) => {
      if (!e || !host.live()) return;
      if (mine(e.id)) host.say('aps_intercept_us', { delayS: 0.15 });
      else if (mine(e.shooterId)) {
        if (e.shellId != null) { host.forgetOwnRound(e.shellId); ownShots.delete(e.shellId); }
        reengage = { target: e.id ?? null, at: host.now() };
        host.say('aps_intercept_them', { delayS: 0.4 });
      }
    });
    on<{ id?: string; killerId?: string }>('drone:down', (e) => {
      if (!e || !host.live()) return;
      if (mine(e.id)) host.say('drone_shot_down', { delayS: 0.35 });
      else if (mine(e.killerId)) host.say('enemy_drone_down', { delayS: 0.3 });
    });
    on<{ id: string; killerId?: string | null; pos?: Vec3; source?: string }>('tank:destroyed', (e) => {
      if (!e || !mine(e.killerId)) return;
      if (e.source === 'ac130' && e.pos) lastKill = { x: e.pos[0], z: e.pos[2], at: host.now() };
      else if (!e.source && seat() === 'tank') ceaseAt = host.now() + CEASE.afterS;
      reengage = null;
    });
    // a screen's source is its launcher: [vehicle, x, y, z]
    on<{ screens?: readonly { born?: number; source?: readonly unknown[] }[] }>('auxiliary:smokeScreens', (e) => {
      const me = host.player();
      if (!e?.screens || !me || !host.live()) return;
      let newest = smokeBorn;
      for (const screen of e.screens) {
        const born = Number(screen.born);
        const x = Number(screen.source?.[1]), z = Number(screen.source?.[3]);
        if (!(born > smokeBorn) || !Number.isFinite(x) || !Number.isFinite(z)) continue;
        newest = Math.max(newest, born);
        if (Math.hypot(x - me.state.pos.x, z - me.state.pos.z) > SMOKE.rangeM) continue;
        for (const [id, tank] of host.tanks()) {
          if (!identifiable(id, tank) || Math.hypot(tank.pos.x - x, tank.pos.z - z) > SMOKE.hullM) continue;
          host.say('enemy_smoke', { delayS: 0.3 });
          break;
        }
      }
      smokeBorn = newest;
    });
    on<{ id?: string; isPlayer?: boolean; h?: number; speedMps?: number }>('prop:crushed', (e) => {
      if (!e || !(mine(e.id) || (e.id == null && e.isPlayer)) || !host.live()) return;
      if ((e.h ?? 0) >= 1.2 && (e.speedMps ?? 0) >= 2) host.say('obstacle_through', { prob: 0.5, delayS: 0.2 });
    });
    for (const type of MODE_EVENTS) on<Record<string, unknown>>(`mode:${type}`, (payload) => { if (host.inBattle()) onMode(type, payload || {}); });
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
    reset,
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

/** The mode events whose crew calls live here (the engine's own handler voices the rest). */
const MODE_EVENTS = Object.freeze(['flag_dropped', 'flag_returned', 'flag_captured', 'zone_contested', 'goal_scored', 'ball_reset',
  'wave_started', 'counter_attack', 'line_advanced', 'infected', 'weapon_advanced', 'completed']);
