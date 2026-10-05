FROM node:22-alpine AS build

ARG BUILD_VERSION=1.0.0
ARG BUILD_ARCH=amd64

WORKDIR /opt/pragma
COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev

FROM node:22-alpine

ARG BUILD_VERSION=1.0.0
ARG BUILD_ARCH=amd64

LABEL \
  io.hass.name="Pragma" \
  io.hass.description="Gestione locale di accessi, varchi, badge NFC e registri" \
  io.hass.version="$BUILD_VERSION" \
  io.hass.type="app" \
  io.hass.arch="aarch64|amd64" \
  org.opencontainers.image.source="https://github.com/bzorzetto/Pragma"

RUN apk add --no-cache bash jq libstdc++

WORKDIR /opt/pragma
COPY --from=build /opt/pragma/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js ./
COPY database ./database
COPY public ./public
COPY addon/pragma/run.sh /run.sh
RUN chmod a+x /run.sh && mkdir -p /data

ENV NODE_ENV=production
CMD ["/run.sh"]
