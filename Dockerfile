FROM node:22-slim

WORKDIR /code

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

CMD [ "node", "src/index.ts" ]
