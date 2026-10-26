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
use cot_sim::contact::{ContactLattice, Sample};
use cot_sim::jsmath;
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

// -------------------------------------------------------------- contact ----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContactGolden {
    flipped_samples: usize,
    cases: Vec<ContactCase>,
}

#[derive(Deserialize)]
struct ContactCase {
    x: JsNum,
    z: JsNum,
    expect: JsNum,
    flipped: bool,
}

/// The golden tool's steep surface, in its operation order, on the pinned math.
fn steep_height(x: f64, z: f64) -> f64 {
    30.0 * jsmath::sin(x * 0.05) * jsmath::cos(z * 0.04) - 12.0 * jsmath::abs(jsmath::sin((x - z) * 0.9)) + 0.25 * x
}

/// Supply what the lattice reported missing, from the surface, as the TypeScript's lazy vertices and fold splits do.
fn supply(lattice: &mut ContactLattice, missing: Sample) {
    match missing {
        Sample::MissingVertex(ix, iz) => {
            for (vx, vz) in [(ix, iz), (ix + 1, iz), (ix, iz + 1), (ix + 1, iz + 1)] {
                if !lattice.vertex_ready(vx, vz) {
                    let h = steep_height(lattice.vertex_coordinate(vx), lattice.vertex_coordinate(vz));
                    lattice.set_vertex(vx, vz, h);
                }
            }
        }
        Sample::MissingFlip(ix, iz) => {
            let (cx, cz) = lattice.cell_centre(ix, iz);
            lattice.set_flip_from_centre(ix, iz, steep_height(cx, cz));
        }
        other => panic!("nothing to supply for {other:?}"),
    }
}

#[test]
fn contact_lattice_matches() {
    let g: ContactGolden = serde_json::from_str(&golden("contact")).unwrap();
    assert!(g.flipped_samples > 0, "the steep surface must exercise the a-d split");
    let mut ledger = Ledger::new("contact");
    let mut lattice = ContactLattice::new();
    let mut flips = 0;
    for (i, case) in g.cases.iter().enumerate() {
        let (x, z) = (case.x.f64(), case.z.f64());
        let height = loop {
            match lattice.sample(x, z) {
                Sample::Height(h) => break h,
                Sample::OffSquare => break steep_height(x, z),
                missing => supply(&mut lattice, missing),
            }
        };
        ledger.check(height, case.expect.f64(), || format!("case {i} ({x}, {z})"));
        let flipped = loop {
            match lattice.cell_flipped_at(x, z) {
                Ok(f) => break f,
                Err(missing) => supply(&mut lattice, missing),
            }
        };
        assert_eq!(flipped, case.flipped, "case {i} ({x}, {z}): the split");
        flips += flipped as usize;
    }
    assert_eq!(flips, g.flipped_samples);
    ledger.finish();
}

