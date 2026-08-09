import { getLastBattleEarnings, installBattleEconomy } from './economy.js';

const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
};

const listeners = new Map();
const bus = {
  on(event, fn) {
    const list = listeners.get(event) || [];
    list.push(fn);
    listeners.set(event, list);
  },
  emit(event, payload) {
    for (const fn of listeners.get(event) || []) fn(payload);
  },
};

installBattleEconomy(bus);
installBattleEconomy(bus); // must not double-register during HMR/re-init
bus.emit('ui:battleStart', { specId: 'player' });
bus.emit('shell:hit', { attackerId: 'player', targetId: 'enemy', damage: 100 });
bus.emit('shell:hit', { attackerId: 'enemy', targetId: 'player', damage: 500 });
bus.emit('tank:destroyed', { killerId: 'player', id: 'enemy' });
bus.emit('battle:ended', { result: 'victory' });

const earnings = getLastBattleEarnings();
if (!earnings || earnings.xp !== 454 || earnings.credits !== 9520
    || earnings.kills !== 1 || earnings.damage !== 100) {
  throw new Error(`unexpected battle payout: ${JSON.stringify(earnings)}`);
}

const wallet = JSON.parse(saved.get('cot_progress_v1'));
if (wallet.xp !== 1354 || wallet.credits !== 29520) {
  throw new Error(`wallet was not persisted once: ${JSON.stringify(wallet)}`);
}

console.log('economy selftest passed');
