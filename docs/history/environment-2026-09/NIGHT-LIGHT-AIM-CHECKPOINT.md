# Night driving-light aim

Runtime checkpoint: `6468ee7bc` (source checkpoint `9d2defa5c`).
This is separate from the night-entry compilation-order fix and the restored
original Verdant horizon. Neither terrain nor atmosphere is changed here.

## Cause and correction

M1A3's decorative headlight lenses are raked upward by 0.12 radians. The light
registration copied the visible lens normal as its optical direction. In the
previous native Urban capture the tank was level, yet both beams aimed
6.875 degrees upward, rising about 2.41m over 20m of horizontal travel.

Only an upward **headlight** direction now adopts the existing lighting
runtime's 0.08 downward slope in the housing owner's frame. The original
aperture position and horizontal azimuth are preserved. Downward or horizontal
lamps, Shtora and marker directions remain unchanged. A 1e-7 deadband excludes
Float32/trigonometric residue on nominally horizontal lens caps.

This is construction-time metadata only: no geometry, masks, materials, light
count, intensity, range, shadows, shader variant or per-frame loop changes.
Pitch, roll and mirrored owners still transform the beam with the vehicle.

## Completed checks

- Fifteen role/angle fixtures preserve geometry and mask bytes, aperture seats,
  azimuth and non-driving roles.
- Actual high/low M1A3 exports at the previous native pose and pitched/rolled
  mirrored poses seat both real pooled spots correctly. Their center rays meet
  the owner's road tangent plane about 14.1m ahead, inside the existing 42m
  range. The old upward-ray negative control misses it.
- The existing four-model, two-quality exterior/contact checks pass. A one-time
  old-source comparison matches all eight geometry, hull, material, draw-owner
  and mask-byte-count inventories.
- Integrated vehicle, lighting runtime/access, emission and original Verdant
  tests pass. Full no-emit TypeScript and the public build pass.
- Read-only React Doctor changed-scope scan: 98/100, no diagnostics. No scanner
  dependency or configuration was installed.

The tangent-plane test does not promise intersection with unknown terrain
ahead. This document makes no frame-time, loading-speed or physical-iPad
claim. Detailed frozen protocol:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/night-driving-aim-r1-protocol.md`.

## Native confirmation

The single maintained three-view acquisition passed on Chrome 152 / M5 Max
Metal, desktop High, 1440×900, Urban / M1A3 / clear-night seed 2. The recorded
camera, player-pose, weather and raster settings match the previous r2 capture
exactly. Both spot sources are unchanged; their target-direction Y changes
from +0.1197122033 to -0.0797452223, at the same intensity 80 and range 42.
All three original screenshots were inspected. The establishing frame shows
light on the ground ahead; the closeup retains both attached glowing lenses.
The unchanged streetlamp control retains its existing brightness problem.

Console, WebGL and cleanup errors are empty. Observer restoration and return
to Garage pass; the owned Chrome and preview processes stopped. Evidence:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/night-driving-aim-r1/`.
Report SHA-256:
`ae4a1193b64d5d9c756136d3fa2200b73b596e2e155b8479d98a51897ba6a230`.

## Separate appearance limits

The previous streetlamp closeup had both headlights inactive, so its bright
facade is not caused by this aim bug. Its existing unshadowed point light and
uniform nighttime window emission remain separate appearance issues. This
checkpoint does not change their intensity, add interior textures or grant
blanket approval to nighttime lighting.
