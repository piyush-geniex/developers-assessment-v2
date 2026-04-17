FROM node:20-alpine

WORKDIR /app

# copy backend package.json
COPY backend/package*.json ./

RUN npm install

# copy backend code
COPY backend .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]