// ---------------------------------------------------------- deformation ----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeformationGolden {
    ops: Vec<DeformationOp>,
    reads: Vec<DeformationRead>,
    revision: u32,
    max_raise_m: JsNum,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum DeformationOp {
    SetTime { t: JsNum },
    Crater { x: JsNum, z: JsNum, radius: JsNum, depth: JsNum, rim: JsNum, seed: u32, result: Option<bool> },
    Rubble { cx: JsNum, cz: JsNum, hw: JsNum, hd: JsNum, yaw: JsNum, h: JsNum, t0: Option<JsNum> },
    #[serde(rename_all = "camelCase")]
    Course { cx: JsNum, cz: JsNum, c: JsNum, s: JsNum, hw: JsNum, skirt_m: JsNum, profile: Vec<JsNum> },
    Reset,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeformationRead {
    phase: u32,
    x: JsNum,
    z: JsNum,
    offset: JsNum,
    contact: JsNum,
    contact_flipped: JsNum,
    near: bool,
}

#[test]
fn deformation_matches() {
    use cot_sim::deformation::TerrainDeformation;
    let g: DeformationGolden = serde_json::from_str(&golden("deformation")).unwrap();
    let mut ledger = Ledger::new("deformation");
    let mut overlay = TerrainDeformation::new();
    let mut reads = g.reads.iter().peekable();
    let mut phase = 0;
    // the script's reads follow the op that ends each phase: replay ops, and after each op the reads that are due
    let read_phase = |overlay: &mut TerrainDeformation, ledger: &mut Ledger, phase: u32, reads: &mut std::iter::Peekable<std::slice::Iter<DeformationRead>>, take: usize| {
        for _ in 0..take {
            let read = reads.next().expect("a read is due");
            assert_eq!(read.phase, phase);
            let (x, z) = (read.x.f64(), read.z.f64());
            ledger.check(overlay.offset_at(x, z), read.offset.f64(), || format!("phase {phase} offsetAt({x}, {z})"));
            ledger.check(overlay.contact_offset_at(x, z, false), read.contact.f64(), || format!("phase {phase} contactOffsetAt({x}, {z})"));
            ledger.check(overlay.contact_offset_at(x, z, true), read.contact_flipped.f64(), || format!("phase {phase} contactOffsetAt({x}, {z}, flipped)"));
            assert_eq!(overlay.near(x, z), read.near, "phase {phase} near({x}, {z})");
        }
    };
    let points = g.reads.iter().take_while(|r| r.phase == 0).count();
    // phase boundaries in the script: after the edge craters (0), after the courses (1), after each clock step (2),
    // after the reset (3), after the last crater (4)
    let mut craters = 0;
    let mut steps = 0;
    for op in &g.ops {
        match op {
            DeformationOp::SetTime { t } => {
                overlay.set_time(t.f64());
                if phase == 2 {
                    steps += 1;
                    read_phase(&mut overlay, &mut ledger, 2, &mut reads, points);
                }
            }
            DeformationOp::Crater { x, z, radius, depth, rim, seed, result } => {
                let admitted = overlay.add_crater(x.f64(), z.f64(), radius.f64(), depth.f64(), rim.f64(), *seed);
                assert_eq!(Some(admitted), *result, "crater {craters}");
                craters += 1;
                if craters == 51 {
                    read_phase(&mut overlay, &mut ledger, 0, &mut reads, points);
                    phase = 1;
                } else if phase == 3 {
                    phase = 4;
                    read_phase(&mut overlay, &mut ledger, 4, &mut reads, points);
                }
            }
            DeformationOp::Rubble { cx, cz, hw, hd, yaw, h, t0 } => {
                overlay.add_rubble(cx.f64(), cz.f64(), hw.f64(), hd.f64(), yaw.f64(), h.f64(), t0.map(JsNum::f64));
            }
            DeformationOp::Course { cx, cz, c, s, hw, skirt_m, profile } => {
                overlay.add_course(cx.f64(), cz.f64(), c.f64(), s.f64(), hw.f64(), skirt_m.f64(), profile.iter().map(|v| v.f64()).collect());
                if phase == 1 && overlay.stamps().iter().filter(|s| matches!(s, cot_sim::deformation::Stamp::Course { .. })).count() == 2 {
                    read_phase(&mut overlay, &mut ledger, 1, &mut reads, points);
                    phase = 2;
                }
            }
            DeformationOp::Reset => {
                overlay.reset();
                read_phase(&mut overlay, &mut ledger, 3, &mut reads, points);
                phase = 3;
            }
        }
    }
    assert_eq!(steps, 5, "five clock steps while the heaps rise");
    assert!(reads.peek().is_none(), "every read replayed");
    assert_eq!(overlay.revision(), g.revision);
    ledger.check(overlay.max_raise_m(), g.max_raise_m.f64(), || "maxRaiseM".into());
    ledger.finish();
}

// ---------------------------------------------------- structure support ----

#[derive(Deserialize)]
struct SupportGolden {
    records: BTreeMap<String, GoldenRecord>,
    hulls: Vec<GoldenHull>,
}

#[derive(Deserialize)]
struct GoldenRecord {
    min: [JsNum; 3],
    max: [JsNum; 3],
    crushable: bool,
    wreck: bool,
    crushed: bool,
    dead: bool,
    shape: Option<GoldenShape>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum GoldenShape {
    Simple(GoldenPart),
    Compound(Vec<Option<GoldenPart>>),
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum GoldenPart {
    Obb { cx: JsNum, cz: JsNum, hw: JsNum, hl: JsNum, yaw: JsNum, y: Option<[JsNum; 2]> },
    Circle { cx: JsNum, cz: JsNum, r: JsNum, y: Option<[JsNum; 2]> },
    Convex { points: Vec<JsNum>, tp: Option<Vec<JsNum>>, y: Option<[JsNum; 2]> },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenPose {
    center_x: JsNum,
    center_z: JsNum,
    forward_x: JsNum,
    forward_z: JsNum,
    right_x: JsNum,
    right_z: JsNum,
    half_length: JsNum,
    half_width: JsNum,
    center_rise: JsNum,
    rise_along: JsNum,
    rise_across: JsNum,
    front_lift: JsNum,
    rear_lift: JsNum,
}

#[derive(Deserialize)]
struct GoldenHull {
    map: String,
    x: JsNum,
    z: JsNum,
    belly: JsNum,
    pose: Option<GoldenPose>,
    candidates: Vec<u32>,
    standing: bool,
    samples: Vec<[JsNum; 4]>,
}

fn golden_part(part: &GoldenPart) -> cot_sim::records::Part {
    use cot_sim::records::{Part, PartKind};
    let y = |y: &Option<[JsNum; 2]>| y.map(|[a, b]| (a.f64(), b.f64()));
    let all = |v: &[JsNum]| v.iter().map(|n| n.f64()).collect::<Vec<_>>();
    match part {
        GoldenPart::Obb { cx, cz, hw, hl, yaw, y: yy } => Part::obb(cx.f64(), cz.f64(), hw.f64(), hl.f64(), yaw.f64(), y(yy)),
        GoldenPart::Circle { cx, cz, r, y: yy } => Part { kind: PartKind::Circle { cx: cx.f64(), cz: cz.f64(), r: r.f64() }, y: y(yy) },
        GoldenPart::Convex { points, tp, y: yy } => Part { kind: PartKind::Convex { points: all(points), tp: tp.as_ref().map(|t| all(t)) }, y: y(yy) },
    }
}

fn golden_record(rec: &GoldenRecord) -> cot_sim::records::Record {
    use cot_sim::records::{Record, Shape};
    let shape = match &rec.shape {
        None => Shape::None,
        Some(GoldenShape::Simple(part)) => Shape::Simple(golden_part(part)),
        Some(GoldenShape::Compound(parts)) => Shape::Compound(parts.iter().map(|p| p.as_ref().map(golden_part)).collect()),
    };
    let mut record = Record::new(rec.min.map(JsNum::f64), rec.max.map(JsNum::f64), shape, rec.crushable, rec.wreck);
    record.crushed = rec.crushed;
    record.dead = rec.dead;
    record
}

#[test]
fn structure_support_matches() {
    use cot_sim::records::{HullFootprint, Record};
    use cot_sim::structure_support::SupportField;
    let g: SupportGolden = serde_json::from_str(&golden("structureSupport")).unwrap();
    // each map's referenced records in one table; the golden ids map to table indices
    let mut tables: BTreeMap<String, (Vec<Record>, BTreeMap<u32, u32>)> = BTreeMap::new();
    for (key, rec) in &g.records {
        let (map, id) = key.split_once(':').unwrap();
        let record = golden_record(rec);
        let table = tables.entry(map.to_string()).or_default();
        table.1.insert(id.parse().unwrap(), table.0.len() as u32);
        table.0.push(record);
    }
    let mut ledger = Ledger::new("structure support");
    let mut field = SupportField::new();
    let mut lifted = 0;
    for (h, hull) in g.hulls.iter().enumerate() {
        let (records, ids) = &tables[&hull.map];
        let candidates: Vec<u32> = hull.candidates.iter().map(|id| ids[id]).collect();
        let pose = hull.pose.as_ref().map(|p| HullFootprint {
            center_x: p.center_x.f64(), center_z: p.center_z.f64(), forward_x: p.forward_x.f64(), forward_z: p.forward_z.f64(),
            right_x: p.right_x.f64(), right_z: p.right_z.f64(), half_length: p.half_length.f64(), half_width: p.half_width.f64(),
            center_rise: p.center_rise.f64(), rise_along: p.rise_along.f64(), rise_across: p.rise_across.f64(),
            front_lift: p.front_lift.f64(), rear_lift: p.rear_lift.f64(),
        });
        field.begin_hull_with(records, &candidates, hull.x.f64(), hull.z.f64(), hull.belly.f64(), pose.as_ref());
        assert_eq!(field.standing_deck(), hull.standing, "hull {h} ({}) stands on a deck", hull.map);
        for [x, z, ground, expect] in &hull.samples {
            let top = field.sample(records, x.f64(), z.f64(), ground.f64());
            if top != ground.f64() {
                lifted += 1;
            }
            ledger.check(top, expect.f64(), || format!("hull {h} ({}) top at ({}, {})", hull.map, x.f64(), z.f64()));
        }
    }
    assert!(lifted > 1000, "the structures lift the samples ({lifted})");
    ledger.finish();
}

// ------------------------------------------------------------ clearance ------

#[derive(Deserialize)]
struct ClearanceGolden {
    records: BTreeMap<String, GoldenRecord>,
    /// record, x, z, margin, contained
    points: Vec<(String, JsNum, JsNum, JsNum, bool)>,
    /// record, sx, sz, dx, dz, reach, margin, entry (null: none)
    lanes: Vec<(String, JsNum, JsNum, JsNum, JsNum, JsNum, JsNum, Option<JsNum>)>,
}

#[test]
fn clearance_matches() {
    use cot_sim::clearance::{contains_point, ray_entry};
    let g: ClearanceGolden = serde_json::from_str(&golden("clearance")).unwrap();
    let records: BTreeMap<&str, cot_sim::records::Record> = g.records.iter().map(|(key, rec)| (key.as_str(), golden_record(rec))).collect();
    for (i, (key, x, z, margin, inside)) in g.points.iter().enumerate() {
        assert_eq!(contains_point(&records[key.as_str()], x.f64(), z.f64(), margin.f64()), *inside, "point {i} ({key}) at ({}, {}) margin {}", x.f64(), z.f64(), margin.f64());
    }
    let mut ledger = Ledger::new("clearance lanes");
    let mut entries = 0;
    for (i, (key, sx, sz, dx, dz, reach, margin, expect)) in g.lanes.iter().enumerate() {
        let entry = ray_entry(&records[key.as_str()], sx.f64(), sz.f64(), dx.f64(), dz.f64(), reach.f64(), margin.f64());
        assert_eq!(entry.is_some(), expect.is_some(), "lane {i} ({key}) meets the record");
        if let (Some(entry), Some(expect)) = (entry, expect) {
            entries += 1;
            ledger.check(entry, expect.f64(), || format!("lane {i} ({key}) entry"));
        }
    }
    assert!(entries > 1000, "the lanes enter the records ({entries})");
    ledger.finish();
}
