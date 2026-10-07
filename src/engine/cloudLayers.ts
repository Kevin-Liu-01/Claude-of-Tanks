/**
 * cloudLayers.ts — a map's cloud preset as the Clouds 2.0 layer stack (2026-10-06).
 *
 * The preset (cloudPresets.ts over the map's `clouds` block and its regime) stays the per-map identity; this turns it
 * into up to four altitude lanes the medium reads (cloudShaders.ts CLOUD2_MEDIUM_GLSL): the regime's main layer at the
 * map's base and thickness, and the layer aloft the meteorology puts over it where there is one (the altocumulus over a
 * fair-weather sky, the high cumulus over a front). Each lane is a coverage of the local weather (the cumuliform, aloft,
 * stratiform or cell channel, or the street field in the wind frame) that a shape-altering function turns into a shell
 * (a domed cumulus over a flat base, a deck flat on both faces), eroded by the shape and detail volumes, under a density
 * profile. Pure and DOM-free (the receipt resolves every map in Node).
 */
import type { CloudLayerPreset } from './cloudPresets.ts';

/** One lane of the medium. */
export interface CloudLane {
  /** base and top altitude (m, over the parabolic Earth) */
  baseM: number;
  topM: number;
  /** the coverage in the shell law's units (0 none, 1 every column admitted at the shell's widest) */
  cover: number;
  /** extinction at full density (1/m) */
  density: number;
  /** weights of the local weather's channels: cumuliform, aloft, stratiform, cells */
  channels: readonly [number, number, number, number];
  /** the street field's share of the weather (wind-frame rolls) */
  streets: number;
  /**
   * the large-scale (stratiform) field as an envelope over the lane's weather: organised convection, the cells gathered
   * in bands and clusters where the envelope is high and clear air between (0 none .. 1 the envelope's whole contrast)
   */
  envelope: number;
  /** how far the shape and the detail volumes erode the shell (0..1) */
  shape: number;
  detail: number;
  /** the shape-altering bias: low puts the shell's widest point near the base (a dome over a flat base) */
  bias: number;
  /** the density's ramp over the footprint, as a share of it (1: from the edge to the weather's peak) */
  filter: number;
  /** the weather's exponent (over 1 sharpens the coverage gradient) */
  exponent: number;
  /** the deck cells' strength (thin borders between thick cores) */
  cells: number;
  /** the share of whippy (rather than billowy) erosion on the upper half */
  wisp: number;
  /** 0 the domed shell, 1 a deck flat to its base and top */
  flat: number;
  /** a deck's cell cores hang under its base by this share of the thickness (a lumpy underside) */
  hang: number;
  /** a cumulonimbus' anvil: the shell widening again over its top fifth (0..1) */
  anvil: number;
  /** the shell's density inside its footprint before the shape carves it (0.5 billowy through .. 0.85 solid) */
  core: number;
  /** a deck's lumps: the cells' channel at a third of their period thickening and thinning the column (0..1) */
  lumps: number;
  /** the density profile over the height fraction: a·e^(b·η) + c·η + d */
  profile: readonly [number, number, number, number];
  /** the share of the deep diffusion term (a deck's base lit through its column) */
  diffuse: number;
  /** whether the lane shades the ground and itself through the Beer shadow map */
  shadow: boolean;
}

/** The resolved stack: the lanes (at most four) and the march's limits. */
export interface CloudStack {
  lanes: CloudLane[];
  /** the lowest base and the highest top of the lanes (m) */
  lowM: number;
  highM: number;
  /** the turbulence's displacement at the bases (m) */
  turbulenceM: number;
  /** the weather's displacement with height (m): a tower's footprint drifting and billowing up its column (0 none) */
  weatherWarpM: number;
  /** the deck cells' lookup period (m): the local weather's cell channel (1.2 km cells on its tile) at the regime's size */
  cellPeriodM: number;
  /** the shape volume's world period (m): several cumulus across it, a deck's lumps a few hundred metres */
  shapePeriodM: number;
}

export const CLOUD_LANES_MAX = 4;
/** The local weather's world period (m; cloudShaders.ts CLOUD2_PERIODS.local) and its cell channel's cell (m) on it. */
const CLOUD_LOCAL_PERIOD_M = 48000;
const CLOUD_LOCAL_CELL_M = 1200;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** A deck's shell density inside its footprint (before the shape carves it). */
const DECK_CORE = 0.82;

