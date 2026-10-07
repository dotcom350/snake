# Quick Start Guide

Get the snake game running in 5 minutes.

## Option 1: Docker Compose (Fastest)

```bash
# Copy environment
cp .env.example .env

# Start everything
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build

# Open browser
# http://localhost:3000
```

That's it! Game is live at http://localhost:3000.

## Option 2: Local Development

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker compose up postgres -d

# Build packages
npm run build

# Run in separate terminals:
npm run dev --workspace=packages/server
npm run dev --workspace=packages/client

# Open http://localhost:5173
```

## Environment Variables

Copy `.env.example` to `.env` and edit:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/snake_game_dev

# Game
RESOURCE_PROFILE=auto
TICK_HZ=20
ROOM_CAPACITY=20

# Admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=ChangeMe123!

# Logs
LOG_LEVEL=debug
```

## Production Deployment (Dokploy)

1. **Set up Dokploy** on your VPS (5 minutes, https://dokploy.com)
2. **Connect repo** in Dokploy dashboard
3. **Select `docker-compose.yml`** file
4. **Set env vars** (copy from `.env.example`)
5. **Add domain** (Dokploy auto-handles HTTPS)
6. **Deploy** (Dokploy builds image, starts containers, runs migrations)

Done! Your app is live with auto-HTTPS.

### For 1 GB RAM Servers

```bash
RESOURCE_PROFILE=low
# Add 2 GB swap to your server if needed
```

## Admin Panel

After startup, admin user is created with:
- Email: value of `ADMIN_BOOTSTRAP_EMAIL`
- Password: value of `ADMIN_BOOTSTRAP_PASSWORD`

Login at `/admin` to view:
- ✅ Real-time player metrics
- ✅ Leaderboard
- ✅ Server health
- ✅ Configuration management

## Testing Locally

```bash
# Unit tests
npm test

# Load test (50 concurrent players, 30 seconds)
npm run load-test ws://localhost:3000/ws 50 30

# Health check
curl http://localhost:3000/healthz
```

## Verify Installation

```bash
# Check containers running
docker compose ps

# View logs
docker compose logs -f app

# Test game endpoint
curl http://localhost:3000/readyz

# Connect to database
docker compose exec postgres psql -U postgres -d snake_game
SELECT COUNT(*) FROM runs;  # Should show migration success
\q  # Exit
```

## Troubleshooting

**Database connection error**:
```bash
docker compose down -v
docker compose up postgres -d
# Wait 5 seconds
docker compose up app
```

**Port 3000 already in use**:
```bash
# Edit .env
SERVER_PORT=3001
```

**Want more help?** See [SETUP.md](SETUP.md) for comprehensive guide.

## What's Built

✅ **Game Engine**: Multiplayer snake with collisions, boost, food  
✅ **Multiplayer**: Real-time WebSocket, 20+ players per room  
✅ **Bilingual**: English & Spanish, auto-detected  
✅ **Admin Panel**: Metrics, configuration, player management  
✅ **Low-Resource**: Runs smoothly on 1 vCPU / 1 GB RAM  
✅ **Docker Ready**: Multi-stage build, Dokploy compatible  
✅ **Production**: PostgreSQL, migrations, health checks, monitoring  

## Next Steps

1. **Start** the game
2. **Play** (enter nickname, use arrow keys/WASD to move, SPACE to boost)
3. **Access admin** at `/admin`
4. **Deploy** to production with Dokploy

---

**Read full docs**: [README.md](README.md) | [SETUP.md](SETUP.md) | [Architecture](docs/ARCHITECTURE.md)
