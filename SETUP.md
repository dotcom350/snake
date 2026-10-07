# Setup & Installation Guide

## Prerequisites

- **Node.js**: 22+ (https://nodejs.org)
- **npm**: 9+ (included with Node.js)
- **Docker & Docker Compose**: For containerized deployment
- **PostgreSQL**: 16+ (or use Docker)
- **Git**: For version control

## Local Development Setup

### 1. Clone or Initialize Repository

```bash
# If cloning:
git clone <repository-url>
cd snake

# If starting fresh (already done):
npm install
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all workspaces (shared, server, client, loadtest).

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your settings. Key variables:

```bash
# For local dev with Docker:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/snake_game_dev
NODE_ENV=development
LOG_LEVEL=debug
RESOURCE_PROFILE=standard
```

### 4. Start Database (Docker)

```bash
docker compose up postgres -d
# Or with dev overrides:
docker compose -f compose.yaml -f compose.dev.yaml up postgres -d
```

### 5. Build Packages

```bash
npm run build
```

This builds:
- `packages/shared` → types, schemas, codecs
- `packages/server` → Node.js/Fastify application
- `packages/client` → React + Vite frontend

### 6. Run Tests

```bash
npm test
```

Tests run for all packages with Vitest.

### 7. Start Development Servers

**Option A: With Hot Reload**

```bash
# Terminal 1: Server (watches src/, rebuilds automatically)
npm run dev --workspace=packages/server

# Terminal 2: Client (Vite dev server with HMR)
npm run dev --workspace=packages/client
```

Then open http://localhost:5173 in your browser.

**Option B: All-in-One with Docker**

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Access: http://localhost:3000 or http://localhost:5173

### 8. Check Application Health

```bash
# Health endpoint
curl http://localhost:3000/healthz

# Readiness endpoint
curl http://localhost:3000/readyz

# Metrics endpoint
curl http://localhost:3000/api/metrics
```

## Production Deployment

### Build for Production

```bash
npm run build
npm run docker:build
```

### Deploy with Docker Compose

```bash
# Pull and run latest image
docker compose pull
docker compose up -d

# Check logs
docker compose logs -f app

# View running services
docker compose ps
```

### Deploy with Dokploy

1. Set up Dokploy on your VPS (https://dokploy.com/docs/core/getting-started)
2. Connect GitHub repository
3. Select `compose.yaml`
4. Configure environment variables (from `.env.example`)
5. Add domain and click Deploy

Dokploy handles:
- ✅ Docker image build
- ✅ PostgreSQL setup & migration
- ✅ HTTPS/WSS via Traefik
- ✅ Health checks & auto-restart
- ✅ Logs & monitoring

## Resource Profiles

### Auto Detection (Recommended)

```bash
RESOURCE_PROFILE=auto
```

Automatically detects CPU/memory and sets:
- **≤ 1 vCPU / ≤ 1.5 GB** → `low` (15 Hz, 12 players/room)
- **≤ 2 vCPU / ≤ 4 GB** → `standard` (20 Hz, 20 players/room)
- **≥ 4 vCPU / ≥ 8 GB** → `high` (20 Hz, 30 players/room)

### Manual Override

```bash
RESOURCE_PROFILE=low
TICK_HZ=15
ROOM_CAPACITY=12
BOT_MIN_PER_ROOM=4
```

## Database Migrations

Migrations run automatically on startup. To manually check:

```bash
# Connect to database
docker compose exec postgres psql -U postgres -d snake_game

# List migrations applied
SELECT * FROM schema_version;

# Exit psql
\q
```

### Backup & Restore

**Backup:**
```bash
docker compose exec postgres pg_dump -U postgres snake_game > backup.sql
```

**Restore:**
```bash
docker compose exec -T postgres psql -U postgres snake_game < backup.sql
```

## Admin Panel Setup

1. **Bootstrap Admin User**

   Created automatically on first startup using:
   ```bash
   ADMIN_BOOTSTRAP_EMAIL=admin@example.com
   ADMIN_BOOTSTRAP_PASSWORD=YourSecurePassword123!
   ```

2. **Access Panel**

   Navigate to `http://localhost:3000/admin` (or your domain)

3. **Login**

   Use the email/password from bootstrap

4. **Change Password**

   In admin panel → Settings → Change Password

## Testing

### Unit Tests

```bash
npm test
# Or watch mode
npm test -- --watch
```

### Load Testing

```bash
# Connect 50 clients for 30 seconds
npm run load-test ws://localhost:3000/ws 50 30

# Output:
# - Message rate
# - Latency (avg, p95, max)
# - Memory usage
```

### E2E Testing (Manual)

1. Start app: `npm run dev` or `docker compose up`
2. Open http://localhost:5173
3. Enter nickname and click Play
4. Test controls:
   - Arrow keys or WASD to move
   - SPACE to boost
   - Mobile: Touch joystick and boost button
5. Verify:
   - ✅ Snake moves smoothly
   - ✅ Food collection works
   - ✅ Score updates
   - ✅ Collision detection works
   - ✅ Death and restart flow

## Troubleshooting

### "Database connection error"

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check connection string in .env
DATABASE_URL=postgresql://postgres:password@postgres:5432/snake_game

# Reset database
docker compose down -v postgres
docker compose up postgres -d
```

### "Port already in use"

```bash
# Find process using port 3000
lsof -i :3000

# Or change port in .env
SERVER_PORT=3001
```

### "Build fails"

```bash
# Clean build
rm -rf node_modules dist packages/*/dist
npm install
npm run build

# Check TypeScript errors
npm run typecheck
```

### "WebSocket connection fails"

Check browser console for actual error. Common causes:
- Wrong WS URL (should be ws://localhost:3000/ws in dev)
- Proxy not forwarding upgrade headers
- WebSocket port blocked by firewall

### Memory leaks

Monitor with:
```bash
docker stats
# Watch MEM% and RSS columns
```

If RSS grows unbounded:
- Check WebSocket client cleanup
- Verify room cleanup on disconnect
- Check for circular references in game state

## Development Tips

### Hot Module Reloading

Server: Edit `packages/server/src/**/*.ts` → auto-restarts

Client: Edit `packages/client/src/**/*` → Vite HMR updates

### Debug Logs

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

Watch specific module:
```bash
# Will show "module: ws" logs
```

### Performance Profiling

```bash
# With Node.js inspector
node --inspect dist/main.js

# Or in Chrome DevTools: chrome://inspect
```

### Database Debugging

```bash
# Connect directly
docker compose exec postgres psql -U postgres -d snake_game

# Useful queries:
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM runs;
SELECT * FROM schema_version;
```

## CI/CD

### GitHub Actions (Optional)

Create `.github/workflows/test.yaml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: postgres

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22

      - run: npm install
      - run: npm run typecheck
      - run: npm test
```

## Deployment Checklist

Before deploying to production:

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `docker compose config` validates
- [ ] `.env` has all required variables
- [ ] `ADMIN_BOOTSTRAP_PASSWORD` is secure (12+ chars)
- [ ] Database URL points to production DB
- [ ] `NODE_ENV=production`
- [ ] `LOG_LEVEL=info` (not debug)
- [ ] HTTPS/WSS configured (via Dokploy or proxy)
- [ ] Backups scheduled
- [ ] Monitoring set up
- [ ] Health checks passing

## Next Steps

1. Read [README.md](./README.md) for feature overview
2. Check [MONETAG.md](./docs/monetag.md) for ad integration
3. See [DEPLOYMENT.md](./docs/deployment.md) for production details
4. Review [ARCHITECTURE.md](./docs/architecture.md) for technical deep-dive
