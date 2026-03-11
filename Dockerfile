# ── Stage 1: build node dependencies ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json .
RUN npm install --omit=dev

# ── Stage 2: final image ───────────────────────────────────────────
FROM node:20-alpine

LABEL org.opencontainers.image.title="Huisapotheek"
LABEL org.opencontainers.image.description="Inventarisatie van je huisapotheek"
LABEL org.opencontainers.image.source="https://github.com/bigbuud/huisapotheek"

# Install nginx + supervisord
RUN apk add --no-cache nginx supervisor

# ── Backend ────────────────────────────────────────────────────────
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .

# ── Frontend ───────────────────────────────────────────────────────
RUN mkdir -p /usr/share/nginx/html
COPY index.html /usr/share/nginx/html/

# ── Nginx config ───────────────────────────────────────────────────
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/http.d/default.conf

# ── Supervisor config ──────────────────────────────────────────────
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── Data volume ────────────────────────────────────────────────────
VOLUME ["/data"]

# ── Entrypoint ─────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3520

ENTRYPOINT ["/entrypoint.sh"]
