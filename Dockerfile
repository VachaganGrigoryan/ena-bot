FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json drizzle.config.ts README.md ./
COPY apps ./apps
COPY packages ./packages
COPY tests ./tests
RUN npm run build

FROM build AS tools
CMD ["npm", "run", "db:push"]

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

FROM runtime AS telegram-bot
CMD ["node", "dist/apps/telegram-bot/main.js"]

FROM runtime AS worker
CMD ["node", "dist/apps/worker/main.js"]
