FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package.json ./
RUN npm install
COPY backend/ .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY seed ./seed
ENV SEED_PATH=/app/seed/worklogs.json
EXPOSE 5000
CMD ["node", "dist/main.js"]
