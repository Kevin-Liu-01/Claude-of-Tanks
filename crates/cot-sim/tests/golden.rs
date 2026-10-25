//! Bit-exact parity with the TypeScript simulation.
//!
//! `tools/port-golden-vectors.mjs` evaluates the TypeScript modules on fixed
//! inputs and writes `tests/golden/*.json`; these tests evaluate the Rust port
//! on the same inputs and compare the doubles bit for bit. A mismatch prints
//! the two values and their distance in ulps.

use std::collections::BTreeMap;

use cot_sim::ballistics::{
    aim_elevation_rad, apply_dispersion, create_shell, guide_shell_toward, pen_at_distance_mm,
    shell_gravity_mps2, solve_ballistic_gun_lay, step_shell, ShellSpec,
};
use cot_sim::math::Vec3;
use cot_sim::rng::Mulberry32;
use serde::Deserialize;

/// A JSON double: a number, or "NaN" / "Infinity" / "-Infinity".
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(untagged)]
enum JsNum {
    Num(f64),
    Text(JsText),
}

#[derive(Clone, Copy, Debug, Deserialize)]
enum JsText {
    NaN,
    Infinity,
    #[serde(rename = "-Infinity")]
    NegInfinity,
}

impl JsNum {
    fn f64(self) -> f64 {
        match self {
            JsNum::Num(v) => v,
            JsNum::Text(JsText::NaN) => f64::NAN,
            JsNum::Text(JsText::Infinity) => f64::INFINITY,
            JsNum::Text(JsText::NegInfinity) => f64::NEG_INFINITY,
        }
    }
}

#[derive(Debug, Deserialize)]
struct JsVec {
    x: JsNum,
    y: JsNum,
    z: JsNum,
}

impl JsVec {
    fn vec3(&self) -> Vec3 {
        Vec3::new(self.x.f64(), self.y.f64(), self.z.f64())
    }
}

