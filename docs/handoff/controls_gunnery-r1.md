# controls_gunnery r1 handoff — required edits outside src/game/input.js / src/ui/settings.js

The input layer (src/game/input.js) and settings panel (src/ui/settings.js) were upgraded this
round: primary + secondary keyboard bindings, unbind (right-click chip), hold-Esc-to-bind-Escape,
wheel as bindable codes (`WheelUp`/`WheelDown`), full gamepad support (left stick drive / right
stick aim / bindable buttons, `cot.padBindings.v1`), consumable actions `consumable1..3`
(defaults Digit4/5/6), zoom actions `zoomIn`/`zoomOut` (defaults WheelUp/WheelDown), aim-smoothing
and pad-sensitivity settings, and a `ui:bindingsChanged` bus broadcast carrying live shell +
consumable hotkey labels.

The following edits in OTHER modules complete the fixes. Items 1–3 close the two MAJOR critic
findings (phantom Digit1-3 hotkeys; decorative consumable slots) — please apply them together.

---

## 1. src/ui/hud.js — delete the hardcoded Digit1-3 listener (MAJOR)

Remove this whole block (currently ~lines 461–469):

```js
  window.addEventListener('keydown', (e) => {
    if (mode === 'hidden') return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const slot = Number(e.code.slice(-1)) - 1;
      selectSlot(slot);
      bus.emit('ui:shellSelect', { slot });
      bus.emit('ui:click', {});
    }
  });
```

Shell hotkeys must flow ONLY through the input layer's `shell1..3` actions (see main.js edit #3).
The HUD then renders selection state from the bus. Add next to the existing `bus.on('shell:hit', ...)`
handlers (~line 1247):

```js
  bus.on('ui:shellSelect', ({ slot }) => selectSlot(slot));
```

(The tray click handler may keep its direct `selectSlot(i)` call — it is idempotent.)

## 2. src/ui/hud.js — make the shell/consumable tray honest (MAJOR)

a) Collect the consumable slot elements when they are built (~line 404), mirroring `slotEls`:

```js
  const conEls = [];
  for (let i = 0; i < CONSUMABLES.length; i++) {
    ...existing element construction...
    conEls.push(s);
  }
```

b) Live hotkey labels — the tray currently hardcodes `1/2/3` and `4/5/6`. settings.js now emits
`ui:bindingsChanged` (at boot and after every rebind/clear/reset) with display labels. Subscribe
near the other bus handlers:

```js
  bus.on('ui:bindingsChanged', (p) => {
    if (!p) return;
    if (Array.isArray(p.shells)) {
      for (let i = 0; i < 3 && i < p.shells.length; i++) {
        const k = slotEls[i].querySelector('.key');
        if (k) k.textContent = p.shells[i];
      }
    }
    if (Array.isArray(p.consumables)) {
      for (let i = 0; i < conEls.length && i < p.consumables.length; i++) {
        const k = conEls[i].querySelector('.key');
        if (k) k.textContent = p.consumables[i];
      }
    }
  });
```

Note: initHud runs before createSettings in main.js, so the boot-time emit is received.

