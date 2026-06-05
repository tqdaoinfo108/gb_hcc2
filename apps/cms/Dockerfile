FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/cms/package.json apps/cms/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm run build -w @smart-kiosk/ui && npm run build -w @smart-kiosk/cms

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/cms/.next ./apps/cms/.next
COPY --from=builder /app/apps/cms/package.json ./apps/cms/package.json
COPY --from=builder /app/apps/cms/public ./apps/cms/public
COPY --from=builder /app/package.json ./package.json
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@smart-kiosk/cms"]