fn golden(name: &str) -> String {
    let path = format!("{}/tests/golden/{name}.json", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"))
}

fn ulps(a: f64, b: f64) -> u64 {
    if a.to_bits() == b.to_bits() {
        return 0;
    }
    if a.is_nan() || b.is_nan() {
        return u64::MAX;
    }
    let ai = a.to_bits() as i64;
    let bi = b.to_bits() as i64;
    let ai = if ai < 0 { i64::MIN - ai } else { ai };
    let bi = if bi < 0 { i64::MIN - bi } else { bi };
    ai.abs_diff(bi)
}

struct Ledger {
    group: &'static str,
    compared: usize,
    mismatches: Vec<String>,
    max_ulps: u64,
}

impl Ledger {
    fn new(group: &'static str) -> Ledger {
        Ledger { group, compared: 0, mismatches: Vec::new(), max_ulps: 0 }
    }

    fn check(&mut self, actual: f64, expect: f64, ctx: impl FnOnce() -> String) {
        self.compared += 1;
        let same = actual.to_bits() == expect.to_bits() || (actual.is_nan() && expect.is_nan());
        if !same {
            let d = ulps(actual, expect);
            self.max_ulps = self.max_ulps.max(d);
            if self.mismatches.len() < 12 {
                self.mismatches.push(format!(
                    "{}: rust {actual:e} ({:#018x}) vs ts {expect:e} ({:#018x}) — {d} ulps",
                    ctx(),
                    actual.to_bits(),
                    expect.to_bits()
                ));
            }
        }
    }

    fn check_vec(&mut self, actual: &Vec3, expect: &JsVec, ctx: &str) {
        self.check(actual.x, expect.x.f64(), || format!("{ctx}.x"));
        self.check(actual.y, expect.y.f64(), || format!("{ctx}.y"));
        self.check(actual.z, expect.z.f64(), || format!("{ctx}.z"));
    }

    fn finish(self) {
        assert!(self.compared > 0, "{}: no golden values compared", self.group);
        assert!(
            self.mismatches.is_empty(),
            "{}: {} of {} doubles differ from the TypeScript vectors (max {} ulps):\n  {}",
            self.group,
            self.mismatches.len(),
            self.compared,
            self.max_ulps,
            self.mismatches.join("\n  ")
        );
    }
}

// ------------------------------------------------------------------ rng ----

#[derive(Deserialize)]
struct RngGolden {
    cases: Vec<RngCase>,
}

#[derive(Deserialize)]
struct RngCase {
    seed: JsNum,
    draws: Vec<JsNum>,
}

#[test]
fn mulberry32_matches_state_core() {
    let golden: RngGolden = serde_json::from_str(&golden("rng")).unwrap();
    let mut ledger = Ledger::new("rng");
    for case in &golden.cases {
        let mut rng = Mulberry32::from_js_number(case.seed.f64());
        for (i, draw) in case.draws.iter().enumerate() {
            let actual = rng.next_f64();
            ledger.check(actual, draw.f64(), || format!("seed {} draw {i}", case.seed.f64()));
        }
    }
    ledger.finish();
}

// ----------------------------------------------------------- ballistics ----

#[derive(Deserialize)]
struct BallisticsGolden {
    constants: Constants,
    specs: BTreeMap<String, JsSpec>,
    cases: Cases,
}

#[derive(Deserialize)]
struct Constants {
    #[serde(rename = "GRAVITY_SCALE")]
    gravity_scale: JsNum,
    #[serde(rename = "SHELL_MAX_LIFETIME_S")]
    shell_max_lifetime_s: JsNum,
    #[serde(rename = "GUIDED_MISSILE_TURN_RATE_RAD_S")]
    guided_turn_rate: JsNum,
    dt: JsNum,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsSpec {
    velocity_mps: JsNum,
    max_lifetime_s: Option<JsNum>,
    #[serde(default)]
    guided: bool,
    gravity_scale: Option<JsNum>,
    guidance_turn_rate_rad_s: Option<JsNum>,
    pen100_mm: JsNum,
    pen1000_mm: JsNum,
    pen2000_mm: Option<JsNum>,
}

impl JsSpec {
    fn spec(&self) -> ShellSpec {
        ShellSpec {
            velocity_mps: self.velocity_mps.f64(),
            max_lifetime_s: self.max_lifetime_s.map(JsNum::f64),
            guided: self.guided,
            gravity_scale: self.gravity_scale.map(JsNum::f64),
            guidance_turn_rate_rad_s: self.guidance_turn_rate_rad_s.map(JsNum::f64),
            pen100_mm: self.pen100_mm.f64(),
            pen1000_mm: self.pen1000_mm.f64(),
            pen2000_mm: self.pen2000_mm.map(JsNum::f64),
        }
    }
}

#[derive(Deserialize)]
struct Cases {
    gravity: Vec<GravityCase>,
    pen: Vec<PenCase>,
    elevation: Vec<ElevationCase>,
    lay: Vec<LayCase>,
    flights: Vec<FlightCase>,
    guidance: Vec<GuidanceCase>,
    dispersion: Vec<DispersionCase>,
}

#[derive(Deserialize)]
struct GravityCase {
    spec: Option<String>,
    expect: JsNum,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PenCase {
    spec: String,
    dist_m: JsNum,
    expect: JsNum,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ElevationCase {
    dist_m: JsNum,
    velocity_mps: JsNum,
    expect: JsNum,
}

#[derive(Deserialize)]
struct LayCase {
    spec: String,
    muzzle: JsVec,
    aim: Option<JsVec>,
    ok: bool,
    out: JsVec,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlightCase {
    spec: String,
    dir: JsVec,
    gravity_mps2: JsNum,
    samples: Vec<FlightSample>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlightSample {
    step: u32,
    pos: JsVec,
    prev_pos: JsVec,
    vel: JsVec,
    age_s: JsNum,
    dist_m: JsNum,
    dead: bool,
}

#[derive(Deserialize)]
struct GuidanceCase {
    spec: String,
    cursor: Option<JsVec>,
    samples: Vec<GuidanceSample>,
}

#[derive(Deserialize)]
struct GuidanceSample {
    step: u32,
    applied: bool,
    pos: JsVec,
    vel: JsVec,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DispersionCase {
    seed: JsNum,
    dir: JsVec,
    sigma_rad: JsNum,
    shots: Vec<JsVec>,
}

fn load_ballistics() -> BallisticsGolden {
    serde_json::from_str(&golden("ballistics")).unwrap()
}

fn spec_of<'a>(g: &'a BallisticsGolden, name: &str) -> ShellSpec {
    g.specs.get(name).unwrap_or_else(|| panic!("unknown spec {name}")).spec()
}

#[test]
fn ballistics_constants_match() {
    let g = load_ballistics();
    assert_eq!(cot_sim::ballistics::GRAVITY_SCALE, g.constants.gravity_scale.f64());
    assert_eq!(cot_sim::ballistics::SHELL_MAX_LIFETIME_S, g.constants.shell_max_lifetime_s.f64());
    assert_eq!(cot_sim::ballistics::GUIDED_MISSILE_TURN_RATE_RAD_S, g.constants.guided_turn_rate.f64());
    assert_eq!(cot_sim::SIM_DT, g.constants.dt.f64());
}

#[test]
fn shell_gravity_matches() {
    let g = load_ballistics();
    let mut ledger = Ledger::new("gravity");
    for case in &g.cases.gravity {
        let spec = case.spec.as_deref().map(|n| spec_of(&g, n));
        let actual = shell_gravity_mps2(spec.as_ref());
        ledger.check(actual, case.expect.f64(), || format!("spec {:?}", case.spec));
    }
    ledger.finish();
}

#[test]
fn penetration_falloff_matches() {
    let g = load_ballistics();
    let mut ledger = Ledger::new("pen");
    for case in &g.cases.pen {
        let spec = spec_of(&g, &case.spec);
        let actual = pen_at_distance_mm(&spec, case.dist_m.f64());
        ledger.check(actual, case.expect.f64(), || format!("{} at {} m", case.spec, case.dist_m.f64()));
    }
    ledger.finish();
}

#[test]
fn aim_elevation_matches() {
    let g = load_ballistics();
    let mut ledger = Ledger::new("elevation");
    for case in &g.cases.elevation {
        let actual = aim_elevation_rad(case.dist_m.f64(), case.velocity_mps.f64());
        ledger.check(actual, case.expect.f64(), || {
            format!("{} m at {} m/s", case.dist_m.f64(), case.velocity_mps.f64())
        });
    }
    ledger.finish();
}

#[test]
fn gun_lay_matches() {
    let g = load_ballistics();
    let mut ledger = Ledger::new("lay");
    for (i, case) in g.cases.lay.iter().enumerate() {
        let spec = spec_of(&g, &case.spec);
        // The null-aim case starts from a non-zero `out` the solver must leave alone.
        let mut out = if case.aim.is_none() { Vec3::new(0.1, 0.2, 0.3) } else { Vec3::ZERO };
        let aim = case.aim.as_ref().map(JsVec::vec3);
        let ok = solve_ballistic_gun_lay(&mut out, &case.muzzle.vec3(), aim.as_ref(), Some(&spec));
        assert_eq!(ok, case.ok, "lay case {i} ({}) resolved flag", case.spec);
        ledger.check_vec(&out, &case.out, &format!("lay case {i} ({})", case.spec));
    }
    ledger.finish();
}

#[test]
fn shell_flight_matches() {
    let g = load_ballistics();
    let dt = g.constants.dt.f64();
    let mut ledger = Ledger::new("flights");
    for case in &g.cases.flights {
        let spec = spec_of(&g, &case.spec);
        let is_player = case.spec == "apfsds";
        let muzzle = Vec3::new(12.5, 2.3, -8.75);
        let mut shell = create_shell(spec, "p1", is_player, &muzzle, &case.dir.vec3(), 7);
        ledger.check(shell.gravity_mps2, case.gravity_mps2.f64(), || format!("{} gravity", case.spec));
        let mut samples = case.samples.iter().peekable();
        let ctx = |step: u32| format!("{} dir {:?} step {step}", case.spec, case.dir.vec3());
        if let Some(s0) = samples.next_if(|s| s.step == 0) {
            ledger.check_vec(&shell.pos, &s0.pos, &format!("{}.pos", ctx(0)));
        }
        for step in 1..=370u32 {
            step_shell(&mut shell, dt);
            if let Some(sample) = samples.next_if(|s| s.step == step) {
                let c = ctx(step);
                ledger.check_vec(&shell.pos, &sample.pos, &format!("{c}.pos"));
                ledger.check_vec(&shell.prev_pos, &sample.prev_pos, &format!("{c}.prevPos"));
                ledger.check_vec(&shell.vel, &sample.vel, &format!("{c}.vel"));
                ledger.check(shell.age_s, sample.age_s.f64(), || format!("{c}.ageS"));
                ledger.check(shell.dist_m, sample.dist_m.f64(), || format!("{c}.distM"));
                assert_eq!(shell.dead, sample.dead, "{c}.dead");
            }
        }
        assert!(samples.next().is_none(), "{}: unconsumed samples", case.spec);
    }
    ledger.finish();
}

#[test]
fn guidance_matches() {
    let g = load_ballistics();
    let dt = g.constants.dt.f64();
    let mut ledger = Ledger::new("guidance");
    let muzzle = Vec3::new(12.5, 2.3, -8.75);
    for case in &g.cases.guidance {
        let spec_name = case.spec.split('-').next().unwrap();
        let spec = spec_of(&g, spec_name);
        let cursor = case.cursor.as_ref().map(JsVec::vec3);
        let mut shell = create_shell(spec, "p2", false, &muzzle, &Vec3::new(0.0, 0.0, 1.0), 9);
        if case.spec.contains('-') {
            // Single-call cases: the aim is null or directly behind; no integration.
            let sample = &case.samples[0];
            let applied = guide_shell_toward(&mut shell, cursor.as_ref(), dt);
            assert_eq!(applied, sample.applied, "{} applied", case.spec);
            ledger.check_vec(&shell.pos, &sample.pos, &format!("{}.pos", case.spec));
            ledger.check_vec(&shell.vel, &sample.vel, &format!("{}.vel", case.spec));
            continue;
        }
        let mut samples = case.samples.iter().peekable();
        for step in 1..=240u32 {
            let applied = guide_shell_toward(&mut shell, cursor.as_ref(), dt);
            step_shell(&mut shell, dt);
            if let Some(sample) = samples.next_if(|s| s.step == step) {
                assert_eq!(applied, sample.applied, "{} step {step} applied", case.spec);
                ledger.check_vec(&shell.pos, &sample.pos, &format!("{} step {step}.pos", case.spec));
                ledger.check_vec(&shell.vel, &sample.vel, &format!("{} step {step}.vel", case.spec));
            }
        }
    }
    ledger.finish();
}

#[test]
fn dispersion_matches() {
    let g = load_ballistics();
    let mut ledger = Ledger::new("dispersion");
    for case in &g.cases.dispersion {
        let mut rng = Mulberry32::from_js_number(case.seed.f64());
        let base = case.dir.vec3();
        for (i, shot) in case.shots.iter().enumerate() {
            // `dir` is the TypeScript's already-normalised start direction; normalising it a second time moves it an ulp
            let mut dir = base;
            apply_dispersion(&mut dir, case.sigma_rad.f64(), &mut rng);
            ledger.check_vec(&dir, shot, &format!("seed {} sigma {} shot {i}", case.seed.f64(), case.sigma_rad.f64()));
        }
    }
    ledger.finish();
}
