# World of Tanks Movement, Physics & Camera — Implementation Spec

Research target: replicate the *feel* of WoT (PC, post-8.0 physics) with an arcade kinematic
model, not a rigid-body sim. WoT itself is a speed-limited, terrain-resistance-gated kinematic
model with cosmetic pitch/roll/suspension — that is what we implement.

Units used throughout: meters, seconds, degrees for angles, km/h only in tuning tables
(convert: `mps = kmh / 3.6`), engine power in hp (1 hp = 745.7 W, but we never need watts —
the model is ratio-based).

---

## 1. Vehicle stat block (data schema)

Every tank is fully described by this record. All movement/aiming code reads only this.

```js
{
  // --- mobility ---
  enginePowerHp:      750,     // current engine hp
  weightTons:         50,      // current weight
  topSpeedKmh:        40,      // forward transmission limit
  reverseSpeedKmh:    14,      // reverse transmission limit
  hullTraverseDegS:   26,      // nominal, ON HARD GROUND, stock weight/engine
  terrainResistance:  { hard: 1.0, medium: 1.2, soft: 2.2 }, // suspension property
  pivotStyle:         'pivot', // 'pivot' (one track locked) | 'neutral' (counter-rotate)

  // --- turret & gun ---
  turretTraverseDegS: 30,
  gunPitchDegS:       24,      // elevation speed (usually ~0.8x turret traverse)
  gunElevationDeg:    18,      // max up
  gunDepressionDeg:   8,       // max down (positive number, applied as -8°)

  // --- gun handling / dispersion ---
  baseAccuracy:       0.36,    // meters of dispersion at 100 m, fully aimed (= 2σ)
  aimTimeS:           2.3,     // time for reticle to shrink to 1/3 of its size
  bloom: {
    move:    0.20,   // per km/h of hull speed        (Smooth Ride reduces)
    hullRot: 0.20,   // per deg/s of hull traverse    (Smooth Ride reduces)
    turret:  0.12,   // per deg/s of turret traverse  (Snap Shot reduces)
    afterShot: 4.0   // flat multiplier added on firing
  }
}
```

### Typical values per class (tuning table)

| Class            | hp/t    | Top fwd | Reverse | Hull trav | Turret trav | Elev/Depr | Accuracy | Aim time |
|------------------|---------|---------|---------|-----------|-------------|-----------|----------|----------|
| Light            | 20–30   | 60–72   | 20–24   | 40–54°/s  | 40–48°/s    | +20/−10   | 0.36–0.42| 1.5–2.0s |
| Medium           | 14–20   | 45–56   | 18–20   | 36–48°/s  | 36–44°/s    | +18/−8    | 0.33–0.38| 2.0–2.4s |
| Heavy            | 10–15   | 30–40   | 10–15   | 20–30°/s  | 20–28°/s    | +15/−7    | 0.35–0.40| 2.5–3.2s |
| Tank destroyer   | 12–18   | 35–50   | 12–18   | 20–30°/s  | 16–26°/s(*) | +15/−5    | 0.30–0.35| 1.8–2.5s |
| SPG (artillery)  | 10–15   | 35–45   | 12–16   | 18–26°/s  | slow/limited| +45/−3    | 0.6–0.9  | 5–7s     |

(*) casemate TDs have a limited gun-arc (±10–15°) instead of a full turret; exceeding the arc
forces hull traverse. Gun depression is nation-flavored in WoT: Soviet ~−3…−5°, US/UK ~−8…−10°.

Typical terrain resistance triples (hard/medium/soft) — lower is better:
good suspension `0.7 / 0.8 / 1.5`, average `1.0 / 1.2 / 2.2`, poor `1.2 / 1.4 / 2.5`.

---

## 2. Terrain resistance — the master mobility gate

WoT classifies every surface into three types:

- **hard** — roads, pavement, cobblestone, concrete. Best mobility. The in-game displayed
  stats (traverse, "effective" acceleration feel) are the hard-ground numbers.
- **medium** — dirt, grass, sand, paths, shallow water. ~80% of any map.
- **soft** — swamp, deep sand, deep water fords. Worst mobility.

Resistance divides the tractive effort. Everything (acceleration, achievable speed on flat
ground, hull traverse) is scaled by `1 / R_terrain` relative to the resistance-1 baseline:

