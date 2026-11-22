// Far camera poses (far-hull-273): cameras that put the allies round the player past the far LOD (vehicles/farLod.ts:
// 180 m of screen-equivalent distance), shared by tools/far-hull-truth.mjs, tools/frame-thread-cpu.mjs and
// tools/draw-census.mjs. Each is relative to the player's hull: back (m behind), up (m above), side (m to its right),
// looking at the hull through a 55-degree lens.
export const FAR_POSES = Object.freeze({
  'far-allies': Object.freeze({ back: 230, up: 45, side: 0 }),
  'far-low': Object.freeze({ back: 250, up: 8, side: 0 }),
  'far-side': Object.freeze({ back: 40, up: 12, side: 240 }),
});

/** Page side (serialized): the camera at a far pose. */
export function farPose({ back, up, side = 0 }) {
  const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
  const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
  D.rig.setExternalPose(new V(st.pos.x - fx * back + fz * side, st.pos.y + up, st.pos.z - fz * back - fx * side),
    new V(st.pos.x, st.pos.y, st.pos.z), 55);
}
