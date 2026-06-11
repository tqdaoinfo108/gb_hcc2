FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm run build -w @smart-kiosk/shared-types && npm run build -w @smart-kiosk/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/config/prisma ./packages/config/prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
EXPOSE 3001
CMD ["sh", "-c", "npm run db:ready && npm run db:migrate && npm run db:generate && node apps/api/dist/main.js"]
