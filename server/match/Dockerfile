# Claude of Tanks match service (Multiplayer v2). Build from the repository root:
#   docker build -f server/match/Dockerfile -t cot-match .
# Run:
#   docker run --rm -p 8791:8791 -e COT_MATCH_SEAT_SECRET=... -e COT_MATCH_ALLOWED_ORIGINS=https://claude-of-tanks.vercel.app cot-match
#
# Node 24 strips TypeScript types natively, so the image runs the sources as they are: no build
# step, no dev dependencies. Three stages keep it small: `deps` installs the production set and
# prunes it to what the service loads (three's ESM build and the four examples/jsm directories the
# vehicle and world modules import, ws); `sources` copies the
# trees and drops receipts, docs and the browser-only subsystems; the runtime is plain Alpine plus
# the node binary (the official node image also carries npm, corepack and headers the service never
# uses). server/match/Dockerfile.dockerignore limits the BuildKit context to the same trees.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# the official binary ships symbol tables the service never reads (128 -> 109 MB)
RUN apk add --no-cache binutils && strip /usr/local/bin/node && apk del binutils
RUN npm ci --omit=dev --ignore-scripts \
 && find node_modules -mindepth 1 -maxdepth 1 ! -name three ! -name ws ! -name .package-lock.json -exec rm -rf {} + \
 && find node_modules/three -mindepth 1 -maxdepth 1 ! -name package.json ! -name LICENSE ! -name build ! -name examples -exec rm -rf {} + \
 && find node_modules/three/build -type f ! -name three.module.js ! -name three.core.js -delete \
 && find node_modules/three/examples -mindepth 1 -maxdepth 1 ! -name jsm -exec rm -rf {} + \
 && find node_modules/three/examples/jsm -mindepth 1 -maxdepth 1 ! -name geometries ! -name math ! -name postprocessing ! -name utils -exec rm -rf {} + \
 && npm cache clean --force

FROM alpine:3.22 AS sources
WORKDIR /app
COPY src ./src
COPY server ./server
COPY docs/references/perf ./docs/references/perf
# The service's import closure: simulation, vehicle specs, world/map data, the wire, the shared v1
# prediction/protocol modules, the match service and its per-map collision shards, the perf table.
RUN rm -rf src/app src/audio src/dev src/docs src/gallery src/presentation src/main.ts src/analytics.ts src/productStats.ts src/vite-env.d.ts src/SKILL.md \
 && find src server -name '*.selftest.mjs' -delete \
 && find src server -name '*.test-support.mjs' -delete \
 && find src server -name '*.md' -delete \
 && find src server -name '*.bak' -delete

FROM alpine:3.22
RUN apk add --no-cache libstdc++ libgcc && addgroup -S node && adduser -S -G node node
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV NODE_ENV=production \
    COT_MATCH_HOST=0.0.0.0 \
    COT_MATCH_PORT=8791 \
    COT_MATCH_MAX_ACTORS=1 \
    COT_MATCH_LOG_LEVEL=info

COPY --from=deps /app/node_modules ./node_modules
COPY --from=sources /app/src ./src
COPY --from=sources /app/server ./server
COPY --from=sources /app/docs ./docs
COPY package.json LICENSE LICENSE-POLICY.md NOTICE.md ./

USER node
EXPOSE 8791
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COT_MATCH_PORT||8791)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "server/match/main.ts"]