```
effectiveForceScale = 1 / R[groundTypeUnderTank]
traverse_on_X       = traverse_hard * (R.hard / R[X])     // per the wiki formula, see §4
```

Top speed is *not* directly capped by resistance — it is a transmission limit — but on
high-resistance ground drag balances drive force below the limit, so soft ground naturally
prevents reaching top speed. For our engine: sample ground type from the material/splat map
under the hull center each tick.

---

## 3. Engine power, power-to-weight, acceleration model

WoT acceleration is driven by **specific power = enginePowerHp / weightTons** (hp/t), gated
by terrain resistance. A model that reproduces the observed feel (fast initial surge,
asymptotic crawl to the speed limit, inability of low hp/t tanks to reach top speed uphill):

```
P_spec   = enginePowerHp / weightTons                 // hp per ton
a_drive  = K_ACCEL * P_spec / R_terrain               // m/s², K_ACCEL ≈ 0.55
a_drag   = C_DRAG * v * v / v_max²  * a_driveMaxFlat  // quadratic drag normalized so that
                                                      // on hard flat ground v settles ≈ v_max
a_slope  = -G * sin(pitchAlongTrack)                  // G = 9.81, positive pitch = climbing
a        = a_drive * throttle - a_drag * sign(v) + a_slope
```

Simpler and equally faithful alternative (what we recommend): force model with a per-tick
exponential approach to a **terrain-and-slope-adjusted target speed**:

```
v_target = v_limit(direction)                         // topSpeed fwd, reverseSpeed back
v_target *= clamp(1 - slopePenalty(pitch), 0.15, 1.25)// see §5
accelRate = K * (P_spec / R_terrain)                  // K ≈ 0.35 → hp/t 20 reaches 3.5 kmh/tick-ish feel
v += clamp(v_target*throttle - v, -brakeRate*dt, accelRate*dt)
```

Braking is much stronger than acceleration (`brakeRate ≈ 3–4 × accelRate`), and releasing W
coasts with mild drag (~0.5 × brakeRate as rolling friction).

**Top speed forward/reverse.** These are hard transmission limits in WoT. On flat hard ground
most tanks approach but low hp/t tanks never reach them; downhill the limit may be exceeded
(post-8.0 physics) — allow overspeed up to `1.2 × topSpeed` downhill, with strong drag beyond
the limit pulling back toward it.

---

## 4. Track-based steering (hull traverse)

Two modes, chosen by `pivotStyle` and current speed:

- **Pivot turn (stationary)**: A/D with no throttle rotates the hull in place.
  - `'neutral'` tanks counter-rotate the tracks: true rotate-in-place about hull center.
  - `'pivot'` tanks lock one track: rotate about a point offset to the locked track side
    (offset ≈ half track gauge, ~1.2 m); visually the tank orbits slightly.
- **Drive turn (moving)**: A/D while moving curves the path; yaw rate is the traverse speed,
  the velocity vector follows the hull (kinematic, no drift). Turning while moving bleeds
  speed: `v *= (1 - TURN_SPEED_LOSS * |yawRate|/maxYawRate * dt)`, TURN_SPEED_LOSS ≈ 0.3/s.
  While reversing, steering is inverted like a car (A yaws the nose right when reversing —
  WoT does this).

**Effective traverse formula** (from the WoT wiki, use verbatim):

```
Tr = Tn × (Ec/Es) × (Rhard/Rcurrent) × (Ws/Wc) × Pc
```

- `Tn` nominal traverse (hard ground), `Ec/Es` current/stock engine hp,
  `Rhard/Rcurrent` hard resistance over resistance of ground under the tank,
  `Ws/Wc` stock/current weight, `Pc` = 1.0 for pivot-style tanks, 0.95 for neutral-turn tanks.
- With no module system, this reduces to `Tr = Tn × (R.hard / R.current)` — i.e., traverse
  is full speed on hard ground and degrades on medium/soft exactly like acceleration.

Ramp yaw rate toward target over ~0.15 s (tracks spool up) rather than stepping instantly.

---

## 5. Slope effects

Pitch of the hull along the drive direction modifies the achievable speed.
Climbability is a force budget, not a fleet-wide angle:

