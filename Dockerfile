FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
COPY prisma ./prisma/
COPY tsconfig.json ./

RUN yarn install --frozen-lockfile

COPY src ./src

RUN yarn db:generate
RUN yarn build

# ---- Production image ----
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json yarn.lock ./

RUN mkdir -p uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
