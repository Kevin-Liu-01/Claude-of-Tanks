import type { EventBus } from './stateCore.ts';
import type { BattleClientAccess } from './battleClientAccess.ts';
import type { ActionId } from './input.ts';

export interface ShellCard {
  name: string;
  type: string;
  dmg: number;
  penLabel: string;
  count: number;
}

type ActionRules = Pick<BattleClientAccess,
  | 'selectShell'
  | 'repairAllModules'
  | 'magazineReloadDenialReason'
  | 'startMagazineReload'
  | 'activateSpecialAction'
  | 'guidedMissileSlot'
  | 'specialActionKind'
  | 'hasAmmunition'
  | 'shellAmmunitionCapacity'
  | 'hasConsumableRule'
  | 'cooldownRemaining'
  | 'resetConsumableCooldowns'
  | 'startConsumableCooldown'
>;
type ActionCombat = Parameters<ActionRules['selectShell']>[0];
type ActionSpec = NonNullable<Parameters<ActionRules['selectShell']>[2]>;
type ActionShell = NonNullable<ActionSpec['gun']['shells']>[number] & {
  count?: number | null;
};
type ActionSpecialEntity = NonNullable<Parameters<ActionRules['activateSpecialAction']>[0]>;

interface BattleActionSpec extends ActionSpec {
  gun: ActionSpec['gun'] & { shells: ActionShell[] };
}

export interface BattleActionEntity extends Omit<
  ActionSpecialEntity,
  'id' | 'spec' | 'combat' | 'input'
> {
  id: string;
  spec: BattleActionSpec;
  combat: ActionCombat | null;
  input: { shellSlot: number };
}

interface BattleActionGame<TEntity extends BattleActionEntity> {
  phase: string;
  timeS: number;
  player: TEntity | null;
}

interface ActionInput {
  onAction(actionId: ActionId, listener: () => void): () => void;
}

interface NetworkActionPort {
  isActive(): boolean;
  queueConsumable(slot: number): void;
  queueAction(action: 'reloadMagazine' | 'specialAction'): void;
}

export interface PlayerBattleActionsOptions<TEntity extends BattleActionEntity> {
  game: BattleActionGame<TEntity>;
  bus: EventBus;
  input: ActionInput;
  rules: ActionRules;
  network: NetworkActionPort;
  isSettingsOpen(): boolean;
}

export interface PlayerBattleActions {
  readonly shellCards: ShellCard[];
  setTank(spec: BattleActionSpec): ShellCard[];
  hasAmmo(slot: number): boolean;
  resetConsumables(): void;
  dispose(): void;
}

const SHELL_ACTIONS = ['shell1', 'shell2', 'shell3'] as const;
const CONSUMABLE_ACTIONS = ['consumable1', 'consumable2', 'consumable3'] as const;

function hasLiveCombat<TEntity extends BattleActionEntity>(
  player: TEntity | null,
): player is TEntity & { combat: ActionCombat } {
  return !!player?.combat && !player.combat.destroyed;
}

/**
 * Own the player's ammunition, consumables, and action routing.
 *
 * The module is intentionally DOM- and Three-free. Local simulation rules and
 * the multiplayer command lane are ports, so the same public interface can be
 * exercised in Node without importing the battle renderer or authority.
 */
