import assert from 'node:assert/strict';
import {
  createLobby,
  finishLobbyRound,
  markLobbyRoundPlaying,
  serializeLobby,
} from './lobby.ts';
import { LobbyClientRuntime, LobbyHostRuntime } from './lobbyRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';

// Drain both directions of the real ordered async transport without timers.
async function flush() {
  for (let turn = 0; turn < 4; turn++) await Promise.resolve();
}

for (const mode of ['private', 'lan']) {
  const lobby = createLobby({
    roomCode: 'READY2', mode, hostId: 'host', hostName: 'Host',
    hostSpecId: 'm1a2', teamSize: 2,
  });
  const starts = [];
  const host = new LobbyHostRuntime({ lobby, onStart: (state) => starts.push(state) });
  const pair = createLoopbackTransportPair();
  const guest = new LobbyClientRuntime({ transport: pair.client });
  host.attachPeer({
    peerId: 'guest', transport: pair.host,
    player: { name: 'Guest', specId: 't90m' },
  });

  const player = (id) => lobby.players.get(id);
  const snapshot = () => serializeLobby(lobby);
  const assertSynced = () => assert.deepEqual(guest.state, snapshot(),
    `${mode}: readiness and loadout changes reach the guest as canonical room state`);
  async function command(id, value) {
    if (id === 'host') host.command(id, value);
    else assert.equal(guest.submit(value), true);
    await flush();
    assertSynced();
  }
  function assertStartBlocked() {
    const before = snapshot();
    assert.throws(() => host.command('host', { type: 'start', matchSeed: 123 }),
      (error) => error.code === 'players_not_ready');
    assert.deepEqual(snapshot(), before, 'failed start does not revise or lock the room');
    assert.equal(starts.length, 0);
  }

  try {
    await flush();
    assertSynced();
    for (const id of ['host', 'guest']) {
      await command(id, { type: 'set_ready', ready: true });
      assert.equal(player(id).ready, true);
    }

    for (const id of ['host', 'guest']) {
      const otherId = id === 'host' ? 'guest' : 'host';
      const lockedLoadout = snapshot();
      if (id === 'host') {
        assert.throws(() => host.command(id, { type: 'select_vehicle', specId: 't90' }),
          (error) => error.code === 'vehicle_locked');
      } else {
        guest.submit({ type: 'select_vehicle', specId: 't90' });
        await flush();
        assert.equal(guest.errors.at(-1).code, 'vehicle_locked');
      }
      assert.deepEqual(snapshot(), lockedLoadout, 'Ready still locks the selected loadout');

      await command(id, { type: 'set_ready', ready: false });
      assert.equal(player(id).ready, false, `${id} can withdraw readiness`);
      assert.equal(player(otherId).ready, true, 'withdrawing does not clear another player');
      assertStartBlocked();

      // This is the actual reason to withdraw: all local customization becomes
      // editable again, including team switching when capacity permits it.
      const originalTeam = player(id).team;
      const nextTeam = originalTeam === 'alpha' ? 'bravo' : 'alpha';
      await command(id, { type: 'select_vehicle', specId: 't90' });
      await command(id, { type: 'select_equipment', equipment: ['rammer', 'optics'] });
      await command(id, { type: 'select_camo', camo: 'summer' });
      await command(id, { type: 'set_team', team: nextTeam });
      assert.equal(player(id).specId, 't90');
      assert.deepEqual(player(id).equipment, ['rammer', 'optics']);
      assert.equal(player(id).camo, 'summer');
      assert.equal(player(id).team, nextTeam);
      assert.equal(player(id).ready, false, 'editing never silently re-readies a player');
      await command(id, { type: 'set_team', team: originalTeam });
      await command(id, { type: 'set_ready', ready: true });
      assert.equal(player(id).ready, true);
    }

    // Explicit ready values are idempotent even if input submits twice before
    // the display has received the first authoritative update.
    guest.submit({ type: 'set_ready', ready: false });
    guest.submit({ type: 'set_ready', ready: false });
    await flush();
    assertSynced();
    assert.equal(player('guest').ready, false);
    assertStartBlocked();
    await command('guest', { type: 'set_ready', ready: true });

    // If Start reaches the authority first, a pending Unready must not undo an
    // already-owned launch. If Unready arrives first, assertStartBlocked above
    // proves the inverse ordering. Neither side may mutate the launched roster.
    guest.submit({ type: 'set_ready', ready: false });
    host.command('host', { type: 'start', matchSeed: 123 });
    const starting = snapshot();
    await flush();
    assert.equal(guest.errors.at(-1).code, 'lobby_locked');
    assert.deepEqual(snapshot(), starting, 'late Unready cannot cancel an authorized launch');
    assertSynced();
    assert.equal(starts.length, 1, 'one authorized launch produces one transition');
    assert.equal(lobby.phase, 'starting');
    assert.equal(player('guest').ready, true);
    assert.throws(() => host.command('host', { type: 'set_ready', ready: false }),
      (error) => error.code === 'lobby_locked');
    assert.deepEqual(snapshot(), starting);

    markLobbyRoundPlaying(lobby);
    host.broadcast();
    await flush();
    const playing = snapshot();
    guest.submit({ type: 'set_ready', ready: false });
    await flush();
    assert.equal(guest.errors.at(-1).code, 'lobby_locked');
    assert.deepEqual(snapshot(), playing, 'playing rounds reject lobby readiness edits');
    assertSynced();

    // The same canonical room survives a result. Its next waiting state resets
    // votes, and both participants retain the same Ready / Not Ready contract.
    finishLobbyRound(lobby, { result: 'alpha', reason: 'elimination' });
    host.broadcast();
    await flush();
    assertSynced();
    assert.equal(lobby.phase, 'waiting');
    assert.equal(lobby.players.size, 2);
    assert.equal(lobby.round, 1);
    for (const id of ['host', 'guest']) {
      assert.equal(player(id).ready, false);
      await command(id, { type: 'set_ready', ready: true });
      await command(id, { type: 'set_ready', ready: false });
      assert.equal(player(id).ready, false, `${id} may withdraw a rematch vote`);
    }
    assert.equal(starts.length, 1, 'withdrawing a rematch vote cannot launch another round');
  } finally {
    host.close('readiness_test_complete');
    guest.close('readiness_test_complete');
  }
}

console.log('lobbyReadiness.selftest: private/LAN host and guest readiness, loadout unlock, start races, and rematch votes passed');