/**
 * The coverage law: a map's coverage (the fraction of the sky its clouds cover, cloudscapes.ts) as the lane's cover, the
 * share of the equalised weather admitted at the shell's widest height. A cumulus' cover runs a little over its coverage:
 * its shape carves most of what is admitted into billows (its core is low and its ramp long, so the billows are the
 * cloud); a deck's admits its coverage itself — its breaks are the weather's
 * low columns — and from the light model's closing coverage (lightModelCore.ts DECK_CLOSED_COVERAGE, 0.95) it closes.
 */
export function cloudShellCover(coverage: number, deck: boolean): number {
  if (deck) return clamp(coverage + clamp((coverage - 0.93) / 0.07, 0, 1) * 0.25, 0, 1.25);
  // (a sparse humilis sky keeps a few small puffs the carving would take: a lift of 0.03, none at no coverage)
  return clamp(coverage * 1.08 + 0.03 * clamp(coverage / 0.1, 0, 1), 0, 1);
}

/** The aloft layer a regime carries over its main one (none where the meteorology has none). */
// (a fair-weather sky and its streets carry none: at a few percent cover the altocumulus drew a confetti of small puffs
// two kilometres over the cumulus — the critics' "puffs at random heights"; the cirrus above stays the sky's own)
const ALOFT: Readonly<Partial<Record<string, { lift: number; thickness: number; coverage: number; density: number }>>> = Object.freeze({
  // humid towers: a broken altocumulus layer between the towers' heads
  'towering-cumulus': { lift: 600, thickness: 450, coverage: 0.12, density: 0.06 },
  // a front: the high cumulus and the spreading anvils' debris
  'cumulonimbus-front': { lift: 400, thickness: 700, coverage: 0.16, density: 0.06 },
  'storm-front': { lift: 300, thickness: 700, coverage: 0.2, density: 0.06 },
  // a broken deck: a thin altostratus veil far over it
  'broken-stratocumulus': { lift: 2400, thickness: 350, coverage: 0.1, density: 0.03 },
});

/**
 * The stack of a preset. The main lane: a cumuliform sky reads the cumuliform channel (or the streets) under a domed
 * shell; a stratiform one the stratiform channel and the cells under a flat one; the towers raise the top and narrow
 * the dome; the wispiness sets the whippy share. The lane aloft from the regime's row (ALOFT).
 */
