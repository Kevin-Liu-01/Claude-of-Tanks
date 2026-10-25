//! Compare `jsmath` against a JavaScript engine's `Math.*` over the corpus
//! `tools/jsmath-conformance.mjs` wrote: per function and input range, how many
//! results differ, by how many ulps, and the first few offenders.
//!
//! `cargo run -p cot-sim --example jsmath_conformance -- .qa-dev/rust/jsmath-corpus.bin`

use cot_sim::jsmath;
use std::{env, fs};

fn ulps(a: f64, b: f64) -> u64 {
    if a.to_bits() == b.to_bits() || (a.is_nan() && b.is_nan()) {
        return 0;
    }
    let key = |v: f64| {
        let bits = v.to_bits() as i64;
        if bits < 0 { i64::MIN - bits } else { bits }
    };
    key(a).abs_diff(key(b))
}

fn eval(name: &str, args: &[f64]) -> f64 {
    match name {
        "sin" => jsmath::sin(args[0]),
        "cos" => jsmath::cos(args[0]),
        "tan" => jsmath::tan(args[0]),
        "asin" => jsmath::asin(args[0]),
        "acos" => jsmath::acos(args[0]),
        "atan" => jsmath::atan(args[0]),
        "atan2" => jsmath::atan2(args[0], args[1]),
        "exp" => jsmath::exp(args[0]),
        "log" => jsmath::log(args[0]),
        "pow" => jsmath::pow(args[0], args[1]),
        "cbrt" => jsmath::cbrt(args[0]),
        "hypot2" => jsmath::hypot2(args[0], args[1]),
        "hypot3" => jsmath::hypot3(args[0], args[1], args[2]),
        other => panic!("no jsmath counterpart for {other}"),
    }
}

fn main() {
    let path = env::args().nth(1).unwrap_or_else(|| ".qa-dev/rust/jsmath-corpus.bin".into());
    let bytes = fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    assert_eq!(&bytes[..8], b"JSMATHC1", "not a jsmath-conformance corpus");
    let u32_at = |at: usize| u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
    let f64_at = |at: usize| f64::from_le_bytes(bytes[at..at + 8].try_into().unwrap());
    let (cases, n) = (u32_at(8), u32_at(12));
    let mut at = 16;
    let mut heads = Vec::new();
    for _ in 0..cases {
        let name: String = bytes[at..at + 16].iter().take_while(|&&b| b != 0).map(|&b| b as char).collect();
        let arity = u32_at(at + 16);
        let ranges: Vec<(f64, f64)> = (0..arity).map(|k| (f64_at(at + 24 + k * 16), f64_at(at + 32 + k * 16))).collect();
        heads.push((name, arity, ranges));
        at += 16 + 8 + 48;
    }
    // `--digest=M`: FNV-1a-64 of jsmath's results over each case's first M rows, comparable with
    // `tools/jsmath-conformance.mjs --digest --n=M` run in any JavaScript engine
    if let Some(m) = env::args().find_map(|a| a.strip_prefix("--digest=").map(|m| m.parse::<usize>().unwrap())) {
        for (name, arity, ranges) in &heads {
            let mut h: u64 = 0xcbf2_9ce4_8422_2325;
            for i in 0..n {
                let args: Vec<f64> = (0..*arity).map(|k| f64_at(at + k * 8)).collect();
                at += (arity + 1) * 8;
                if i < m {
                    for byte in eval(name, &args).to_le_bytes() {
                        h = (h ^ byte as u64).wrapping_mul(0x0100_0000_01b3);
                    }
                }
            }
            let range: Vec<String> = ranges.iter().map(|(lo, hi)| format!("[{lo}, {hi}]")).collect();
            println!("{name} {} {h:016x}", range.join(" "));
        }
        return;
    }
    let mut total_diff = 0;
    for (name, arity, ranges) in &heads {
        let (mut diff, mut worst, mut shown) = (0usize, 0u64, Vec::new());
        for _ in 0..n {
            let args: Vec<f64> = (0..*arity).map(|k| f64_at(at + k * 8)).collect();
            let js = f64_at(at + arity * 8);
            at += (arity + 1) * 8;
            let rs = eval(name, &args);
            let d = ulps(rs, js);
            if d > 0 {
                diff += 1;
                worst = worst.max(d);
                if shown.len() < 2 {
                    let hex: Vec<String> = args.iter().map(|a| format!("{:016x}", a.to_bits())).collect();
                    shown.push(format!("{name}({}) js {:016x} rust {:016x}", hex.join(", "), js.to_bits(), rs.to_bits()));
                }
            }
        }
        total_diff += diff;
        let range: Vec<String> = ranges.iter().map(|(lo, hi)| format!("[{lo}, {hi}]")).collect();
        println!("{name:7} {:40} {diff:7} of {n} differ ({:.4}%), max {worst} ulp", range.join(" "), 100.0 * diff as f64 / n as f64);
        for line in shown {
            println!("          {line}");
        }
    }
    println!("total: {total_diff} differing results over {} evaluations", cases * n);
}