```
engineAccel = K_ACCEL × (enginePowerHp / weightTons) / terrainResistance
trackGrip   = clamp(0.24 × trackTraction / terrainResistance, 0.08, 0.27)
             × g × cos(pitch)
gravityLoad = g × sin(pitch) × 0.3
climbMargin = clamp((min(engineAccel, trackGrip) - gravityLoad)
                    / min(engineAccel, trackGrip), 0, 1)

climbing: v_target *= climbMargin
downhill: v_target *= 1 + min(|pitchDeg| / 45, 0.25), capped at 1.2 × topSpeed
```

The effective tracked gravity share preserves the tuned arcade handling while
still allowing power-to-weight, engine damage, ground condition, and running
gear to determine the result. An optional `trackTraction` multiplier covers
unusual running gear; existing tanks derive grip from their authored terrain
resistance.

Also add the raw gravity term `a_slope = -9.81 · sin(pitch)` so a stalled tank
slides backwards and a coasting tank gains speed downhill. Reducing target
speed alone is insufficient for wall-like faces because carried momentum can
make the kinematic support plane lift the tank. The solver therefore computes
a separate grip-only margin; when track grip is exhausted it removes remaining
uphill velocity before integration and applies full along-slope gravity.
Side slopes (roll) do not affect speed; they tilt the hull and gun.

### 5.1 Ground contact and free flight

Terrain support has finite suspension authority. While grounded, the chassis
spring may move between the compression floor and `supportY + droopM`. If the
terrain falls farther than full droop while the chassis is separating from the
support plane, contact opens:

```
grounded = false
vy       = last chassis/support vertical velocity

each fixed tick in flight:
  xz += horizontalVelocity * dt       // no track drive, brake, or steering force
  vy -= 9.81 * dt
  y  += vy * dt
```

The tank lands when its fully extended running-gear footprint reaches the
terrain while closing. The contact phase then resumes with the impact velocity
still in the heave spring, which absorbs the landing against the compression
floor. Terrain pitch and roll do not torque an unsupported chassis. This phase
state and `vy` are authoritative, deterministic, and included in network
snapshots and local prediction.

---

## 6. Hull attitude: terrain following + inertial pitch + recoil + suspension

The hull's visual orientation is decoupled from the movement math (which runs on yaw only).

1. **Terrain following while supported**: sample terrain height at 4 points (front-left/right, rear-left/right
   at the track contact rectangle, half-length ~3 m, half-width ~1.5 m).
   `targetPitch = atan2(h_front - h_rear, wheelbase)`, `targetRoll = atan2(h_left - h_right, gauge)`.
2. **Spring-damper smoothing** (this IS the suspension bounce): drive current pitch/roll to
   target with a critically-under-damped spring — natural frequency ~2.5–3.5 Hz
   (`k ≈ (2π·3)² ≈ 355`, damping ratio ζ ≈ 0.5–0.7). Crossing a ridge or landing from a drop
   then produces the characteristic WoT nose-bob for 2–3 oscillations automatically.
3. **Inertial pitch**: add `pitchOffset = -K_INERTIA * dv/dt` (nose dips on braking, lifts on
   acceleration). K_INERTIA tuned so full braking from top speed dips ~3–4°. Feed it into the
   same spring so it overshoots and settles.
4. **Fire recoil**: on shot, apply an impulse to the spring state:
   pitch-rate kick of ~8–15 °/s (heavier gun → bigger) rotating the hull *away* from the muzzle
   direction (project gun forward vector onto hull axes to split into pitch/roll kick), plus a
   small backward translation impulse (~0.3 m/s decaying in 0.4 s). Turret/gun get a separate
   barrel slide-back animation (~0.25 m, return in 0.5 s) — visual only. Rapid (cycle <=1 s)
   IFV autocannon rounds apply 18% of the ordinary hull, barrel, camera-shake and FOV recoil;
   slower IFV guns and ATGM rails retain the full impulse.
5. **Track/idle micro-shake**: optional ±0.15° noise on pitch/roll proportional to speed.

---

## 7. Turret & gun

- **Turret traverse**: constant angular speed `turretTraverseDegS` toward the aim yaw;
  no acceleration ramp needed (WoT turrets feel constant-rate). Turret yaw is hull-relative.