export function createPlayerBattleActions<TEntity extends BattleActionEntity>({
  game,
  bus,
  input,
  rules,
  network,
  isSettingsOpen,
}: PlayerBattleActionsOptions<TEntity>): PlayerBattleActions {
  if (!game || !bus || !input || !rules || !network
      || typeof isSettingsOpen !== 'function') {
    throw new TypeError('player battle actions require game, bus, input, rules, and network ports');
  }

  const shellCards: ShellCard[] = [];
  const consumableReadyAt = [0, 0, 0];
  const disposeCallbacks: Array<() => void> = [];
  const listen = (event: string, listener: (payload: unknown) => void): void => {
    disposeCallbacks.push(bus.on(event, listener));
  };
  const onAction = (action: ActionId, listener: () => void): void => {
    disposeCallbacks.push(input.onAction(action, listener));
  };

  const battleInputAllowed = (): boolean =>
    game.phase === 'battle' && !isSettingsOpen();
  const livePlayer = (): (TEntity & { combat: ActionCombat }) | null => {
    const player = game.player;
    return hasLiveCombat(player) ? player : null;
  };
  const syncShellCards = (): void => {
    const combat = game.player?.combat;
    if (!combat || !Array.isArray(combat.ammo)) return;
    for (let slot = 0; slot < shellCards.length; slot++) {
      shellCards[slot].count = Math.max(0, Math.floor(combat.ammo[slot] || 0));
    }
  };

  for (let slot = 0; slot < 3; slot++) {
    onAction(SHELL_ACTIONS[slot], () => {
      if (!battleInputAllowed()) return;
      bus.emit('ui:shellSelect', { slot });
      bus.emit('ui:click', {});
    });
  }

  onAction('reloadMagazine', () => {
    if (!battleInputAllowed()) return;
    bus.emit('ui:magazineReload', {});
  });

  onAction('specialAction', () => {
    if (!battleInputAllowed()) return;
    bus.emit('ui:specialAction', {});
  });

  for (let slot = 0; slot < 3; slot++) {
    onAction(CONSUMABLE_ACTIONS[slot], () => {
      if (!battleInputAllowed()) return;
      bus.emit('ui:consumable', { slot });
    });
  }

  listen('ui:consumable', (payload) => {
    const slot = Number((payload as { slot?: unknown } | null)?.slot);
    const player = battleInputAllowed() ? livePlayer() : null;
    if (!player || !Number.isInteger(slot) || !rules.hasConsumableRule(slot)) return;
    if (network.isActive()) {
      network.queueConsumable(slot);
      bus.emit('ui:click', {});
      return;
    }
    const remainingS = rules.cooldownRemaining(game.timeS, consumableReadyAt[slot]);
    if (remainingS > 0) {
      bus.emit('ui:consumableDenied', { slot, reason: 'COOLDOWN', remainingS });
      return;
    }
    const combat = player.combat;
    let used = false;
    if (slot === 0) {
      for (const name of rules.repairAllModules(combat)) {
        bus.emit('module:state', { id: player.id, module: name, state: 'ok' });
        used = true;
      }
    } else if (slot === 1) {
      for (const name of Object.keys(combat.crew)) {
        if (combat.crew[name] === false) {
          combat.crew[name] = true;
          used = true;
        }
      }
    } else if (slot === 2 && combat.fire.burning) {
      combat.fire.burning = false;
      combat.fire.ticksLeft = 0;
      combat.fire.tickTimer = 0;
      bus.emit('tank:fire', { id: player.id, burning: false });
      used = true;
    }
    if (!used) {
      bus.emit('ui:consumableDenied', { slot, reason: 'NOTHING' });
      return;
    }
    const cooldown = rules.startConsumableCooldown(consumableReadyAt, slot, game.timeS);
    bus.emit('ui:consumableUsed', { slot, ...cooldown });
    bus.emit('ui:click', {});
  });

  onAction('minimapZoom', () => {
    if (game.phase === 'battle') bus.emit('ui:minimapZoom', {});
  });

  onAction('shotLog', () => {
    if (game.phase === 'battle') bus.emit('ui:shotLog', {});
  });

  listen('ui:shellSelect', (payload) => {
    const slot = Number((payload as { slot?: unknown } | null)?.slot);
    const player = livePlayer();
    if (!player || !Number.isInteger(slot) || slot < 0) return;
    if (slot === player.combat.shellSlot && player.combat.magazine &&
        player.spec.gun.shells[slot]?.guided !== true) {
      bus.emit('ui:magazineReload', {});
      return;
    }
    rules.selectShell(player.combat, slot, player.spec);
    player.input.shellSlot = slot;
  });

  listen('ui:magazineReload', () => {
    const player = battleInputAllowed() ? livePlayer() : null;
    if (!player) return;
    if (network.isActive()) network.queueAction('reloadMagazine');
    else {
      const reason = rules.magazineReloadDenialReason?.(player.combat) || null;
      const started = !reason && rules.startMagazineReload(player.combat, player.spec);
      bus.emit(started ? 'ui:magazineReloadStarted' : 'ui:magazineReloadDenied', {
        reason: reason || 'NO_MAGAZINE',
      });
    }
    bus.emit('ui:click', {});
  });

  listen('ui:specialAction', () => {
    const player = battleInputAllowed() ? livePlayer() : null;
    if (!player) return;
    if (rules.specialActionKind(player.spec) === 'guided_missile') {
      const slot = rules.guidedMissileSlot(player.spec);
      if (slot < 0) return;
      bus.emit('ui:shellSelect', { slot, source: 'specialAction' });
      bus.emit('ui:specialActionResult', {
        ok: true,
        kind: 'guided_missile',
        active: false,
        slot,
      });
    } else if (network.isActive()) network.queueAction('specialAction');
    else {
      const result = rules.activateSpecialAction(player);
      bus.emit(result.ok ? 'ui:specialActionResult' : 'ui:specialActionDenied', result);
    }
    bus.emit('ui:click', {});
  });

  listen('shell:fired', (payload) => {
    if (!(payload as { isPlayer?: unknown } | null)?.isPlayer || !game.player?.combat) return;
    syncShellCards();
  });
  listen('mode:pickup_collected', syncShellCards);

  return {
    shellCards,
    setTank(spec) {
      shellCards.length = 0;
      for (const shell of spec.gun.shells) {
        shellCards.push({
          name: shell.name,
          type: shell.type,
          dmg: shell.dmg,
          penLabel: `${Math.round(shell.pen100Mm)} mm`,
          count: rules.shellAmmunitionCapacity(shell),
        });
      }
      return shellCards;
    },
    hasAmmo(slot) {
      const combat = game.player?.combat;
      if (combat) {
        syncShellCards();
        return rules.hasAmmunition(combat, slot);
      }
      const card = shellCards[slot];
      return shellCards.length === 0 || ((card?.count ?? 0) | 0) > 0;
    },
    resetConsumables() {
      rules.resetConsumableCooldowns(consumableReadyAt);
    },
    dispose() {
      for (const dispose of disposeCallbacks.splice(0)) dispose();
    },
  };
}
