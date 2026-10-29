// Fleet-standard parts a registered oracle cannot judge, set aside from the numeric comparison by name (Main's ruling,
// release 262). The owner-kit split sets aside parts an owner asked for that the print does not carry; this one sets
// aside the fleet's own construction where the print draws another construction of the same part. Each part names its
// meshes on both sides, the one metric it leaves (the track profile, drawn again without it on both sides; every other
// mask keeps it) and the measured reason. procedural-fidelity.html stops when a named mesh is missing or carries
// another role, and ?comparison=raw-source keeps the unexempted comparison (the fidelity driver writes it beside the
// ruled one). Nothing else on the vehicle is excused: the rest clears its own bar.
// First-party: Kevin B. Liu (NOTICE.md).

// Main's ruling, verbatim (2026-10-28, release 262's Challenger 3 TD lane).
const CHALLENGER3_TD_RULING = 'a documented exemption for the two residuals the oracle can\'t judge, the fleet\'s forged '
  + 'suspension arms (the oracle has none) and the fleet track shoe (the oracle draws a thicker band with a centre rib)';

export const ORACLE_BLIND_PARTS = Object.freeze({
  challenger3_td: Object.freeze({
    decision: `Main (262): "${CHALLENGER3_TD_RULING}". The arms stay compared: the oracle draws trailing-arm units at `
      + 'every station (Object_17), and setting the fleet arms aside lowered the front hull view (packet r11).',
    decisionDate: '2026-10-28',
    packet: 'docs/references/tanks/challenger3_td.md',
    parts: Object.freeze([
      Object.freeze({ key: 'trackShoe', masks: 'trackProfile', rulingWords: 'the fleet track shoe',
        part: 'both track belts: the fleet shoe on its band, and the oracle\'s belts (Object_5, Object_8)',
        procedural: Object.freeze([
          Object.freeze({ name: 'gearTrackBandL', appearanceRole: 'trackBand' }),
          Object.freeze({ name: 'gearTrackBandR', appearanceRole: 'trackBand' }),
          Object.freeze({ name: 'gearTrackPads', appearanceRole: 'trackPad' }),
          Object.freeze({ name: 'gearTrackPadsSimplified', appearanceRole: 'trackPadSimplified' }),
        ]),
        reference: Object.freeze({ node: '^Object_(?:5|8)$', count: 2 }),
        reason: 'the fleet shoe draws a 0.05 m band with its guides under the band\'s top; the oracle\'s lower run is a '
          + '0.07-0.08 m band with a continuous centre guide rib to 0.18 m between the wheels (packet r10), so the '
          + 'track profile compares the running gear under both belts; every other mask keeps them' }),
    ]),
  }),
});