- **Gun pitch**: constant rate `gunPitchDegS` toward aim pitch, clamped to
  `[-gunDepressionDeg, +gunElevationDeg]` **relative to the hull plane** — this is why hull
  roll/pitch on slopes changes usable depression: point the gun downhill or crest ridges to
  gain effective depression. Implement limits in turret local space; never in world space.
- **Casemate TDs**: gun yaw limited to ±arc; when the aim point exceeds the arc, auto-engage
  hull traverse toward the target (WoT does exactly this in sniper mode).

---

## 8. Gun handling — dispersion bloom integration

Dispersion (reticle radius) at range `D` meters:

```
r(D) = baseAccuracy * (D / 100) * bloomFactor
bloomFactor = sqrt( 1 + (bloom.move    * speedKmh)²
                      + (bloom.hullRot * hullYawRateDegS)²
                      + (bloom.turret  * turretYawRateDegS)² )
```

- `baseAccuracy` is defined as **2σ at 100 m**: 95.45% of shots land inside the reticle.
- On **firing**: multiply current bloom by `bloom.afterShot` (≈ 3–5) instantly.
- **Shrink** is exponential; the listed aim time is the time to shrink to 1/3:

```
tau = aimTimeS / ln(3)                       // ≈ aimTime / 1.0986
currentBloom += (targetBloom - currentBloom) * (1 - exp(-dt / tau))
```

> IMPLEMENTATION NOTE (locked by controls_gunnery r2, do not re-tune against
> the ln 3 text above): src/sim/movement.js uses `tau = aimTimeS / ln 6` for
> the SHRINK path, deliberately paired with reduced `bloom.afterShot`
> multipliers in specs.js so the post-shot re-settle under the fire gate
> lands ≈ 2.3 s on modern MBTs. The stat-card `aimTimeS` therefore reads as
> "time to shrink to 1/6" in this codebase. Renormalizing back to ln 3
> requires restoring the spec afterShot values in the same change.

  (`targetBloom` recomputed every tick from current motion; bloom therefore grows instantly
  with motion — use a much shorter tau, ~0.05 s, when target > current — and decays with the
  aim-time tau when target < current. WoT bloom-up is effectively instant.)
- **Shot roll**: sample a 2-D Gaussian with `σ = r/2`, re-roll (or clamp uniformly) anything
  outside radius `r` — post-8.6 WoT re-rolls outliers uniformly inside the circle, which
  center-biases shots. Apply as angular deviation of the shell's launch direction.

---

## 9. Camera rig (exact WoT behavior)

One camera, three states: `ARCADE` (orbit), `SNIPER`, (and `STRATEGIC` for SPG — top-down,
out of scope for v1). Mouse always drives an **aim yaw/pitch pair** shared by both modes, so
switching modes never snaps the view.

### 9.1 Arcade — third-person orbit

- Orbit pivot: a point ~2–3 m **above the turret**, spring-following the tank
  (position lag ~0.1 s critically damped; the camera floats through hull bounce, it does not
  inherit suspension shake).
- Mouse X/Y: orbit yaw (unlimited) and pitch, pitch clamped ≈ `[-65° (looking down), +30°]`.
  (v1 spec said +15°, but the view clamp must EXCEED every tank's gun elevation limit —
  +18..+20° per the §7 class table — or full elevation is uncommandable on close uphill
  targets; the gun still clamps itself at `spec.gunElevationDeg`. The implementation in
  `src/engine/cameraRig.js` (`PITCH_MAX`) deliberately uses +30°.)
- **Zoom steps**: mouse wheel moves through discrete orbit distances, e.g.
  `[24, 18, 13, 9, 6, 4] m` with a smooth lerp (~0.15 s) between steps. Wheeling in past the
  closest step **enters sniper mode**; wheeling out of sniper's lowest zoom returns to arcade.
- **Auto height / collision**: raycast pivot→camera; if terrain/obstacle is hit, pull camera
  in to the hit point (padding 0.3 m). Additionally raise the camera (and tilt pitch down)
  as the ground rises behind the tank so the camera never goes subterranean — WoT slides the
  camera up along the collision normal rather than clipping.
