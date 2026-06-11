FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY src ./src
COPY tests ./tests
COPY scripts ./scripts

RUN npx prisma generate

ENV NODE_ENV=production

EXPOSE 5000

# Apply pending migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
