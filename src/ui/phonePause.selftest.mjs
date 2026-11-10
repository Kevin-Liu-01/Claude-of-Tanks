// round 8 Y4 s3-05: one rule for a phone's Pause. The single pairing's port (settings.ts) opened the menu or closed it
// with { noRelock: true }, its stated rule that a phone's resume never asks for the pointer without a gesture; the couch
// seats' port (main.ts) called settings.toggle(), whose close asked for the pointer lock with no desktop gesture, and a
// refused request raised the click-to-resume veil over the shared screen that no phone could clear. Both ports now run
// togglePhonePause (src/ui/phonePause.ts), each keeping its own guard: the single pairing isBattleActive (the player's own
// battle settings), the couch seats stateCore's couchSeatsActive(game) (a dead seat 1 must not take Pause from the other
// seats; round 8 merge review r1: the couch session's own reader, not any battle phase, since the lobby outlives its
// battles; couchRuntime.selftest drives the port).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every phone pause port runs the helper with its own guard, and none toggles the settings panel itself.
{
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const ports = [
    ['main.ts', read('../main.ts'), /togglePause: \(\) => togglePhonePause\(settings, \(\) => couchSeatsActive\(game\)\),/],
    ['settings.ts', read('./settings.ts'), /togglePause: \(\) => togglePhonePause\(\{[^\n]*\}, isBattleActive\),/],
  ];
  for (const [name, source, binding] of ports) {
    const lines = source.split('\n').filter((line) => /\btogglePause: /.test(line));
    assert.ok(lines.length >= 1, `${name} binds a phone pause port`);
    for (const line of lines) {
      assert.match(line, /togglePhonePause\(/, `${name}: every phone pause port runs the one rule (${line.trim()})`);
      assert.doesNotMatch(line, /\.toggle\(\)/, `${name}: no phone pause port toggles the settings panel (its close relocks)`);
    }
    assert.match(source, binding, `${name}: the port keeps its own guard`);
  }
}

// The helper (imported after the guard, the red-on-base proof: H8 has no helper): the first press opens, the second
// closes with exactly { noRelock: true }, a false guard does nothing.
{
  const { togglePhonePause } = await import('./phonePause.ts');
  const calls = [];
  let open = false;
  const settings = {
    isOpen: () => open,
    open: () => { calls.push(['open']); open = true; },
    close: (...args) => { calls.push(['close', ...args]); open = false; },
  };
  let canPause = true;
  togglePhonePause(settings, () => canPause);
  togglePhonePause(settings, () => canPause);
  assert.deepEqual(calls, [['open'], ['close', { noRelock: true }]], 'open, then close with no relock and nothing else');
  canPause = false;
  togglePhonePause(settings, () => canPause);
  open = true;
  togglePhonePause(settings, () => canPause);
  assert.equal(calls.length, 2, 'outside its guard a phone pause neither opens nor closes the menu');
}

console.log('phonePause.selftest: one phone pause rule (open, or close with no relock, inside each port\'s guard) for the single pairing and every couch seat passed');