export function cloudStackOf(preset: CloudLayerPreset): CloudStack {
  const lanes: CloudLane[] = [];
  const s = clamp(preset.stratiform, 0, 1);
  const cells = clamp(preset.cells, 0, 1);
  const deck = Math.max(s, cells * 0.9);
  const isDeck = deck > 0.5;
  // the channel mix: a deck reads the stratiform field (its breaks), the cumuliform one blended in by its convective
  // share; a convective sky reads the cumuliform field (or the streets) and takes the large-scale field only as the
  // envelope that gathers its cells (a front's towers in bands, never one blob the size of the field's features)
  const cu = isDeck ? clamp(1 - preset.fieldMix, 0, 1) * (1 - deck) : 1;
  const channels: [number, number, number, number] = [cu, 0, 1 - cu, 0];
  const envelope = isDeck ? 0 : clamp(preset.fieldMix, 0, 1) * 0.85;
  // a deck's cells always break its column a little (an overcast has lumps and thin lines: no flat card)
  const cellsEff = isDeck ? Math.max(cells, 0.6) : cells;
  // the density's ramp over the footprint: a cumulus' whole footprint (densest at the weather's peak, the shape carving
  // it inward from the edge), a deck's first third (dense to near its breaks)
  // (0.35 left a deck's thin borders a hair over the threshold: jittered rays read them as pinholes, a blue stipple; a
  // cumulus' ramp runs past its footprint's peak, so the shape volume carves the whole cloud into its billows, not just
  // its rim — at 1 every cumulus was a smooth loaf under a bubbly fringe)
  const filter = isDeck ? 0.55 : 1.5;
  const thickness = preset.thicknessM * (1 + preset.towers * 0.6);
  lanes.push({
    baseM: preset.baseM,
    topM: preset.baseM + thickness,
    // towers stand apart (a tower's footprint is its own; a front's sky between them is open), and the envelope's clear
    // half is paid back where it gathers the cells
    cover: Math.min(1.25, cloudShellCover(preset.coverage, isDeck) * (1 - 0.3 * clamp(preset.towers, 0, 1)) / (1 - 0.5 * envelope)),
    // a deck's extinction at a stratocumulus' (an optical depth of ten to twenty through it, not fifty: its thick cores
    // grey, not black, beside its thin lines), a closing deck's at least twenty-five (an overcast, no disc through it)
    density: isDeck
      ? Math.max(preset.density * 0.45, (10 + 15 * clamp((preset.coverage - 0.85) / 0.15, 0, 1)) / (thickness * DECK_CORE))
      : preset.density,
    channels,
    streets: clamp(preset.streets, 0, 1) * (1 - deck),
    envelope,
    // (a tower's flanks at the full erosion streaked with the shape volume's grain over kilometres of height: towers take
    // a softer carving, their mass in the light)
    shape: (1 - 0.55 * deck) * (1 - 0.45 * clamp(preset.towers, 0, 1)),
    // a deck's base wisps lightly (the whippy erosion at full strength punched pinholes through its thin borders)
    detail: 1 - 0.7 * deck,
    // the profile's exponent 1 / bias: a cumulus dome over its flat base (2.7), relaxing toward a lens; a tower is a tall
    // lane under the same dome (a lower bias drew its walls straight up: stone pillars, not cauliflower)
    bias: 0.375 + 0.5 * deck,
    filter,
    exponent: 1,
    cells: cellsEff,
    wisp: clamp(preset.wispiness - 0.3, 0, 1) * 0.8,
    flat: clamp((deck - 0.3) / 0.5, 0, 1),
    // a deck's cores hang under its base (a lumpy underside the light reads through its thickness)
    hang: isDeck ? 0.3 * cellsEff : cells > 0 ? 0.18 * cells : 0,
    anvil: clamp(preset.anvil, 0, 1),
    core: isDeck ? DECK_CORE : 0.4,
    lumps: cellsEff > 0 ? clamp(Math.max(preset.lumps ?? 0, 0.5), 0, 1) : 0,
    // denser toward the top for convective cloud (the condensate accumulates aloft), even through a sheet
    profile: deck > 0.5 ? [0, 0, 0.2, 0.8] : [0, 0, 0.6, 0.4],
    // a deck's base is lit through its column; a cumulus' shaded flank and base only a little (the octaves and the sky
    // light it: at a deck's share the fill flattened every cumulus to one grey, its lit side under twice its shade)
    diffuse: isDeck ? Math.max(clamp(preset.deckLight, 0, 1) * deck, 0.6) : 0.15,
    shadow: true,
  });
  const aloft = ALOFT[preset.regime];
  if (aloft && aloft.coverage > 0) {
    const base = preset.baseM + thickness + aloft.lift;
    lanes.push({
      baseM: base,
      topM: base + aloft.thickness,
      cover: cloudShellCover(aloft.coverage, false),
      density: aloft.density,
      // the elements aloft at the large-scale field's kilometres, their own channel breaking the patches' edges (on the
      // aloft channel alone — its cells a few hundred metres — the layer was a confetti of dark specks against the sun)
      channels: [0, 0.35, 0.65, 0],
      streets: 0,
      envelope: 0,
      // a broken layer of soft patches, not a scatter of hard puffs (a lens profile, eroded lightly)
      shape: 0.6,
      detail: 0.5,
      bias: 0.6,
      filter: 1.6,
      exponent: 1,
      cells: 0,
      wisp: 0.4,
      flat: 0.5,
      hang: 0,
      anvil: 0,
      core: 0.55,
      lumps: 0,
      profile: [0, 0, 0.5, 0.5],
      diffuse: 0,
      shadow: true,
    });
  }
  // the medium's floor is under the lowest hanging core (the march, the shadow map and the extinction's range test)
  let lowM = Infinity, highM = -Infinity;
  for (const lane of lanes) { lowM = Math.min(lowM, laneFloorM(lane)); highM = Math.max(highM, lane.topM); }
  return {
    lanes, lowM, highM,
    turbulenceM: preset.windSpeed > 0 ? 180 + preset.windSpeed * 12 : 0,
    // only a convective sky with towers pays for it (one more fetch a step)
    weatherWarpM: isDeck ? 0 : clamp((preset.towers - 0.25) / 0.75, 0, 1) * 320,
    cellPeriodM: CLOUD_LOCAL_PERIOD_M * Math.max(100, preset.cellM) / CLOUD_LOCAL_CELL_M,
    // (a shallow humilis takes finer billows: at the 3.2 km period its billows were as deep as the cloud and carved it away)
    shapePeriodM: deck > 0.5 ? 1400 : clamp(3200 * preset.thicknessM / 820, 1600, 3200),
  };
}

