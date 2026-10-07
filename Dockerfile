FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY tsconfig.json ./

# Fix workspace protocol for Alpine's npm - use file: paths
RUN find . -name "package.json" -exec sed -i 's|"@snake/shared": "workspace:\*"|"@snake/shared": "file:../shared"|g' {} \;

RUN npm install && npm run build && npm prune --production

RUN cp -r packages/server/dist . && cp -r packages/client/dist public

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/main.js"]
