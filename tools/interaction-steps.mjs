// The step-count receipt's paths (INTERACTION-REDESIGN.md part D; owner 2026-10-26: "make map selection much more
// intituitve, as well as camo, i really mean update all legacy interaction surfaces and systems"). Copyright © 2026
// Kevin B. Liu.
//
// Each common path in src/ui/interactionRegistry.ts as the presses a player makes today, from where they stand, until the
// task is done: one step a press (a control to press, or a key), with what holds on screen once it has answered. The
// click-timeline recorder replays them (`node tools/click-timeline.mjs --paths=steps …`), measuring every press as it
// measures any other, and records each path's presses and whether it finished; `--report` folds them into the step table
// against tools/interaction-baseline.json, where a count may only fall. src/ui/interactionRegistry.selftest.mjs checks
// that every common path has its replay here and that the replay presses as many times as the registry says.
//
// When a redesign removes a press, drop its step here, lower the registry's `presses` and the baseline in the same commit.
// Selectors are the live markup's; `shown` and `done` are page expressions with click-timeline's `shown(sel)` helper.
// `setup` presses bring the player to where the path starts (a room's lobby) and are not counted.

/** Garage controls (desktop, docked). */
const DEPLOY = '[data-nav=deploy], .cot-battle-mode';
const DEPLOY_OPEN = `shown('#cot-battle-menu.open')`;

export const STEP_PATHS = Object.freeze([
  {
    id: 'map-deploy',
    // the battle document: the reset ends the battle through __DEBUG and returns to the Garage
    doc: 'battle',
    steps: [
      { name: 'deploy', press: DEPLOY, shown: DEPLOY_OPEN },
      { name: 'battlefield', press: '#cot-battle-menu [data-deploy-field]', shown: `shown('.cot-map-card .cot-map-select')` },
      // a named map, not Random (the first card)
      { name: 'map', press: '.cot-map-card:not(.sel) .cot-map-select', index: 1, shown: `!shown('.cot-map-card .cot-map-select')` },
      { name: 'launch', press: '#cot-battle-menu [data-battle-launch]', shown: `shown('.cot-bl.on')`, shownTimeoutMs: 30000 },
    ],
    done: `shown('.cot-bl.on') || !!window.__BATTLE_REVEAL`,
    reset: 'battle',
  },
  {
    id: 'wear-camo',
    doc: 'game',
    steps: [
      { name: 'every-paint', press: '.cot-lt-paint-all', shown: `shown('.cot-camo-card')` },
      { name: 'paint', press: '.cot-camo-card:not(.sel)', index: 2, shown: `document.querySelector('[data-click-target]')?.classList.contains('sel')` },
    ],
    done: `!!document.querySelector('.cot-camo-card.sel')`,
    reset: 'escape',
  },
  {
    id: 'equip-item',
    doc: 'game',
    steps: [
      { name: 'slot', press: '.eqslot[data-slot]', shown: `shown('.cot-eqtile')` },
      { name: 'item', press: '.cot-eqtile[data-eq]:not([aria-disabled=true]):not([aria-pressed=true])', shown: `!shown('.cot-eqtile')` },
    ],
    done: `!shown('.cot-eqtile')`,
    reset: 'escape',
  },
  {
    id: 'start-room',
    doc: 'game',
    steps: [
      { name: 'deploy', press: DEPLOY, shown: DEPLOY_OPEN },
      { name: 'private', press: '#cot-battle-menu [data-deploy-room="private"]', shown: `shown('.cot-play .panel')`, shownTimeoutMs: 30000 },
      // creating a room needs the rooms service (VITE_ROOMS_URL) or the LAN helper; without one the press is still counted
      { name: 'create', press: '.cot-play [data-action="create"]', shown: `shown('.cot-play .roomhead .code')`, shownTimeoutMs: 30000 },
    ],
    done: `shown('.cot-play .roomhead .code')`,
    reset: 'room',
  },
  {
    id: 'rooms-map',
    doc: 'game',
    // a host in a fresh room (the rooms service or the LAN helper): the start-room presses, uncounted
    setup: [
      { press: DEPLOY, shown: DEPLOY_OPEN },
      { press: '#cot-battle-menu [data-deploy-room="private"]', shown: `shown('.cot-play .panel')` },
      { press: '.cot-play [data-action="create"]', shown: `shown('.cot-play .roomhead .code')` },
    ],
    steps: [
      { name: 'trigger', press: '.cot-play [data-control="map"] [data-select-trigger]', shown: `shown('.cot-play [data-picker="rooms-battlefield"]')` },
      // a named battlefield, not Random (the first card)
      { name: 'battlefield', press: '.cot-play [data-picker="rooms-battlefield"] .cot-c-picker__opt[aria-selected="false"]', index: 1,
        shown: `!shown('.cot-play .battlefield-pick')` },
    ],
    done: `!shown('.cot-play .battlefield-pick') && !!document.querySelector('.cot-play [data-control="map"]')?.dataset.value`,
    reset: 'room',
  },
]);