c) Used-state rendering for consumables (wired in main.js edit #4):

```js
  bus.on('ui:consumableUsed', ({ slot }) => {
    if (conEls[slot]) conEls[slot].classList.add('used');
  });
  bus.on('ui:consumableReset', () => {
    for (const c of conEls) c.classList.remove('used');
  });
```

CSS (append to the `.cot-con` rules):

```css
.cot-con.used{opacity:.35;filter:grayscale(1);pointer-events:none;}
```

## 3. src/main.js — shell slots: single code path (MAJOR, pairs with #1)

Replace the current block (~lines 264–273):

```js
// Rebindable shell slots. The HUD keeps its own hardcoded Digit1-3 hotkeys, so
// skip those codes here to avoid double-firing on the default bindings.
for (let slot = 0; slot < 3; slot++) {
  input.onAction(`shell${slot + 1}`, (code) => {
    if (game.phase !== 'battle' || settings.isOpen()) return;
    if (code === `Digit${slot + 1}`) return; // HUD hotkey path already handled it
    bus.emit('ui:shellSelect', { slot });
    bus.emit('ui:click', {});
  });
}
```

with:

```js
// Rebindable shell slots — the ONLY hotkey path (HUD renders from ui:shellSelect).
for (let slot = 0; slot < 3; slot++) {
  input.onAction(`shell${slot + 1}`, () => {
    if (game.phase !== 'battle' || settings.isOpen()) return;
    bus.emit('ui:shellSelect', { slot });
    bus.emit('ui:click', {});
  });
}
```

## 4. src/main.js — implement consumables (MAJOR)

Add below the shell-slot wiring. One use per battle each (WoT-style), no-op preserved if there
is nothing to fix:

```js
// Consumables — rebindable actions (Digit4/5/6 default, HUD tray clickable).
// 0 = Repair Kit (all modules to full), 1 = First Aid (revive crew),
// 2 = Fire Extinguisher. Single use per battle each.
const consumableUsed = [false, false, false];
for (let slot = 0; slot < 3; slot++) {
  input.onAction(`consumable${slot + 1}`, () => {
    if (game.phase !== 'battle' || settings.isOpen()) return;
    bus.emit('ui:consumable', { slot });
  });
}
bus.on('ui:consumable', ({ slot }) => {
  const p = game.player;
  if (game.phase !== 'battle' || !p || !p.combat || p.combat.destroyed) return;
  if (slot < 0 || slot > 2 || consumableUsed[slot]) return;
  const c = p.combat;
  let ok = false;
  if (slot === 0) {
    for (const name of Object.keys(c.modules)) {
      const m = c.modules[name];
      if (m.state !== 'ok') {
        m.hp = m.maxHp; m.state = 'ok'; m.repairT = 0;
        bus.emit('module:state', { id: p.id, module: name, state: 'ok' });
        ok = true;
      }
    }
  } else if (slot === 1) {
    for (const name of Object.keys(c.crew)) {
      if (c.crew[name] === false) { c.crew[name] = true; ok = true; }
    }
  } else if (slot === 2 && c.fire.burning) {
    c.fire.burning = false;
    c.fire.ticksLeft = 0;
    bus.emit('tank:fire', { id: p.id, burning: false });
    ok = true;
  }
  if (!ok) return; // nothing to repair/heal/extinguish — kit not consumed
  consumableUsed[slot] = true;
  bus.emit('ui:consumableUsed', { slot });
  bus.emit('ui:click', {});
});
```

And inside `startBattle(specId)` (after `game.phase = 'battle';`):

```js
  consumableUsed[0] = consumableUsed[1] = consumableUsed[2] = false;
  bus.emit('ui:consumableReset', {});
```

## 5. src/main.js — wheel zoom through the rebindable layer (minor)

The input layer now translates wheel notches into `zoomIn`/`zoomOut` action presses
(codes `WheelUp`/`WheelDown`, rebindable to any key for keyboard zoom stepping).
Replace the raw listener (~lines 248–250):

```js
window.addEventListener('wheel', (e) => {
  if (game.phase === 'battle' && !settings.isOpen()) wheelStep = e.deltaY < 0 ? 1 : -1;
}, { passive: true });
```

with:

```js
input.onAction('zoomIn', () => { if (game.phase === 'battle' && !settings.isOpen()) wheelStep = 1; });
input.onAction('zoomOut', () => { if (game.phase === 'battle' && !settings.isOpen()) wheelStep = -1; });
```

## 6. src/main.js — let controller players fire (pairs with gamepad support)

The fire gate requires pointer lock, which pad players never acquire. `input.padActive()`
is true only while a connected pad was touched in the last 4 s. Change (~line 453):

```js
    inp.fire = (st.fire && input.isLocked()) || debugFlags.forceFire;
```

to:

```js
    inp.fire = (st.fire && (input.isLocked() || input.padActive())) || debugFlags.forceFire;
```

## 7. src/main.js — phase-change events for the gear button (minor)

settings.js now updates the garage gear button from bus events (interval kept only as a
fallback). Emit the events:

- in `startBattle`, after `game.phase = 'battle';` → `bus.emit('phase:change', { phase: 'battle' });`
- in `enterGarage`, after `game.phase = 'garage';` → `bus.emit('phase:change', { phase: 'garage' });`

## 8. src/sim/damage.js — distinct kind for external module grazes (minor)

A barrel/track graze currently reports the same `nonpen` as a real armor bounce, which reads
as a broken sim ("916 mm did not penetrate a Sherman"). In `resolveShellHit`, change the
fallthrough (~lines 494–499):

```js
  if (!decided && hits.length > 0 && !hullPen) {
    // Only external module hits (e.g. barrel graze) — a clang, no hull damage.
    const first = hits[0];
    event.kind = 'nonpen';
    event.pos = [first.point.x, first.point.y, first.point.z];
  }
```

to:

```js
  if (!decided && hits.length > 0 && !hullPen) {
    // Only external module hits (e.g. barrel graze) — a clang, no hull damage.
    const first = hits[0];
    event.kind = 'module_graze';
    event.module = first.kind === 'module' ? first.module
      : (first.plate && first.plate.moduleLink) || null;
    event.pos = [first.point.x, first.point.y, first.point.z];
  }
```

Then in src/ui/hud.js:

- `BOUNCE_TEXT` (~line 719): add `module_graze: 'We hit their equipment — no damage.'`
  (or map `event.module === 'gun'` → `'We hit their gun!'`, tracks → `'We hit their track!'`).
- damage-number branch (~line 1213): add
  `else if (hit.kind === 'module_graze') { d.classList.add('miss'); d.textContent = 'HIT EQUIPMENT'; }`
  before the generic `nonpen` line stays as-is.
- bounced-marker check (~line 1251): include `|| hit.kind === 'module_graze'`.

Check that nothing else switches on `ev.kind === 'nonpen'` for scoring (ai.js
`notifyShellResult` treats unknown kinds as non-pens — verify).

## 9. src/fx/effects.js — sniper-view muzzle smoke obscures the target (minor)

After firing at 4x+ zoom the near-white muzzle smoke cloud covers the center third of the
screen for ~2 s, exactly when the player wants hit confirmation. WoT hides most self-smoke in
scope view. Suggested: `fx.update(dt, shells, camera)` already receives the camera — when
`camera.fov < 20` (sniper zoom), scale the alpha of smoke particles within ~12 m of the camera
by `clamp01(distToCam / 12)²` (or skip spawning the propellant-donut puffs entirely when the
muzzle is < 3 m from the camera). Keep the flash/tracer; only the lingering smoke needs culling.

---

### Not required, nice to have

- main.js could use `input.getPadMove(out)` (curved -1..1 left-stick values) for analog
  throttle/steer instead of the synthesized digital forward/back/left/right holds.
- The screenshot-contract views are unaffected by all of the above; `zeroInputs()` already
  calls `input.setEnabled(true)` and `settings.close()`.
