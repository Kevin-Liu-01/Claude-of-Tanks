# Armor & Penetration Mechanics — Implementable Spec

Research target: World of Tanks (PC) armor/penetration model, extended with a modern-tank
layer (composite armor, ERA, APFSDS). Everything below is written to be implemented
directly: formulas, constants, and pseudocode. Angles are in degrees unless noted;
`impactAngle` is measured **from the plate normal** (0° = perpendicular, dead-on hit).

Primary sources: [wiki.wargaming.net Battle Mechanics](https://wiki.wargaming.net/en/Battle_Mechanics),
[WoT Fandom: Gunnery & Armor Penetration](https://worldoftanks.fandom.com/wiki/Gunnery_%26_Armor_Penetration),
[13disciple module-damage breakdown](https://www.13disciple.stream/module-damage-mechanics.html),
Wargaming support articles, [Kontakt-5 (Wikipedia)](https://en.wikipedia.org/wiki/Kontakt-5),
[Sloped armour (Wikipedia)](https://en.wikipedia.org/wiki/Sloped_armour).

---

## 1. Shell types and their flags

| Shell | Normalization | Ricochet at | Pen loss w/ distance | Notes |
|-------|--------------|-------------|----------------------|-------|
| AP    | 5°           | ≥ 70°       | moderate (linear with range) | classic kinetic |
| APCR  | 2°           | ≥ 70°       | high (loses pen faster than AP) | fast, subcaliber |
| HEAT  | 0°           | ≥ 85°       | none | chemical jet; killed by spaced armor |
| HE    | 0°           | never       | none | always "does something"; splash |
| APFSDS (modern) | 2° | ≥ 78° (see §11) | very low | long rod; slope-resistant |

Suggested data structure:

```js
const SHELL = {
  AP:     { kind:'KE', normalization: 5, ricochetAngle: 70, distFalloff: 0.05 }, // 5% pen lost per 100 m beyond 100 m (tune)
  APCR:   { kind:'KE', normalization: 2, ricochetAngle: 70, distFalloff: 0.10 },
  HEAT:   { kind:'CE', normalization: 0, ricochetAngle: 85, distFalloff: 0.00 },
  HE:     { kind:'HE', normalization: 0, ricochetAngle: 999, distFalloff: 0.00 },
  APFSDS: { kind:'KE', normalization: 2, ricochetAngle: 78, distFalloff: 0.01, longRod: true },
};
```

WoT models AP/APCR pen falloff per-gun via a `penetration@100m / penetration@500m` pair;
linear interpolation between them, clamped, is exactly what the client does. HE/HEAT lose
zero penetration with distance.

---

## 2. Effective thickness vs impact angle

Line-of-sight (LOS) thickness through a plate:

```
effectiveThickness = nominalThickness / cos(impactAngle)
```

Reference values: 0° → 100%, 30° → 115.5%, 45° → 141.4%, 60° → 200%, 70° → 292.4%.

Implementation: `impactAngle = acos(clamp(dot(-shellDir, plateNormal), 0, 1))`. Compute per
plate the shell ray crosses. Guard the division: cap `impactAngle` at ~89° before dividing
(ricochet checks fire long before that anyway for KE; HE/HEAT hit at any angle).

---

## 3. Normalization

Normalization rotates the shell's *effective* impact angle toward the plate normal before
computing LOS thickness:

```
effectiveAngle = max(0, impactAngle - normalization)
effectiveThickness = nominalThickness / cos(radians(effectiveAngle))
```

Constants (WoT since 8.6): **AP = 5°, APCR = 2°, HEAT = 0°, HE = 0°.**
Normalization is applied **after** the ricochet check (a 71° AP hit ricochets; it does not
get normalized down to 66° first).

---

## 4. Ricochet

Checked first, against the **raw** impact angle:

- **AP / APCR:** ricochet if `impactAngle > 70°` — regardless of penetration value.
- **HEAT:** ricochet ("no detonation") if `impactAngle > 85°` (since 0.8.9).
- **HE:** never ricochets; it detonates on the surface no matter the angle.
- Ricochet is suppressed by 3× overmatch (see §5).
- A ricocheted AP/APCR shell continues flying with **full penetration retained** (WoT ≥9.14
  keeps full pen; earlier builds used 75% — pick full pen) and may strike another plate or
  vehicle. HEAT ricochet just deflects once, then despawns. External modules other than
  the gun never cause ricochet.

```js
function ricochets(shell, impactAngleDeg, caliber, plateNominal) {
  if (shell.type === 'HE') return false;
  if (caliber >= 3 * plateNominal) return false;         // 3x overmatch: never ricochet
  return impactAngleDeg > SHELL[shell.type].ricochetAngle;
}
```

---

## 5. Overmatch (caliber vs plate thickness) — AP/APCR only

Let `C = shellCaliber (mm)`, `T = plate nominal thickness (mm)`.

- **C ≥ 3T ("3-caliber rule"):** ricochet is impossible at any angle. Shell still must
  penetrate the (angled) effective thickness — overmatch doesn't grant free penetration,
  but with C ≥ 3T the boosted normalization below usually makes it trivial.
- **C ≥ 2T ("2-caliber rule"):** normalization is amplified:

```
normalization' = normalizationBase * 1.4 * C / T
```

Example: 122 mm AP (base 5°) vs 40 mm plate → 5 × 1.4 × 122/40 = 21.35° normalization.
Apply the amplified normalization in the §3 formula. HEAT and HE get no overmatch
(modern HE in WoT 1.13+ has its own 3T-caliber/2T-pen overmatch; for the game, keep HE
simple — see §8).

---

## 6. Penetration and damage RNG (±25%)

Both the shell's listed penetration and listed damage are **uniformly** randomized ±25%
per shot (community consensus: uniform, possibly center-weighted; uniform is fine):

```js
const roll = (avg) => avg * (0.75 + Math.random() * 0.5);   // U[0.75, 1.25]

penetrationRoll = roll(shell.penetrationAtRange(distance));
damageRoll      = roll(shell.avgDamage);
```

The pen roll is made **once per shot** and compared to the summed effective thickness of
everything the shell must pass through. Decision: `penetrates = penetrationRoll >= totalEffectiveThickness`.
On non-penetration, KE/HEAT shells deal **zero** hull damage (HE differs, §8).

---

## 7. Spaced armor, screens, tracks

Spaced armor (side skirts, gun mantlet outer layer, tracks acting as a screen, turret
stowage bins) is a separate plate with an air gap before main armor.

Rules:
- The shell resolves ricochet + normalization **independently at each layer**. A shell may
  ricochet off a screen; the deflected ray is re-traced.
- KE (AP/APCR): subtract the screen's effective thickness from the pen roll, then continue
  the ray to the main armor: `remainingPen = penetrationRoll - screenEffectiveThickness`.
- **HEAT vs spaced armor (the key interaction):** the jet forms at the *first* surface hit.
  After piercing the screen, HEAT loses **5% of its penetration per 10 cm of air-gap
  travel** before reaching main armor:

```js
remainingPen = (penRoll - screenEffectiveThickness) * (1 - 0.05 * (gapMeters / 0.10));
// clamp at 0. gapMeters measured along the shell ray between layers.
```
- HE detonates on the first surface it touches (screen counts), so spaced armor absorbs
  HE splash almost completely (splash then attenuates through the main plate, §8).
- Tracks: treat as a spaced plate of `trackArmor` mm (typ. 15–40 mm) covering the hull side
  lower area; a hit always damages the track module (§9) *and* continues as a screen hit.
- After a full penetration, let the shell ray continue for **10× caliber** distance inside
  the tank to collect module/crew hits; a KE shell can even exit and hit a second vehicle
  with `remainingPen`.

---

## 8. HE mechanics

Use the classic (pre-1.13) model — it's self-consistent and easy to implement:

1. Roll pen as usual. If `penRoll >= effectiveThickness` at the impact point (HE has no
   normalization; ratio uses LOS thickness), it's a **full penetration**: full `damageRoll`
   plus internal blast module/crew checks along a cone.
2. Otherwise the shell explodes on the armor surface. Damage at the point of impact /
   to splashed targets:

```
splashDamage = 0.5 * damageRoll * (1 - dist / splashRadius) - 1.1 * (nominalArmor + spallLiner)
splashDamage = max(0, splashDamage)
```

   - `dist` = distance from detonation point to the impacted plate (0 for direct hits).
   - `nominalArmor` = thickness of the plate facing the blast **at the thinnest point the
     blast can reach** (WoT searches for the weakest reachable plate within the sphere;
     acceptable simplification: use the hit plate).
   - `splashRadius` scales with caliber, e.g. `radius_m ≈ 0.4 * caliber_mm / 25` (105 mm ≈ 1.7 m,
     152 mm ≈ 2.4 m; tune to taste).
3. HE always runs module/crew splash checks even without hull damage (crew chance is
   lower, §9), which is why HE "resets caps" and breaks tracks reliably.

---

## 9. Hitboxes, module damage, saving throws

### Armor zones
Model each tank as a set of convex collision plates grouped into zones, each with nominal
thickness: hull front upper/lower glacis, hull sides, hull rear, hull roof/belly (thin — 
overmatch bait), turret front, mantlet (often 2 layers = spaced), turret sides/rear/roof,
cupola (weakspot), MG port / driver's hatch weakspots. Internal volume contains module
and crew hitboxes (boxes/capsules) placed roughly where the real components live:
engine+fuel rear, transmission front (German tanks: front fires), ammo rack in turret
bustle and/or hull front sides, driver front-left, etc.

### Module HP and saving throws
Each module has its own HP pool, independent of hull HP. When the shell ray intersects a
module hitbox (after penetrating armor, or as splash), first roll the **saving throw** —
the chance the module takes damage at all:

| Module              | Chance to be damaged when hit |
|---------------------|-------------------------------|
| Tracks              | 100% |
| Engine              | 45% |
| Fuel tank           | 45% |
| Observation device  | 45% |
| Turret ring         | 45% |
| Radio               | 45% |
| Gun                 | 33% |
| Ammo rack           | 27% |
| Crew member (AP/APCR/HEAT) | 33% |
| Crew member (HE splash)    | 10% |

If the save fails (module IS hit), apply module damage. WoT uses a hidden per-shell
`moduleDamage` value (~roughly proportional to caliber) with ±25% RNG. Implementable
default: `moduleDamage = shell.caliber * 1.0 ± 25%` and module HP pools like:

| Module | HP (baseline, scale by tier) |
|--------|------------------------------|
| Track  | 100 (repairs to 50 "yellow" automatically) |
| Engine | 160 |
| Fuel tank | 120 |
| Ammo rack | 150 |
| Gun    | 150 |
| Radio  | 90 |
| Observation device | 80 |
| Turret ring | 120 |

States: **> 50% HP = healthy**, **≤ 50% = damaged (yellow)** with a debuff, **0 = destroyed
(red)**. Crew auto-repairs a red module back to yellow (50%) over `repairTime` seconds;
consumable repair restores to 100%.

Yellow/red effects:
- **Tracks:** red = immobilized until repaired. (Damaging a track absorbs the shell's hull
  damage unless the ray also passes into the hull — tracks are both a module and a screen.)
- **Engine:** yellow = −50% engine power; red = immobile. Every damaging hit to the engine
  rolls the engine's **fire chance** (§10).
- **Fuel tank:** no debuff while yellow; **red = guaranteed fire (100%)**.
- **Ammo rack:** yellow = +50% reload time; **red = ammo detonation → vehicle instantly
  destroyed** regardless of remaining HP (skip if rack HP buffed and empty racks optional).
- **Gun:** yellow = worse accuracy/no aim shrink; red = cannot fire until repaired.
- **Radio:** reduced signal/minimap share range.
- **Observation device (viewport):** −50% view range while damaged.
- **Turret ring:** slower/locked traverse.

### Crew
Crew members (commander, gunner, driver, loader, radioman) are binary: healthy or knocked
out. Knocked out = that crewman's function degrades (gunner → slow aim, driver → slow
tank, loader → slow reload, commander → view range & loss of bonuses). First-aid
consumable revives. If **all** crew are knocked out, vehicle is dead. Injury chance uses
the table above per hit ray intersection.

---

## 10. Fire

- Trigger sources: any damaging hit to the **engine** rolls `engineFireChance`
  (per-engine constant, typically **10–20%**, some engines 40%); a **destroyed fuel tank**
  ignites with **100%** chance; transmission hits count as engine hits (front-mounted
  transmission = frontal fires).
- While burning: tick every **0.5 s**. Per tick: hull damage ≈ **0.5% of max HP** plus
  module damage to engine/fuel/ammo (small fixed amount, e.g. 10 module HP per tick).
- Duration: base burn ~8–12 ticks with each tick rolling an extinguish chance
  (fire "dies down"); firefighting skill raises the per-tick self-extinguish probability;
  manual extinguisher ends it immediately; automatic extinguisher triggers on ignition
  after ~0.5 s.

```js
onFireTick(tank) {
  tank.hp -= 0.005 * tank.maxHp;
  for (m of [engine, fuelTank, ammoRack]) m.hp -= 10;
  if (rand() < tank.extinguishChancePerTick) tank.fire = false;
}
```

---

## 11. Modern extension — composite armor, ERA, APFSDS

### 11.1 Composite armor: dual RHAe ratings

Real composites (Chobham, combination-K) resist shaped-charge jets far better than steel
of equal mass, and kinetic rods somewhat better. Model every modern plate with **two
effective thickness numbers** instead of one:

```js
plate = { thicknessKE: 600, thicknessCE: 900, nominalForOvermatch: 250 /* physical mm */ };
```

- KE shells (AP/APCR/APFSDS) test against `thicknessKE / cos(effAngle)`.
- CE shells (HEAT, ATGM) test against `thicknessCE / cos(effAngle)`.
- Overmatch/ricochet geometry uses the **physical** plate thickness (`nominalForOvermatch`),
  not the RHAe rating — a 3BM60 rod doesn't ricochet off a roof because the roof has
  fancy RHAe.
- Typical ratios for flavor: steel 1.0/1.0; composite ~1.2–1.5 KE, 2.0–3.0 CE per physical mm.

### 11.2 ERA (explosive reactive armor)

ERA is a consumable spaced layer: each ERA tile is a small hitbox that **detonates once**
then is gone (visibly removed from the model). Real-world anchors: Kontakt-1 cuts single
HEAT jets 50–80%; Kontakt-5 ≈ 600 mm CE and 200–250 mm KE RHAe, ~20% APFSDS pen cut;
Relikt claims >50% vs rods; tandem warheads defeat single-layer ERA (precursor charge
pops the tile, main jet hits bare armor).

Game abstraction per tile:

```js
era = { keReduction: 0.20,   // fraction of remaining pen removed from long rods
        ceFlat: 400,         // flat mm subtracted from HEAT pen (heavy ERA)
        spent: false };

function applyERA(shell, pen) {
  if (era.spent) return pen;
  era.spent = true;                        // tile detonates either way
  if (shell.tandem) return pen;            // precursor eats the tile, main charge unaffected
  if (shell.kind === 'CE') return max(0, pen - era.ceFlat);
  if (shell.kind === 'KE') return pen * (1 - era.keReduction);
  return pen;                              // HE: tile detonates, adds its thickness to splash armor
}
```

Light ERA (Kontakt-1 class): `ceFlat` 300–500, `keReduction` 0. Heavy ERA (Kontakt-5/Relikt
class): `ceFlat` 500–700, `keReduction` 0.15–0.5. HE detonating on ERA just pops tiles.

### 11.3 Why long-rod APFSDS ignores slope (and the abstraction)

Physically: a long rod (L/D 20–30) hitting an oblique plate doesn't behave like a solid
shot. The tip erodes and the rod "turns into" the plate; sloped armor only offers roughly
its **line-of-sight** thickness, not the multiplied protection older AP saw
([Sloped armour](https://en.wikipedia.org/wiki/Sloped_armour)). Pre-APFSDS rounds lost
extra energy to deflection ("sliding"), so slope > LOS; rods collapse that bonus back to
plain LOS, and very high obliquity thin plates can even *underperform* LOS against rods.

Clean game abstraction — **slope efficiency exponent** per shell kind:

```
effectiveThickness = thickness_vs_kind / cos(effAngle) ^ slopeExponent
   AP/APCR: slopeExponent = 1.4   (slope worth MORE than LOS — rewards angling classics)
   APFSDS:  slopeExponent = 1.0   (pure LOS — slope barely helps)
   HEAT:    slopeExponent = 1.0   (jets also just see LOS)
```

(If WW2-era plates should behave classically with exponent 1.0 for everything, instead give
APFSDS a *ricochet* advantage only: ricochetAngle 78° and normalization that scales with
angle, `norm = 2° + 0.08 * impactAngle`. Either abstraction works; the exponent is simpler
and reads clearly in a damage-log UI.)

APFSDS also overmatches aggressively: use `C = rodDiameter * 3` as the effective caliber
for the §5 rules so thin roofs/skirts never bounce rods.

---

## 12. Consolidated resolution algorithm

```pseudocode
function resolveShellHit(shell, ray, tank, distanceTraveled):
    pen  = uniform(0.75, 1.25) * shell.penAt(distanceTraveled)   # ±25% pen roll (once)
    dmg  = uniform(0.75, 1.25) * shell.avgDamage                 # ±25% dmg roll (once)
    layersCrossed = 0
    hullPenetrated = false

    for hit in traceRayThroughTank(ray, tank):                   # ordered plate/module intersections
        if hit.isModuleOrCrew:
            if hullPenetrated or hit.isExternal:                 # tracks, gun, viewports are external
                rollModuleDamage(shell, hit, dmg)                # saving throw table §9, fire §10
            continue

        plate = hit.plate
        angle = angleFromNormal(ray.dir, plate.normal)

        # --- 1. RICOCHET (raw angle, physical thickness) ---
        if shell.type != HE and shell.caliber < 3 * plate.physicalMM
           and angle > shell.ricochetAngle:
            ray = reflect(ray, plate.normal)                     # keep pen; re-trace (max 1-2 bounces)
            continue outer trace with new ray

        # --- 2. NORMALIZATION (+ 2x overmatch boost, KE only) ---
        norm = shell.normalization
        if shell.isKE and shell.caliber >= 2 * plate.physicalMM:
            norm = norm * 1.4 * shell.caliber / plate.physicalMM
        effAngle = max(0, angle - norm)

        # --- 3. EFFECTIVE THICKNESS (KE/CE split + slope exponent) ---
        base = shell.isCE ? plate.thicknessCE : plate.thicknessKE
        eff  = base / cos(effAngle) ^ shell.slopeExponent

        # --- ERA layer? ---
        if plate.isERA: pen = applyERA(shell, pen); continue

        # --- 4. PEN CHECK ---
        if shell.type == HE:
            if pen >= eff: hullPenetrated = true; tank.hp -= dmg
            else: tank.hp -= max(0, 0.5*dmg*(1 - d/splashR) - 1.1*(plate.physicalMM + spallLiner))
            runSplashModuleChecks(shell, hit)                    # §8/§9
            break                                                # HE stops at first surface

        if plate.isSpaced or plate.isTrack:
            pen -= eff
            if shell.type == HEAT:
                pen -= penRollInitial * 0.05 * (airGapMeters / 0.10)   # §7 HEAT decay
            if pen <= 0: break                                   # absorbed by screen
            continue                                             # on to main armor

        if pen >= eff:                                           # MAIN ARMOR PENETRATED
            hullPenetrated = true
            tank.hp -= dmg                                       # 5. damage roll applied
            pen -= eff
            limit ray length to 10 * caliber for internal module sweep   # §7
            continue                                             # 6. module/crew rolls happen
        else:
            break                                                # bounce/absorb, 0 damage

    if tank.ammoRack.hp <= 0: destroyTank(tank)                  # detonation
    if tank.allCrewDead(): destroyTank(tank)
```

`rollModuleDamage` = saving-throw table (§9) → subtract `moduleDamage ±25%` → apply
yellow/red effects → engine/fuel fire rolls (§10). Deterministic order matters for
replays: consume RNG in fixed sequence (pen, dmg, then per-intersection module rolls).

### Tuning constants quick sheet
`NORM_AP=5, NORM_APCR=2, RICO_KE=70, RICO_HEAT=85, OVERMATCH_NORICO=3.0,
OVERMATCH_NORMBOOST=2.0 (factor 1.4*C/T), RNG=±0.25 uniform, HEAT_DECAY=5%/10cm,
POSTPEN_TRAVEL=10*caliber, FIRE_TICK=0.5s, FIRE_HP_TICK=0.5% maxHP,
ENGINE_FIRE=10–20%, FUELTANK_FIRE_ON_DESTROY=100%, CREW_HIT=33% (HE 10%),
AMMORACK_HIT=27%, ENGINE_HIT=45%, TRACK_HIT=100%.`
