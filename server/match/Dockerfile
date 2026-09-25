# Claude of Tanks match service (Multiplayer v2). Build from the repository root:
#   docker build -f server/match/Dockerfile -t cot-match .
# Run:
#   docker run --rm -p 8791:8791 -e COT_MATCH_SEAT_SECRET=... -e COT_MATCH_ALLOWED_ORIGINS=https://claude-of-tanks.vercel.app cot-match
# Node 24 strips TypeScript types natively, so the image runs the sources as they are:
# no build step, no dev dependencies, only the production dependency set (three + ws).
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    COT_MATCH_HOST=0.0.0.0 \
    COT_MATCH_PORT=8791 \
    COT_MATCH_MAX_ACTORS=1 \
    COT_MATCH_LOG_LEVEL=info

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Shared simulation, vehicle specs, world/map data and the wire; the match service and its
# per-map collision shards; the perf table the receipts read. No browser assets, no shots,
# no local environment files, no Vercel configuration.
COPY src ./src
COPY server ./server
COPY docs/references/perf ./docs/references/perf
COPY LICENSE* NOTICE.md ./

USER node
EXPOSE 8791
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COT_MATCH_PORT||8791)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "server/match/main.ts"]