- **Aim**: raycast from camera through screen center into the world (terrain, tanks,
  buildings). The hit point is the aim point; the reticle is drawn *projected on the surface
  it hits* — this is how the reticle "follows terrain": it visually sticks to the ground/wall
  at the raycast hit, and the gun converges on that 3-D point (server-aim). Draw a second
  small marker where the gun actually points *now* (gun marker) so the player sees turret lag;
  WoT's optional "server reticle" is exactly this authoritative gun-aim indicator.
- **Gun lock / free look**: hold the dedicated Free Look action (`Left Shift`
  by default, secondary `Left Alt`, controller `RB`) to move the camera while
  freezing the aim point, turret, and hull. RMB can provide the same behavior
  when its setting is `freelook`.

### 9.2 Sniper — first person from the gun

- Camera placed at the gun mantlet/barrel base, glued to the turret: turret yaw + gun pitch
  rotate the view (so slow turrets drag the view — keep this, it is core WoT feel; the view
  target leads and the turret catches up, camera renders at actual turret orientation only
  for the *reticle-follow* variant — WoT actually rotates the view instantly with the mouse
  and the *gun/reticle* lags; implement: camera = aim yaw/pitch instantly, gun chases).
- **Zoom**: FOV division. Base FOV ~ 60°(v). Steps `×2, ×4, ×8` by default; `×16, ×25`
  unlocked by a settings toggle ("increased zoom"). `fov = baseFov / zoom`. Mouse wheel steps
  through them; a zoom indicator ("×8") shows next to the reticle.
- Mouse sensitivity scales with `1/zoom` so precision aiming works at ×25.
- **Scope overlay**: full-screen black vignette ring (scope shadow), thin crosslines, zoom
  text, and the dispersion circle rendered in screen space sized from `r(D)` at the aim
  distance. Hull is hidden (camera is inside the tank); render nothing of own vehicle.
- Enter: default RMB hold, RMB toggle when configured, or wheel-in past arcade's
  closest step. Exit by releasing default RMB hold, toggling RMB when configured,
  or wheeling out past ×2. Keep arcade orbit yaw synced to turret yaw on exit so
  the camera comes out behind the gun. The rebindable sniper action has no
  default keyboard key.
- Sniper mode is disabled for SPG (they get strategic view instead).

### 9.3 Server-aim / reticle terrain-follow details

- Every frame: `aimPoint = raycast(cameraOrigin, cameraForward, maxRange≈720m)`;
  if nothing hit, use point at maxRange.
- Turret target yaw/pitch = angles from gun pivot to `aimPoint` (NOT camera angles) — this
  makes the gun converge correctly at close range and over ridges.
- Reticle UI = `project(aimPoint)` (always screen center in sniper; in arcade it sits at
  screen center too but the *gun marker* drifts). Dispersion circle radius on screen =
  `r(distanceTo(aimPoint))` projected at the aim distance.
- If the gun cannot reach the aim pitch (depression limit on a crest), the gun marker pins at
  the limit — draw the reticle desaturated/red-tinted edge so the player sees "can't aim there".

---

## 10. Pseudocode — movement update loop

