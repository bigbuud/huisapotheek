FROM --platform=linux/amd64 node:18-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/medicijnkast.db

EXPOSE 3000

CMD ["node", "server.js"]