/** A lane's floor (m): its base lowered by the hanging cores. */
export function laneFloorM(lane: CloudLane): number {
  return lane.baseM - (lane.topM - lane.baseM) * lane.hang;
}

/** The Beer shadow map's altitude slice (m) and its slice count's bounds over a stack. */
const CLOUD_BSM_SLICE_M = 70;
const CLOUD_BSM_SLICES_RANGE = Object.freeze([24, 64] as const);
/**
 * The shadow map's slices for a stack: the lanes' depths (from under the hanging cores to the tops, the clear air between
 * them skipped as the GLSL does) at a slice of about 70 m, within 24..64 — a front's five-kilometre towers take 64 (an
 * 86 m slice; at 32 slices their 170 m steps striped the towers' shading), a thin deck 24.
 */
export function cloudBsmSlices(stack: CloudStack): number {
  let total = 0;
  for (const lane of stack.lanes) total += lane.topM - laneFloorM(lane);
  return clamp(Math.round(total / CLOUD_BSM_SLICE_M), CLOUD_BSM_SLICES_RANGE[0], CLOUD_BSM_SLICES_RANGE[1]);
}

/** Pack a stack into the medium's vec4 / mat4 uniforms (written in place). */
export function packCloudStack(stack: CloudStack, u: Record<string, { value: unknown }>): void {
  const lane = (i: number): CloudLane | null => stack.lanes[i] ?? null;
  const v4 = (key: string, pick: (l: CloudLane) => number, fallback = 0): void => {
    const target = u[key].value as { set(x: number, y: number, z: number, w: number): unknown };
    const at = (i: number): number => { const l = lane(i); return l ? pick(l) : fallback; };
    target.set(at(0), at(1), at(2), at(3));
  };
  v4('uLayerBase', (l) => l.baseM, 1e6);
  v4('uLayerTop', (l) => l.topM, 1e6 + 1);
  v4('uLayerCover', (l) => l.cover);
  v4('uLayerDensity', (l) => l.density);
  v4('uLayerShape', (l) => l.shape);
  v4('uLayerDetail', (l) => l.detail);
  v4('uLayerBias', (l) => l.bias, 1);
  v4('uLayerFilter', (l) => l.filter, 0.5);
  v4('uLayerExp', (l) => l.exponent, 1);
  v4('uLayerStreets', (l) => l.streets);
  if (u.uLayerEnvelope) v4('uLayerEnvelope', (l) => l.envelope);
  v4('uLayerCells', (l) => l.cells);
  v4('uLayerWisp', (l) => l.wisp);
  v4('uLayerFlat', (l) => l.flat);
  v4('uLayerHang', (l) => l.hang);
  v4('uLayerAnvil', (l) => l.anvil);
  v4('uLayerCore', (l) => l.core);
  v4('uLayerLumps', (l) => l.lumps);
  v4('uProfA', (l) => l.profile[0]);
  v4('uProfB', (l) => l.profile[1]);
  v4('uProfC', (l) => l.profile[2]);
  v4('uProfD', (l) => l.profile[3], 1);
  if (u.uLayerDiffuse) v4('uLayerDiffuse', (l) => l.diffuse);
  // mat4 (column-major, GLSL M * v): result lane i = sum over channels k of M[k][i] * weather[k], so element [k * 4 + i]
  const m = u.uLayerChannels.value as { elements: number[] | Float32Array };
  for (let i = 0; i < 4; i++) {
    const c = lane(i)?.channels ?? [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) m.elements[k * 4 + i] = c[k];
  }
  const range = u.uHeightRange.value as { set(x: number, y: number): unknown };
  range.set(stack.lowM, stack.highM);
  if (u.uCellPeriod) u.uCellPeriod.value = stack.cellPeriodM;
  if (u.uShapePeriod) u.uShapePeriod.value = stack.shapePeriodM;
  if (u.uTurbulence) u.uTurbulence.value = stack.turbulenceM;
  if (u.uWeatherWarp) u.uWeatherWarp.value = stack.weatherWarpM;
}
