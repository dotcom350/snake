FROM node:22-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY packages ./packages

RUN npm install && npm run build && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

USER node
EXPOSE 3000

CMD ["node", "packages/server/dist/main.js"]
