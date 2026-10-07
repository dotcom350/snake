# Multi-stage build for production deployment
# Optimized for low resource usage

# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# First, upgrade npm to support workspaces
RUN npm install -g npm@latest

COPY package*.json ./
COPY packages ./packages
COPY tsconfig.json ./

# Install all dependencies (including workspaces)
RUN npm install --workspaces

# Build all packages
RUN npm run build --workspaces

# Remove dev dependencies
RUN npm prune --production --workspaces

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built artifacts and dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages/server/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/client/dist ./public

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

EXPOSE 3000

CMD ["node", "dist/main.js"]
