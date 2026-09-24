# syntax=docker/dockerfile:1
#
# Production image for Margix IMS. Builds with Docker or Podman:
#   podman build -t margix-ims .                                # the web app
#   podman build -t margix-ims-tools --build-arg TARGET=tools . # seed, Tally worker
# (`--target app|tools` works too.) deploy/compose.prod.yml runs them on the
# home server (deploy/RUNBOOK.md); Railway builds the final stage, chosen by
# the TARGET variable (deploy/RAILWAY.md).

ARG NODE_IMAGE=docker.io/library/node:22-bookworm-slim
# Which stage the final image is: "app" (web server), "runtime" or "tools".
ARG TARGET=app

# ---- Dependencies (incl. dev: the build needs TypeScript, Tailwind, Prisma CLI) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Prisma's query engine links against OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- Build ----
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build

# ---- Tools: migrations, DB grants, seed, the Tally sync and notification workers ----
FROM deps AS tools
COPY prisma ./prisma
COPY scripts ./scripts
COPY ops/postgres ./ops/postgres
COPY src ./src
COPY tsconfig.json ./
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false PRISMA_HIDE_UPDATE_MESSAGE=1
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx scripts/db-grants.ts"]

# ---- Runtime base: Node, OpenSSL and the Prisma CLI, no application ----
# The home server mounts a host-built app into it (deploy/deploy.sh: fast
# deploys without rebuilding images); the "app" stage bakes the app in.
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 PRISMA_HIDE_UPDATE_MESSAGE=1
# Migrations run from this image (ops/railway/pre-deploy.sh); the Prisma CLI
# lives apart in /opt so it cannot clash with the server's own Prisma client.
COPY --from=deps /app/node_modules/prisma /opt/prisma-cli/node_modules/prisma
COPY --from=deps /app/node_modules/@prisma /opt/prisma-cli/node_modules/@prisma
USER node
EXPOSE 3000
# Podman's default OCI image format drops HEALTHCHECK; compose.prod.yml repeats it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]

# ---- App: the runtime with the standalone Next.js server baked in (Railway) ----
FROM runtime AS app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY ops/postgres/app-role-grants.sql ./ops/postgres/app-role-grants.sql
COPY ops/railway/pre-deploy.sh ./ops/railway/pre-deploy.sh

# ---- Final image: the stage named by TARGET ----
FROM ${TARGET}
