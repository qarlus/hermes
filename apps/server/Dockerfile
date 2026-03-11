FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile

ENV HERMES_RELAY_HOST=0.0.0.0
ENV HERMES_RELAY_PORT=8787
ENV HERMES_RELAY_DATA=/data/relay.json

VOLUME ["/data"]
EXPOSE 8787

CMD ["bun", "run", "--filter", "@hermes/server", "start"]
