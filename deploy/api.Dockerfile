FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/analysis/package.json packages/analysis/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile --filter @kowr/api...

COPY apps/api apps/api
COPY packages packages
COPY infra infra
RUN pnpm --filter @kowr/api build
RUN pnpm --filter @kowr/api deploy --prod --legacy /runtime

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /runtime ./
COPY --from=builder /workspace/infra/migrations ./infra/migrations

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
