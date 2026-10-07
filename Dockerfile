FROM node:24-alpine

RUN npm install -g npm@latest && npm cache clean --force

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages

RUN npm ci && npm run build && npm prune --omit=dev && npm cache clean --force

RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV NODE_OPTIONS="--max-old-space-size=256"

USER node
EXPOSE 3000

CMD ["node", "packages/server/dist/main.js"]
