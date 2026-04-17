FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json backend/prisma.config.ts ./
COPY backend/prisma ./prisma
COPY backend/src ./src

# Seed input (used by prisma/seed.ts)
COPY seed ./../seed

RUN npx prisma generate
RUN npm run build

COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 9001

CMD ["./docker-entrypoint.sh"]
