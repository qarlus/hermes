FROM oven/bun:1.2-alpine AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun run --filter @hermes/server build

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/apps/server/dist ./dist

ENV NODE_ENV=production
ENV HERMES_RELAY_HOST=0.0.0.0
ENV HERMES_RELAY_PORT=8787
ENV HERMES_RELAY_DATA=/data/relay.json

VOLUME ["/data"]
EXPOSE 8787

CMD ["node", "dist/index.js"]
