FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build -- --webpack

ENV NODE_ENV=production
EXPOSE 3000

# The database and uploaded work files are mounted as persistent volumes by
# docker-compose.production.yml. Initializing is idempotent and safe on restart.
CMD ["sh", "-c", "node scripts/init-db.mjs && node scripts/next-with-env-proxy.mjs start"]