```js
function updateTank(t, input, dt) {
  // ---- ground sampling ----
  const ground   = sampleGroundType(t.pos);              // 'hard'|'medium'|'soft'
  const R        = t.stats.terrainResistance[ground];
  const Rh       = t.stats.terrainResistance.hard;
  const hQuad    = sampleTerrainQuad(t.pos, t.yaw);      // 4 corner heights
  const terrPitch= pitchFrom(hQuad), terrRoll = rollFrom(hQuad);

  // ---- hull traverse ----
  const trMax = t.stats.hullTraverseDegS * (Rh / R) * (t.pivotStyle==='neutral' ? 0.95 : 1.0);
  const yawTarget = input.steer * trMax * (t.speed < -0.1 ? -1 : 1);   // reverse steering flip
  t.yawRate = approach(t.yawRate, yawTarget, trMax / 0.15 * dt);       // 0.15s spool-up
  t.yaw += t.yawRate * dt;
  if (Math.abs(t.speed) < 0.1 && t.pivotStyle === 'pivot' && input.steer)
    t.pos.addScaledVector(sideAxis(t.yaw, input.steer), PIVOT_OFFSET * rad(t.yawRate) * dt);

  // ---- longitudinal speed ----
  const pspec  = t.stats.enginePowerHp / t.stats.weightTons;
  const accel  = K_ACCEL * pspec / R;                                  // m/s²
  const pitchAlong = terrPitch * Math.sign(t.speed || input.throttle);
  let vLim = (input.throttle >= 0 ? t.stats.topSpeedKmh : t.stats.reverseSpeedKmh) / 3.6;
  vLim *= clamp(1 - slopePenalty(pitchAlong), 0.0, 1.25);
  vLim = Math.min(vLim, t.stats.topSpeedKmh / 3.6 * 1.2);              // downhill overspeed cap
  const vTarget = vLim * input.throttle;                                // throttle ∈ [-1, 1]
  const braking = (Math.sign(vTarget - t.speed) !== Math.sign(t.speed)) || input.brake;
  const rate = braking ? accel * BRAKE_MULT : accel;                    // BRAKE_MULT ≈ 3.5
  t.speed  = approach(t.speed, vTarget, rate * dt);
  t.speed += -G * Math.sin(rad(terrPitch)) * dt * (input.throttle ? 0.3 : 1.0); // gravity term
  t.speed *= 1 - TURN_SPEED_LOSS * Math.abs(t.yawRate) / trMax * dt;    // bleed in turns

  // ---- integrate horizontal motion ----
  t.pos.addScaledVector(forwardAxis(t.yaw), t.speed * dt);

  // ---- finite support or ballistic flight ----
  const support = solveTrackFootprint(t.pos, t.yaw, t.hullSpring);
  if (t.grounded && separatingBeyondFullDroop(t, support)) {
    t.grounded = false;                    // preserve current verticalSpeed
  } else if (!t.grounded) {
    t.verticalSpeed -= G * dt;
    t.pos.y += t.verticalSpeed * dt;
    if (closingOnExtendedTracks(t, support)) {
      t.grounded = true;                   // spring absorbs the retained impact speed
      t.pos.y = support.y + DROOP_M;
    }
  } else {
    stepHeaveSpring(t, support, dt);        // bounded by compression and droop
  }

  // ---- hull attitude spring (visual) ----
  const inertialPitch = -K_INERTIA * (t.speed - t.prevSpeed) / dt;      // brake dip
  t.hullSpring.setTarget(terrPitch + inertialPitch, terrRoll);
  t.hullSpring.step(dt);                                                // ω≈2π·3, ζ≈0.6
  t.visualPitch = t.hullSpring.pitch;  t.visualRoll = t.hullSpring.roll;

  // ---- turret & gun chase aim point ----
  const want = anglesTo(t.gunPivotWorld(), t.aimPoint);                 // {yaw, pitch} world
  t.turretYaw = chaseAngle(t.turretYaw, want.yaw - t.yaw, t.stats.turretTraverseDegS * dt);
  t.gunPitch  = clamp(chaseAngle(t.gunPitch, want.pitch - t.visualPitch,
                                 t.stats.gunPitchDegS * dt),
                      -t.stats.gunDepressionDeg, t.stats.gunElevationDeg);

  // ---- dispersion bloom ----
  const target = Math.sqrt(1
      + sq(t.stats.bloom.move    * Math.abs(t.speed) * 3.6)
      + sq(t.stats.bloom.hullRot * Math.abs(t.yawRate))
      + sq(t.stats.bloom.turret  * Math.abs(t.turretYawRate)));
  const tau = target > t.bloom ? 0.05 : t.stats.aimTimeS / Math.LN3_; // grow fast, shrink slow
  t.bloom += (target - t.bloom) * (1 - Math.exp(-dt / tau));
  // on fire: t.bloom *= t.stats.bloom.afterShot; t.hullSpring.kick(recoilPitch, recoilRoll);
}
```

## 11. Pseudocode — camera rig

