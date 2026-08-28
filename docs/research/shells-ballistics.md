# Shells & Ballistics Spec — claude-of-tanks

NOTE: on any conflict with armor-penetration.md, armor-penetration.md wins —
it is the implementation authority for damage.ts.

Research-backed, implementable spec for shell types, ballistics, gun accuracy, reload,
and tracer visuals for a World of Tanks-style arcade tank game. All formulas are the
gameplay abstractions used by WoT-class games (not full exterior ballistics), tuned with
real-world muzzle velocities. Constants tables at the end are ready to paste into code.

Sources: [WoT wiki Battle Mechanics (wargaming.net)](https://wiki.wargaming.net/en/Battle_Mechanics),
[WoT Fandom Battle Mechanics](https://worldoftanks.fandom.com/wiki/Battle_Mechanics),
[WoT Fandom Gunnery & Armor Penetration](https://worldoftanks.fandom.com/wiki/Gunnery_%26_Armor_Penetration),
[WoT Console penetration mechanics](https://modernarmor.worldoftanks.com/support/en/products/wotx/article/302/),
[WoT ammo overview](https://modernarmor.worldoftanks.com/support/en/products/wotx/article/301/),
[Sandbox HE revision](https://worldoftanks.eu/en/news/general-news/sandbox-october/),
[2A46 125 mm gun (Wikipedia)](https://en.wikipedia.org/wiki/2A46_125_mm_gun),
[105 mm gun T5 (Wikipedia)](https://en.wikipedia.org/wiki/105_mm_gun_T5),
[APDS (Wikipedia)](https://en.wikipedia.org/wiki/Armour-piercing_discarding_sabot),
[spall liner guide](https://thebunker.freeforums.net/thread/238/quick-guide-spall-liner).

---

## 1. Shell types overview

| Type | Full name | Kill mechanism (real) | Game role |
|---|---|---|---|
| AP | Armor-Piercing (full-bore) | Kinetic slug punches through, spalls inside | Standard round. Balanced pen/damage/cost |
| APCR | AP Composite Rigid (sub-caliber, hard core) | Light shell, dense core, very fast | "Gold" kinetic round: +pen, +velocity, worse pen falloff, worse normalization |
| HEAT | High-Explosive Anti-Tank (shaped charge) | Copper jet burns through on detonation — chemical, velocity-independent | High flat pen, no distance falloff, but eaten by spaced armor/tracks, no normalization |
| HE | High-Explosive | Blast + fragmentation | Big alpha vs soft targets; splash damage on non-pen; module/crew shredder |
| HESH | HE Squash Head | Plastic explosive pancakes on armor, spalls the inside face | HE variant with much higher pen; splash like HE on non-pen |
| APFSDS | AP Fin-Stabilized Discarding Sabot | Long-rod dart, extreme velocity | Endgame kinetic: highest pen + velocity, near-zero falloff, flattest arc |

### Real muzzle velocities (reference data)

- WWII AP, 75–88 mm class: 750–1,000 m/s (e.g. 8.8 cm KwK 36: ~773 m/s AP; KwK 43: ~1,000 m/s).
- WWII/postwar APCR/APDS: 1,100–1,400 m/s (17-pdr APDS ~1,200 m/s).
- 105 mm T5/L7-era AP: ~914 m/s; 105 mm APFSDS ~1,500 m/s.
- 125 mm 2A46: APFSDS 1,715–1,800 m/s, HEAT 905–950 m/s, HE ~760 m/s.
- 120 mm M256 APFSDS: ~1,490–1,770 m/s.
- HE is always the slowest full-bore round: 600–800 m/s typical.

Game abstraction: velocity is a per-shell-type multiplier on the gun's base AP velocity
(see constants table §9). WoT uses real-ish velocities directly; that feels right at our
map scales (shell flight 0.3–1.5 s across a map).

---

## 2. Ballistic flight model (gameplay abstraction)

Shells are simulated projectiles, not hitscan.

```
pos += vel * dt
vel.y -= G_SHELL * dt          // no drag; muzzle speed is constant horizontally
```

- `G_SHELL = 9.81 * GRAVITY_SCALE`. Use `GRAVITY_SCALE = 2.0`–`2.5` so arcs are visible
  and leading targets matters at typical engagement ranges (100–400 m in-world). WoT
  itself uses exaggerated gravity relative to its compressed map scale.
- No air drag: penetration falloff (§4) fakes velocity decay, which is cheaper and
  matches WoT behavior ("dispersion increases linearly with distance", pen loss is a
  simple per-100m function).
- Aim solution: when the player aims at a point at distance `d`, raise the barrel by the
  ballistic offset `theta = 0.5 * asin(clamp(G_SHELL * d / v^2, -1, 1))` so the reticle
  is true. Faster shells (APCR/APFSDS) therefore shoot flatter and need less lead —
  that is their gameplay reward, for free, from this one formula.
- Integrate with substeps or swept raycast (`prevPos → pos` segment) each frame so fast
  shells never tunnel through armor. APFSDS at 1,700 m/s moves ~28 m per 60 Hz frame:
  segment raycast is mandatory.
- Max shell lifetime ~6 s, then despawn (HE/HESH detonate on terrain instead).

---

## 3. Penetration roll & armor interaction (shared kinetic pipeline)

On impact, compute in this order (WoT model):

1. **Impact angle** `alpha` = angle between shell velocity and armor surface normal.
2. **Ricochet check** (before pen roll): AP/APCR auto-bounce at `alpha > 70°`;
   APFSDS at `alpha > 78°` (long rods are slope-resistant, armor-penetration.md §11.3);
   HEAT at `alpha > 85°`; HE/HESH never ricochet (they detonate).
   Overmatch: if `caliber >= 3 * armorNominal`, no ricochet possible (AP-family only).
3. **Normalization**: reduce effective angle: `alpha -= normalizationDeg`.
   AP 5°, APCR 2°, APFSDS 2°, HEAT/HE/HESH 0°.
   Overmatch normalization: if `caliber >= 2 * armorNominal`,
   `norm = baseNorm * 1.4 * caliber / armorNominal`.
4. **Effective armor** `armorEff = armorNominal / cos(alpha)`.
5. **Pen roll**: `penRoll = penAtDistance * random(0.75, 1.25)`  (±25%, WoT standard).
6. Penetrates if `penRoll >= armorEff`. Ricocheted AP-family shells may fly on with
   25% pen loss and can hit another plate (nice-to-have; skip for v1).

Spaced armor / tracks / external modules: kinetic shells lose the spaced plate's
effective thickness from `penRoll` and continue; **HEAT** instead detonates on the first
plate and traverses the air gap with heavy pen decay — abstract as: HEAT loses
`50 + 5·(gap in dm)` mm of pen after striking spaced armor, or simply multiply remaining
pen by 0.7 per spaced layer for v1. This is HEAT's designed weakness.

---

## 4. Penetration falloff with distance

Pen displayed = pen at 0–100 m; no loss inside 100 m (WoT rule). Beyond that, linear
per-100m loss, clamped to a floor:

```
penAtDistance(d) = penBase * max(minFrac, 1 - lossPer100m * max(0, d - 100) / 100)
```

| Type | lossPer100m | minFrac | Rationale |
|---|---|---|---|
| AP | 0.04 (4%) | 0.60 | light loss (WoT: ~2–17% total depending on tier; 4%/100m is mid) |
| APCR | 0.07 (7%) | 0.50 | light shell sheds velocity fast — the tradeoff for speed |
| HEAT | 0.00 | 1.00 | chemical energy, velocity-independent |
| HE | 0.00 | 1.00 | blast, velocity-independent |
| HESH | 0.00 | 1.00 | blast, velocity-independent |
| APFSDS | 0.01 (1%) | 0.85 | long rod barely decelerates at game ranges |

---

## 5. Damage model per type

All damage rolls are `baseDamage * random(0.75, 1.25)` (±25%, all types — WoT standard).

- **AP / APCR / APFSDS** — full damage on pen, zero hull damage on non-pen/ricochet
  (play a loud "clang"). On pen, run an internal ray from entry point along shell
  direction; every module/crew hitbox intersected takes module damage (see §7).
  APCR/APFSDS same alpha as AP for the same gun (they buy pen+velocity, not damage).
  Optionally give APFSDS ~0.9× alpha (small rod = less behind-armor effect).
- **HEAT** — full damage on pen (internal ray same as AP), nothing on non-pen.
  No pen falloff, no normalization, 85° ricochet, spaced-armor penalty (§3).
- **HE** — see §6. Highest alpha of any type for a given gun (~1.5–2× AP alpha),
  lowest pen (~0.5× caliber in mm as a rule of thumb: 105 mm HE ≈ 53 mm pen).
  (Shipped roster values follow this rule as of r1: 76→38, 85→43, 88→44,
  122→61, 75→38 mm.)
- **HESH** — HE mechanics with roughly 2× HE's penetration and slightly lower splash.
  Real HESH spalls without penetrating; abstract that as: on non-pen, HESH uses the HE
  non-pen formula but with `spallBonus = 1.25` multiplier (it is *better* than HE at
  hurting through armor). On pen it does full (HE-class) alpha. British flavor round.

---

## 6. HE / HESH splash and non-pen damage

On impact (armor, ground, anything), if a direct-hit pen roll succeeds → full alpha +
internal module ray (like AP). Otherwise **explode at impact point**:

For every vehicle with any armor point inside `blastRadius`:

1. Find the hit point: nearest point on the vehicle's armor to the explosion center
   (v1: nearest point on hull AABB/compound collider; WoT searches for the weakest
   reachable spot — nearest-point is a fine approximation).
2. `dist` = distance from explosion center to that point.
3. Splash penetration vs that armor, then damage (classic WoT pre-1.13 formula, which is
   the better fit for an arcade game because HE always *can* do something):

```
splashDamage = max(0,
    (baseDamage / 2) * (1 - dist / blastRadius)   // linear falloff
    - 1.1 * (armorNominal + spallLinerBonus)      // armor absorbs
) * heshSpallBonus                                 // 1.0 HE, 1.25 HESH
```

- `1.1 * armor` term: thicker armor eats splash; heavies shrug off arty splash while
  paper TDs get gutted. `spallLinerBonus` slot for a future equipment item
  (WoT spall coefficients: none 1.0 / light 1.2 / medium 1.25 / heavy 1.3 / super 1.5 —
  implement as `armor * spallCoef` in the absorb term if added).
- Terrain does NOT fully block splash (WoT rule) — optional: halve `splashDamage` if a
  terrain raycast from explosion to hit point is occluded.
- Minimum guaranteed damage floor optional: WoT post-1.13 makes HE "always damage on
  hit"; if desired, `max(splashDamage, 0.05 * baseDamage)` on **direct** non-pen hits
  only, never on pure splash.
- **Module/crew damage through non-pens**: on any HE/HESH non-pen or splash that reaches
  a vehicle, roll module damage against every external module in the blast sphere
  (tracks especially — HE is the de-tracking round) and against internal modules with
  `moduleSaveRoll` (§7) at half effect. This is why HE non-pens still break tracks and
  hurt crew.

`blastRadius` scales with caliber: `radius_m ≈ 0.66 * (caliber_mm / 30)^1.3`, clamped
1–8 m. Examples: 75 mm → 2.2 m, 105 mm → 3.4 m, 122 mm → 4.2 m, 152 mm → 5.6 m,
183 mm → 7.4 m.

---

## 7. Module & crew damage (all shell types)

- Each module (engine, ammo rack, fuel tank, tracks, gun, turret ring, radio) and crew
  member has its own HP and a hitbox inside/на the hull.
- Kinetic/HEAT pen: ray from entry point along velocity; each intersected module takes
  `moduleDamage = shell.moduleDamage`, but only with probability = module's
  `damageChance` (WoT-style saving throw, e.g. engine 45%, ammo rack 27%, crew 33%).
- Module at ≤50% HP = "damaged" (yellow, degraded function); 0 HP = "destroyed" (red)
  until repaired. Ammo rack destroyed = vehicle explodes. Fuel tank destroyed = fire.
- HE adds area module damage per §6 even without penetrating — the signature "no damage
  but broke your track and killed your gunner" HE hit.

---

## 8. Gun accuracy model

### Dispersion

- Gun stat: `sigma100` = dispersion in meters at 100 m; the reticle circle radius is
  `2σ` (WoT: accuracy value = 2 standard deviations; 95.45% of shots inside circle).
- Typical values: sniper TD 0.30–0.35, medium 0.35–0.40, heavy 0.40–0.46, derp/arty
  0.50–0.60 (m @ 100 m).
- Scales linearly with distance: `sigma(d) = sigma100 * d / 100`.
- Shot placement: sample a 2D Gaussian in the aim plane with std `σ_current`;
  **re-roll (or clamp with a uniform roll) anything outside 2σ** so no shot leaves the
  visible circle (WoT 0.8.6 behavior). Center-biased: most shots near the middle.

### Aim time: exponential shrink

The aiming circle multiplier `f` (1 = fully aimed) decays exponentially toward 1:

```
f(t) = 1 + (f0 - 1) * exp(-t / tau),   tau = aimTime / ln(3)
sigma_current = sigma(d) * f(t)
```

`aimTime` is the listed stat = time for the *excess* bloom to shrink to ⅓ (WoT: "time
for the circle to shrink to a third"). Typical aimTime: 1.7–2.5 s mediums/TDs, 2.5–3.4 s
heavies, 4–6 s arty.

### Bloom multipliers

Each condition contributes a factor; combine as root-sum-square of the excesses (or
simply take the max, WoT combines multiplicatively — multiplicative is simplest):

```
f_target = fMove * fHullTraverse * fTurretTraverse   // continuous conditions
firing adds an instant additive kick: f0 += fireBloom (decays via the same exponential)
```

| Condition | Multiplier (typical) | Notes |
|---|---|---|
| Moving (full speed) | 1 + 0.15 * speed_kmh / 10 → cap ~2.5 | scale linearly with speed |
| Hull traverse (full rate) | 1 + 0.15 * yawRate_dps / 10 → cap ~2.5 | linear with yaw rate |
| Turret traverse (full rate) | 1 + 0.10 * turretRate_dps / 10 → cap ~1.8 | smaller penalty than hull |
| Firing (instant bloom) | +2.0 to +4.0 added to f | biggest single penalty; derps higher |
| Damaged gun | ×2.0 on sigma | WoT: "halved accuracy" |

Good starter constants: `f` fully-bloomed while driving+turning ≈ 4–6×; a fired shot
adds +3; standing still everything decays back to 1.0 with `tau` above. This produces
the classic stop–aim–shoot rhythm.

---

## 9. Reload times by caliber class

Reload scales superlinearly with caliber (loader ergonomics + shell mass):

| Caliber class | Example guns | Reload (s) | DPM feel |
|---|---|---|---|
| ≤57 mm (autocannon/light) | 37–57 mm | 1.5–4 (or 3-round clip, 0.8 intra) | hose |
| 75–90 mm (medium) | 75, 76, 88, 90 mm | 6–9 | workhorse |
| 100–122 mm (heavy/TD) | 100, 105, 120, 122 mm | 9–13 | trading |
| 130–155 mm (big alpha) | 130, 150, 152, 155 mm | 14–20 | one shot per duel |
| ≥170 mm (derp/arty) | 170, 183 mm | 22–30 | siege |

Formula fit: `reload_s ≈ 0.9 * (caliber_mm / 25)^1.35`. Premium/gold shells do not
change reload. Dead/“damaged” loader ×1.5–2.

---

## 10. Tracer visuals per shell type

All tracers: emissive core line/billboard + additive glow, length scales with speed
(`len = clamp(v * 0.02, 2, 12)` meters), plus small point light for night/shadow pop.
Muzzle flash size scales with caliber. Render tracer at true shell position so players
can dodge and counter-aim (WoT behavior).

| Type | Color (core / glow) | Thickness | Perceived speed | Extras |
|---|---|---|---|---|
| AP | `#ffd27a` warm yellow / orange glow | 0.10 m | fast | classic tracer |
| APCR | `#e8f4ff` white-blue / pale blue | 0.06 m (thin) | very fast, flat | slight sparkle; shortest visible time |
| HEAT | `#ff6a3c` red-orange / red | 0.12 m | medium | faint smoke puffs along path |
| HE | `#ffb02e` deep orange / yellow | 0.18 m (fat) | slow, visibly arcing | big flash + smoke ring on detonation |
| HESH | `#ffc46b` amber / orange | 0.16 m | slow | HE-style detonation with gray spall burst |
| APFSDS | `#c8ffd8` green-white / green | 0.05 m (needle) | extreme, near-flat | sabot petals discard at muzzle (3 small sprites), faint dust wake |

Non-pen kinetic impact: yellow spark fan + ricochet whine. Pen: brief interior flash +
darker smoke. HE/HESH: scaled fireball = `blastRadius` sphere flash, 0.25 s.

---

## 11. Constants tables (paste into code)

```js
// ---- shells.js ------------------------------------------------------------
// Per-type multipliers applied to a gun's base stats (basePen mm, baseDamage,
// baseVelocity m/s of its AP round). caliber in mm comes from the gun.

export const SHELL_TYPES = {
  AP: {
    velMult: 1.00,            // × gun baseVelocity
    penMult: 1.00,            // × gun basePen
    dmgMult: 1.00,            // × gun baseDamage
    normalizationDeg: 5,
    ricochetDeg: 70,
    penLossPer100m: 0.04, penFloorFrac: 0.60,
    overmatch: true,          // 2x/3x caliber rules apply
    explodes: false, blastRadiusMult: 0,
    spacedArmorPenalty: 0,    // extra pen frac lost per spaced layer
    tracer: { color: 0xffd27a, glow: 0xff9030, width: 0.10 },
    sfx: 'crack',
  },
  APCR: {
    velMult: 1.30, penMult: 1.25, dmgMult: 1.00,
    normalizationDeg: 2, ricochetDeg: 70,
    penLossPer100m: 0.07, penFloorFrac: 0.50,
    overmatch: true, explodes: false, blastRadiusMult: 0,
    spacedArmorPenalty: 0.10,
    tracer: { color: 0xe8f4ff, glow: 0x9cc8ff, width: 0.06 },
    sfx: 'snap',
  },
  HEAT: {
    velMult: 0.85, penMult: 1.35, dmgMult: 1.00,
    normalizationDeg: 0, ricochetDeg: 85,
    penLossPer100m: 0.00, penFloorFrac: 1.00,
    overmatch: false, explodes: false, blastRadiusMult: 0,
    spacedArmorPenalty: 0.30,   // HEAT's big weakness: -30% pen per spaced layer
    tracer: { color: 0xff6a3c, glow: 0xff3020, width: 0.12 },
    sfx: 'whoosh',
  },
  HE: {
    velMult: 0.75, penMult: 0.35, dmgMult: 1.60,
    normalizationDeg: 0, ricochetDeg: 91,     // never ricochets (>90 = disabled)
    penLossPer100m: 0.00, penFloorFrac: 1.00,
    overmatch: false, explodes: true, blastRadiusMult: 1.0,
    spallBonus: 1.0,
    spacedArmorPenalty: 1.0,    // detonates on first thing it touches
    tracer: { color: 0xffb02e, glow: 0xffe080, width: 0.18 },
    sfx: 'boom',
  },
  HESH: {
    velMult: 0.80, penMult: 0.70, dmgMult: 1.55,
    normalizationDeg: 0, ricochetDeg: 91,
    penLossPer100m: 0.00, penFloorFrac: 1.00,
    overmatch: false, explodes: true, blastRadiusMult: 0.85,
    spallBonus: 1.25,           // §6: better through-armor splash than HE
    spacedArmorPenalty: 1.0,
    tracer: { color: 0xffc46b, glow: 0xffa040, width: 0.16 },
    sfx: 'thud-boom',
  },
  APFSDS: {
    velMult: 1.75, penMult: 1.60, dmgMult: 0.90,
    normalizationDeg: 2, ricochetDeg: 78,
    penLossPer100m: 0.01, penFloorFrac: 0.85,
    overmatch: true, explodes: false, blastRadiusMult: 0,
    spacedArmorPenalty: 0.05,
    tracer: { color: 0xc8ffd8, glow: 0x60ff90, width: 0.05 },
    sfx: 'hypersonic-crack',
  },
};

// ---- ballistics.ts ---------------------------------------------------------
export const BALLISTICS = {
  GRAVITY_SCALE: 2.2,               // × 9.81; exaggerated for readable arcs
  RNG_PEN_SPREAD: 0.25,             // ±25% pen roll
  RNG_DMG_SPREAD: 0.25,             // ±25% damage roll
  PEN_FALLOFF_FREE_M: 100,          // no pen loss inside 100 m
  SHELL_MAX_LIFETIME_S: 6,
  OVERMATCH_NO_RICOCHET: 3.0,       // caliber >= 3x armor: never bounces
  OVERMATCH_NORM: 2.0,              // caliber >= 2x armor: norm*1.4*cal/armor
  RICOCHET_PEN_KEEP: 1.0,           // WoT ≥9.14: full pen retained (armor-penetration.md §4)
  HE_ARMOR_ABSORB: 1.1,             // §6 absorb coefficient
  HE_MIN_DIRECT_HIT_FRAC: 0.05,     // floor dmg on direct non-pen HE hit
};

export const blastRadiusM = (caliberMm) =>
  Math.min(8, Math.max(1, 0.66 * Math.pow(caliberMm / 30, 1.3)));

// ---- accuracy.js ------------------------------------------------------------
export const ACCURACY = {
  // sigma100 per gun archetype (meters @ 100 m; reticle radius = 2*sigma)
  SIGMA100: { sniperTD: 0.32, medium: 0.38, heavy: 0.44, derp: 0.55, arty: 0.60 },
  AIM_TIME_S: { sniperTD: 1.9, medium: 2.2, heavy: 2.9, derp: 3.2, arty: 5.0 },
  TAU_FROM_AIMTIME: Math.LN2 / Math.log(3) * 0, // (use aimTime / Math.log(3))
  BLOOM: {
    movePerKmh: 0.015,        // f += speed_kmh * this
    hullTraversePerDps: 0.015,// f += hullYaw_dps * this
    turretTraversePerDps: 0.010,
    fireKick: 3.0,            // instant additive bloom on firing
    fireKickDerp: 4.0,
    maxF: 6.0,
    damagedGunSigmaMult: 2.0,
  },
};
// aiming update per frame:
//   fTarget = 1 + move + hull + turret terms (clamped to maxF)
//   f = fTarget + (f - fTarget) * Math.exp(-dt * Math.log(3) / aimTime)
//   on fire: f = Math.min(maxF, f + fireKick)
//   sigma = sigma100 * (dist/100) * f * (gunDamaged ? 2 : 1)

// ---- guns.js (base stats per caliber class; AP round is the baseline) -------
export const GUN_CLASSES = {
  light57:   { caliberMm: 57,  basePen: 110, baseDamage: 85,  baseVelocity: 900,  reloadS: 3.6,  archetype: 'medium'  },
  medium75:  { caliberMm: 75,  basePen: 145, baseDamage: 160, baseVelocity: 800,  reloadS: 7.0,  archetype: 'medium'  },
  medium90:  { caliberMm: 90,  basePen: 190, baseDamage: 240, baseVelocity: 880,  reloadS: 8.5,  archetype: 'medium'  },
  heavy105:  { caliberMm: 105, basePen: 220, baseDamage: 320, baseVelocity: 950,  reloadS: 10.5, archetype: 'heavy'   },
  heavy122:  { caliberMm: 122, basePen: 250, baseDamage: 420, baseVelocity: 850,  reloadS: 12.5, archetype: 'heavy'   },
  derp152:   { caliberMm: 152, basePen: 90,  baseDamage: 700, baseVelocity: 650,  reloadS: 17.0, archetype: 'derp'    },
  sniper120: { caliberMm: 120, basePen: 270, baseDamage: 400, baseVelocity: 1100, reloadS: 11.0, archetype: 'sniperTD'},
  derp183:   { caliberMm: 183, basePen: 130, baseDamage: 1150,baseVelocity: 600,  reloadS: 26.0, archetype: 'derp'    },
};
// reload fit if generating: reloadS ≈ 0.9 * (caliberMm / 25) ** 1.35

// ---- modules.js -------------------------------------------------------------
export const MODULE_DAMAGE_CHANCE = {
  engine: 0.45, fuelTank: 0.45, ammoRack: 0.27, tracks: 1.0,
  gun: 0.33, turretRing: 0.45, radio: 0.45, crew: 0.33,
};
export const FIRE_CHANCE_ON_FUEL_HIT = 0.45;
export const FIRE_CHANCE_ON_ENGINE_HIT = 0.15;
```

### Derived per-shell example (medium90 gun)

| Shell | Vel (m/s) | Pen @100m | Pen @400m | Alpha | Notes |
|---|---|---|---|---|---|
| AP | 880 | 190 | 167 | 240 | baseline |
| APCR | 1144 | 238 | 188 | 240 | flat arc, fast falloff |
| HEAT | 748 | 257 | 257 | 240 | eaten by spaced armor |
| HE | 660 | 67 | 67 | 384 | 3.0 m blast radius |
| HESH | 704 | 133 | 133 | 372 | 2.6 m blast, spallBonus 1.25 |
| APFSDS | 1540 | 304 | 295 | 216 | endgame ammo |

---

## 12. Implementation order

1. Projectile sim + gravity + swept raycast + AP-only pen pipeline (§2–§4).
2. Accuracy model: sigma, exponential aim, bloom (§8) — this defines game feel.
3. APCR/HEAT/APFSDS as data variants (they are pure constants once §3 exists).
4. HE splash + module damage (§6–§7).
5. HESH (one flag + spallBonus on the HE path).
6. Tracers/impact VFX (§10) — pure presentation, safe to do last; respect
   docs/SCREENSHOT_CONTRACT.md before adding render code.
