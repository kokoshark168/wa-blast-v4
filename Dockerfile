FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Generate the Prisma client before building — API routes import @prisma/client.
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Generated Prisma client (the postinstall stub has no schema to work from).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Prisma CLI (devDependency) so `prisma migrate deploy` / `db push` work at boot.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY prisma ./prisma
COPY server.js next.config.js ./

# Run as the unprivileged node user.
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