```js
const ORBIT_STEPS = [24, 18, 13, 9, 6, 4];        // meters
const SNIPER_ZOOMS = [2, 4, 8, 16, 25];           // ×16/×25 behind settings flag

function updateCamera(cam, tank, input, dt) {
  // shared aim angles from mouse (sensitivity /zoom in sniper)
  const sens = cam.mode === 'SNIPER' ? BASE_SENS / cam.zoom : BASE_SENS;
  if (!input.freeLookHeld) { cam.aimYaw += input.mouseDX * sens;
                             cam.aimPitch = clamp(cam.aimPitch - input.mouseDY * sens, -65, 15); }

  if (input.wheel) stepZoom(cam, input.wheel);    // handles ARCADE<->SNIPER transitions
  if (input.shiftPressed) toggleSniper(cam, tank);

  if (cam.mode === 'ARCADE') {
    const pivot = tank.turretPosWorld().add(UP.clone().multiplyScalar(2.5));
    cam.pivot.lerp(pivot, 1 - Math.exp(-dt / 0.1));                    // spring follow
    cam.dist  = damp(cam.dist, ORBIT_STEPS[cam.step], 0.15, dt);
    let desired = cam.pivot.clone().add(dirFrom(cam.aimYaw, cam.aimPitch).multiplyScalar(-cam.dist));
    const hit = raycast(cam.pivot, desired);                            // collision pull-in
    if (hit) desired = hit.point.addScaledVector(hit.normal, 0.3);
    const minY = terrainHeight(desired.x, desired.z) + 1.0;             // auto height
    desired.y = Math.max(desired.y, minY);
    cam.position.copy(desired);
    cam.lookAt(cam.pivot); cam.fov = 60;
  } else { // SNIPER
    cam.position.copy(tank.gunMuzzleBaseWorld());                       // mantlet position
    cam.setRotation(cam.aimYaw, cam.aimPitch);                          // view = aim, gun chases
    cam.fov = 60 / cam.zoom;
    ui.scopeOverlay(true, cam.zoom);                                    // vignette + '×N'
  }

  // server-aim raycast — shared by both modes
  tank.aimPoint = raycast(cam.position, cam.forward(), 720) ?? pointAt(cam, 720);
  ui.reticle.projectOnSurface(tank.aimPoint,
                              radiusMeters(tank, distance(cam.position, tank.aimPoint)));
  ui.gunMarker.set(project(gunConvergencePoint(tank)));                 // shows turret lag
}

function stepZoom(cam, dir) {           // dir: +1 in, -1 out
  if (cam.mode === 'ARCADE') {
    if (dir > 0 && cam.step === ORBIT_STEPS.length - 1) enterSniper(cam);
    else cam.step = clamp(cam.step + dir, 0, ORBIT_STEPS.length - 1);
  } else {
    const i = SNIPER_ZOOMS.indexOf(cam.zoom) + dir;
    if (i < 0) exitSniper(cam);         // wheel out of ×2 -> arcade closest step
    else cam.zoom = SNIPER_ZOOMS[clamp(i, 0, maxZoomIndex())];
  }
}
```

Transition rules: `enterSniper` keeps `aimYaw/aimPitch` (no view snap), hides own tank,
fades in scope overlay over ~0.1 s. `exitSniper` restores arcade at the closest orbit step
with the orbit oriented behind the current turret yaw. SPGs replace sniper with strategic
top-down view (not in v1).

---

## Sources

- [WoT official wiki — Battle Mechanics](https://wiki.wargaming.net/en/Battle_Mechanics)
  (terrain types, traverse formula `Tr = Tn×(Ec/Es)×(Rh/Rx)×(Ws/Wc)×Pc`, accuracy = 2σ@100 m,
  post-8.6 re-roll inside circle, aim time = shrink-to-1/3, bloom penalty list, camera modes,
  server reticle, top speed as transmission limit exceedable post-8.0)
- [Battle Mechanics — Fandom mirror](https://worldoftanks.fandom.com/wiki/Battle_Mechanics)
- [GuidesBlitz — terrain resistance](https://guidesblitz.com/terrain-resistance-ground-resistance/)
  (hard/medium/soft classification, ~80% of map is medium)
- [GuidesBlitz — traverse speed](https://guidesblitz.com/traverse-speed-hull-turn-rate/)
  (displayed traverse is hard-ground; scale by Rhard/Rx; example triple 1.2/1.4/2.3;
  neutral vs pivot traverse)
- [WoT Tank Academy — zoom mechanic](https://worldoftanks.asia/en/content/tank-academy/how-to-use-zoom-mechanic/)
  (Shift/wheel entry, default max ×8, up to ×25 via settings, zoom indicator)
- [WoT — game controls guide](https://worldoftanks.com/en/content/guide/newcomers-guide/game_controls/)
