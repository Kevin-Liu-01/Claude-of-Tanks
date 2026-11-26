// Far camera poses (far-hull-273): cameras that put the allies round the player past the far LOD (vehicles/farLod.ts:
// 180 m of screen-equivalent distance), shared by tools/far-hull-truth.mjs, tools/frame-thread-cpu.mjs and
// tools/draw-census.mjs. Each is relative to the player's hull: back (m behind), up (m above), side (m to its right),
// looking at the hull through a 55-degree lens.
export const FAR_POSES = Object.freeze({
  'far-allies': Object.freeze({ back: 230, up: 45, side: 0 }),
  'far-low': Object.freeze({ back: 250, up: 8, side: 0 }),
  'far-side': Object.freeze({ back: 40, up: 12, side: 240 }),
  // (far-hull-278) more candidates for a pose that shows far hulls (far-hull-truth's visibility gate skips one that shows none)
  'far-side-left': Object.freeze({ back: 40, up: 12, side: -240 }),
  'far-quarter': Object.freeze({ back: 170, up: 30, side: 170 }),
  'far-high': Object.freeze({ back: 250, up: 90, side: 0 }),
  'far-high-left': Object.freeze({ back: 250, up: 90, side: -120 }),
  'far-overhead': Object.freeze({ back: 200, up: 140, side: 0 }),
});

/** Page side (serialized): the camera at a far pose. */
export function farPose({ back, up, side = 0 }) {
  const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
  const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
  D.rig.setExternalPose(new V(st.pos.x - fx * back + fz * side, st.pos.y + up, st.pos.z - fz * back - fx * side),
    new V(st.pos.x, st.pos.y, st.pos.z), 55);
}

/**
 * (far-hull-278) Page side (serialized; also called in Node with `roots`): which vehicles show the FULL far LOD and
 * whether each has its one draw. Full far = a drawn `farLodHull` stand-in or `farLodHullDraw` (past FAR_LOD_ENTER_M). The
 * gear stage alone (`farLodRunningGear`, from GEAR_LOD_ENTER_M, 90 m) also carries `userData.farLod`, so a flag or
 * `root.userData.farLod` is not the far LOD: counting it made 3 frozen allies in the 90-180 m band read as far tanks with
 * no one draw. Drawn = visible up the parent chain. Each full-far vehicle is built (a one-draw record), refused (a stated
 * refusal) or missing (no record yet: the law is that this ends at 0).
 */
export function farLodCensus(roots) {
  if (!roots) {
    roots = [];
    window.__DEBUG.scene.traverse((o) => { if (/^tank_/.test(o.name || '') && o.userData.farLod !== undefined) roots.push(o); });
  }
  const drawn = (root, name) => {
    let hit = false;
    root.traverse((n) => {
      if (hit || n.name !== name) return;
      for (let p = n; p; p = p === root ? null : p.parent) if (!p.visible) return;
      hit = true;
    });
    return hit;
  };
  const out = { vehicles: roots.length, far: 0, gear: 0, built: 0, refused: 0, missing: [], records: [] };
  for (const root of roots) {
    const far = drawn(root, 'farLodHull') || drawn(root, 'farLodHullDraw');
    const gear = !far && drawn(root, 'farLodRunningGear');
    const hullDraw = root.userData.farLod?.hullDraw ?? null;
    if (far) {
      out.far++;
      if (hullDraw?.refusal !== undefined) out.refused++;
      else if (hullDraw) out.built++;
      else out.missing.push(root.name);
    } else if (gear) out.gear++;
    out.records.push({ name: root.name, stage: far ? 'far' : gear ? 'gear' : 'near', hullDraw, hullDraws: root.userData.farLod?.hullDraws });
  }
  return out;
}
