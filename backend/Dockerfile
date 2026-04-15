FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/ .
COPY seed/ ./seed-data/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/seed-data ./seed-data
EXPOSE 3000
CMD ["sh", "-c", "node dist/database/seed.js && node dist/main.js"]
