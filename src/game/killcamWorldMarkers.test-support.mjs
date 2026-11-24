// The world's markers during a kill cam replay (killcam-strike-shot-276; Main 2026-11-24: "hide the plates … for every kill
// cam replay"): a Zone Control field the mode world (matchModeWorldPresentation.ts) dresses on every frame, three capture
// zones (one mid-capture: its arc drawn) and both spawns, and the count of what it draws. The kill cam receipts
// (killcamFirstFrame, killcamStrikeShot) record it on every presented frame and judge it with judgeWorldMarkers.
// Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
import { createMatchModeWorldPresentation } from './matchModeWorldPresentation.ts';
import { killcamStage } from './killcamStage.ts';

const MARKER_STATE = {
  id: 'zone_control', label: 'Zone Control', perspectiveTeam: 'alpha', respawns: true, target: null,
  score: { alpha: 0, bravo: 0 }, flags: [], ball: null, goals: [], horde: null, pickups: [], playerAmmo: null,
  playerAmmoCapacity: null,
  zones: [
    { id: 'zone-1', x: -90, y: 0, z: 60, control: -1, owner: 'bravo', contested: false },
    { id: 'zone-2', x: 0, y: 0, z: 60, control: 0.4, owner: null, contested: false },
    { id: 'zone-3', x: 90, y: 0, z: 60, control: 0, owner: null, contested: false },
  ],
  spawns: [{ team: 'alpha', x: -260, y: 0, z: -260 }, { team: 'bravo', x: 260, y: 0, z: 260 }],
};

/**
 * A mode world on its own scene, dressed by `update(timeS)` (the frame's matchModeWorld term), and `count()`: its drawn
 * (every ancestor visible) world-anchored markers and physical posts. A zone's ring, disc, arc and badge are markers and
 * its post is not (children 0, 2, 3, 4 and 1); a spawn is all marker. The planted faults: `never`, the replay's veil
 * never reaching the world; `stuck`, the veil left on once the replay has left (`replayLeft()` says when).
 */
export function createMarkerField(THREE, { fault = null, replayLeft = () => false } = {}) {
  const world = createMatchModeWorldPresentation(new THREE.Scene());
  const drawn = (object) => {
    for (let node = object; node; node = node.parent) { if (!node.visible) return false; if (node === world.root) return true; }
    return false;
  };
  return {
    update(timeS) {
      if (fault === 'never') killcamStage.live = false;
      if (fault === 'stuck' && replayLeft()) killcamStage.live = true;
      world.update(MARKER_STATE, timeS);
    },
    count() {
      let markers = 0, posts = 0;
      for (const group of world.root.children) {
        if (/^capture-zone-/.test(group.name)) {
          group.children.forEach((child, index) => { if (drawn(child)) { if (index === 1) posts++; else markers++; } });
        } else if (/-spawn$/.test(group.name)) for (const child of group.children) if (drawn(child)) markers++;
      }
      return { markers, posts };
    },
    dispose() { world.dispose(); killcamStage.live = false; },
  };
}

/** The markers leave the screen for the whole replay, every shot of it, and come back when it leaves; the posts stay.
 *  `frames` carry `active`, `phase` and `world` (a count()); `first` is the replay's first frame. Each failure is a line. */
export function judgeWorldMarkers(label, frames, first) {
  const wrong = [];
  const before = frames[first - 1].world;
  const lastActive = frames.findLastIndex((f) => f.active);
  const during = frames.slice(first, lastActive + 1);
  const after = frames.slice(lastActive + 1);
  if (!(before.markers > 0)) wrong.push(`${label}: setup: no marker on screen before the replay`);
  const shown = during.filter((f) => f.world.markers > 0);
  if (shown.length) {
    wrong.push(`${label}: ${shown.length} of ${during.length} replay frames draw the world's markers (up to `
      + `${Math.max(...shown.map((f) => f.world.markers))}; phases ${[...new Set(shown.map((f) => f.phase))].join(', ')})`);
  }
  if (during.some((f) => f.world.posts !== before.posts)) wrong.push(`${label}: the replay hides the zones' physical posts`);
  if (!after.length || after.some((f) => f.world.markers !== before.markers)) {
    wrong.push(`${label}: after the replay the world draws ${after.map((f) => f.world.markers).join('/') || 'no frame'} markers, `
      + `not the ${before.markers} it drew before it`);
  }
  return wrong;
}
