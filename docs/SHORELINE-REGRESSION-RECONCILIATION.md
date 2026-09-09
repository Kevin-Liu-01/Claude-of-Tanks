# Shoreline regression reconciliation

The old boat and non-winter aggregate snapshots already failed on published
`1db45b0ad`, before river reeds. Their origin was `dc07356a8`; accepted coal
and buoy changes had not refreshed them.

The source-pinned `kit-historical-attribution-r1.iMH5LE` loader restores only
the old coal constructor and old buoy elevation against published runtime.
Both original boat and winter suites then pass with their original hashes and
physical assertions intact. This is historical attribution, not a claim that
current runtime passed the old expectations.

`river-reed-contact-r1.Dzj7Sk` retains original candidate failures and separate
diagnostic inventories. Those record stale aggregate comparisons while every
other boat, mast, jetty, winter support and RNG assertion remains active.
Diagnostic continuations are not maintained-suite passes.

Release expectations account for exactly these changes:

- Coastal/Fjord: six non-boat hashes for the published buoy elevation. Counts,
  primitive bytes and RNG values do not change. Driftwood is unchanged.
- Mangrove: three non-boat hashes and primitive vertex/byte totals for reeds.
  Each piece loses ten premerge vertices/320 bytes but retains the same final
  GPU triangle/attribute budget. Three river-landing hashes change too.
- Three aggregate hashes over the 27 non-winter kits also incorporate the
  published four-map coal fix and Autumn/Delta reeds.

No Saltwind row, winter-target hash, physical tolerance, boat/jetty population,
RNG expectation or triangle cap is relaxed. The focused reed test independently
compares non-target geometry and collision against its predecessor. Final release
checks rerun maintained suites normally.

The intermediate `d8068f451` checkpoint additionally contained Coastal/Fjord
driftwood. That art was rejected after native inspection and is not released.
Its aggregate values are not used here.
