# Image de production du CMS.
# Construite depuis la racine du dépôt :  docker build -f infra/Dockerfile -t agence-cms .

FROM node:22.23.4-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

# 1. Dépendances
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/cms/package.json apps/cms/package.json
RUN pnpm install --frozen-lockfile

# 2. Construction
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/cms/node_modules ./apps/cms/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valeurs factices pour la construction uniquement ; les vraies viennent du .env au démarrage
RUN PAYLOAD_SECRET=build-only DATABASE_URI=postgres://build:build@localhost:5432/build \
    pnpm --filter cms build

# 3. Image finale, légère
FROM node:22.23.4-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs \
    && mkdir -p /app/media && chown nextjs:nodejs /app/media
COPY --from=builder --chown=nextjs:nodejs /repo/apps/cms/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/cms/.next/static ./apps/cms/.next/static
USER nextjs
EXPOSE 3000
# Au démarrage, Payload applique automatiquement les migrations en attente
CMD ["node", "apps/cms/server.js"]
