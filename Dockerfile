FROM debian:trixie-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132 AS signal
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
ARG SIGNAL_CLI_VERSION=0.14.7
ARG SIGNAL_CLI_SHA256=0fe065294adcf35df4c249b635d0ce57de7765d4fec660bffaa2e7f0549d4e5f
RUN curl -fsSL "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}-Linux-native.tar.gz" -o /tmp/signal.tar.gz \
    && echo "${SIGNAL_CLI_SHA256}  /tmp/signal.tar.gz" | sha256sum -c - \
    && mkdir /opt/signal && tar -xzf /tmp/signal.tar.gz -C /opt/signal && rm /tmp/signal.tar.gz

FROM node:22-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run docs && npm run build && node deploy/package-companion.mjs && npm prune --omit=dev

FROM node:22-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284
ENV NODE_ENV=production PORT=4318 BIND_HOST=0.0.0.0 DATA_DIR=/data SIGNAL_NATIVE_DIR=/run/signal-native
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libzstd1 zlib1g libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=signal /opt/signal /opt/signal
RUN ln -s /opt/signal/signal-cli /usr/local/bin/signal-cli && signal-cli --version
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/companion ./companion
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir /data /run/signal-native && chown node:node /data /run/signal-native
USER node
EXPOSE 4318
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4318/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
