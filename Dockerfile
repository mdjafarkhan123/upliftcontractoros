# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Distro Chromium is installed in the runtime stage; skip puppeteer's download.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium + fonts for in-process PDF rendering (quotes/invoices).
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# adapter-node server. Env (DATABASE_URL etc.) supplied via docker run --env-file
# or compose env_file — the build/ server reads process.env directly.
EXPOSE 3000
CMD ["node", "build"]
