# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production

# Copy built code
COPY --from=builder /app/dist ./dist
# Copy migration files (CRITICAL for auto-migration)
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/config ./config
COPY --from=builder /app/.sequelizerc .

USER node
EXPOSE 3000
# Uses 'npm start' which now runs 'migrate:up' then server
CMD ["npm", "start"]