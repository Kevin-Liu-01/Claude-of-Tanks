# Repository layout and documentation ownership

The repository root is an entry point, not a working notebook. It holds the
README, agent pointers, legal notices, game/error HTML, and tool configuration
that must live there. Public-site source pages now live together in `site/`.
The Mac home folder is outside this cleanup.

| Location | What belongs here |
| --- | --- |
| `site/` | Homepage, Gallery and manual HTML entries |
| `src/docs/` | Public manual content, interactive references and styles |
| `src/presentation/` | Public navigation, shared page UI and loading behavior |
| `docs/` | Current engineering contracts and the index that identifies their owners |
| `docs/history/` | Dated investigations and superseded implementation records |
| `docs/references/`, `docs/tank-generation/` | Source provenance, measured vehicle construction and verification evidence |
| `src/` | Runtime code, with subsystem ownership described by local SKILL files |
| `tools/` | Repeatable authoring, verification and release tools |
| `tools/fixtures/` | Small deterministic browser regression surfaces |
| `server/`, `cloudflare/`, `api/` | Distinct authority, room-service and HTTP infrastructure |
| `public/` | Shipped static assets and approved imagery |
| `.qa-dev/` | Ignored temporary captures, logs and investigation output |

## Read the current contract first

Start at [INDEX.md](INDEX.md). In particular, [MULTIPLAYER-V2.md](MULTIPLAYER-V2.md)
owns the current multiplayer client. The former dedicated/ranked stack has been removed. Older architecture
documents point to the replacement and preserve historical context; they are
not a second active public entry. [BOT-TACTICS.md](BOT-TACTICS.md)
records current bot capabilities and the scope of their tests.

The public field manual is for players and readers. It explains how to use
features, then their engineering behavior. Release chronology belongs in
DEPLOYS, investigation evidence in a dated history document, and temporary
browser output in `.qa-dev/`; do not create another root-level progress report.

## Keep references fresh

`node tools/generate-manual-reference.mjs` projects the production vehicle
registry, map list, auxiliary inventory and mode rules into the lightweight
public reference. `--check` rejects stale output. The browser imports that
projection only on relevant manual pages; it does not load tank builders.

Changes to mechanics require corresponding player-facing text in both locales.
Changes to vehicle stats, capabilities, maps or default mode rules require a
reference refresh. Preserve stable section anchors and public routes. Avoid
renaming dated evidence just for cosmetic consistency: citations and provenance
must continue to resolve.
