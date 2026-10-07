# Snake Arena - Multiplayer Snake Game

A production-ready, low-resource optimized multiplayer snake game with modern UI, bilingual support (EN/ES), and comprehensive admin panel.

## Features

- **Multiplayer Gameplay**: Real-time action with smooth movement and collisions
- **Server Authoritative**: Secure, cheat-proof game logic on the backend
- **Low Resource Optimized**: Runs efficiently on 1 vCPU / 1 GB RAM servers
- **Bilingual UI**: Full English and Spanish support with auto-detection
- **Admin Panel**: Real-time metrics, room management, and settings
- **Docker Ready**: Multi-stage build, Dokploy compatible
- **Responsive Design**: Works on desktop, tablet, and mobile

## Quick Start

### Prerequisites

- Node.js 24 LTS (22.12+ works) and npm
- Docker & Docker Compose (for containerized deployment)
- PostgreSQL 16+ (or use Docker container)

### Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Start database and app with Docker Compose
docker compose -f docker-compose.yml -f docker-compose.local.yml up

# In another terminal, start the dev servers
npm run dev
```

The app will be available at http://localhost:3000 and hot-reload on code changes.

### Production Build

```bash
# Build all packages
npm run build

# Build Docker image
npm run docker:build

# Run with Docker Compose
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

## Environment Variables

### Database
- `DATABASE_URL` - PostgreSQL connection string

### Application
- `NODE_ENV` - `development`, `production`, or `test`
- `SERVER_HOST` - Host to bind to (default: 0.0.0.0)
- `SERVER_PORT` - Port to listen on (default: 3000)
- `WS_PATH` - WebSocket endpoint path (default: /ws)

### Resource Profile
- `RESOURCE_PROFILE` - `auto`, `low`, `standard`, or `high` (default: auto)
  - **low** (1 vCPU / 1 GB): 15 Hz tick, 12 players/room, 2 rooms max
  - **standard** (2 vCPU / 2 GB): 20 Hz tick, 20 players/room, 6 rooms max
  - **high** (4 vCPU / 8 GB): 20 Hz tick, 30 players/room, 12 rooms max
  - **auto**: Detects based on available resources

### Game Settings (Optional Overrides)
- `TICK_HZ` - Game simulation tick rate (default depends on profile)
- `ROOM_CAPACITY` - Max players per room
- `MAX_ROOMS` - Maximum concurrent rooms
- `BOT_ENABLE` - Enable bot players (default: true)
- `BOT_MIN_PER_ROOM` - Minimum bots when below player threshold
- `ARENA_WIDTH` / `ARENA_HEIGHT` - Arena dimensions in pixels
- `BOOST_CONSUMPTION` - Mass consumed per tick while boosting
- `BOOST_MIN_LENGTH` - Minimum snake length to boost

### Revival & Rewards
- `REVIVAL_PROTECTION_DURATION` - Seconds of invulnerability after revive (default: 3)
- `REVIVAL_RESTORE_PERCENT` - Percentage of mass restored (0-100, default: 50)
- `REVIVAL_MAX_PER_RUN` - Maximum revives per game (default: 1)
- `REVIVAL_CLAIM_EXPIRY` - Seconds before revive claim expires (default: 300)

### Admin
- `ADMIN_BOOTSTRAP_EMAIL` - Initial admin email
- `ADMIN_BOOTSTRAP_PASSWORD` - Initial admin password
- `ADMIN_RATE_LIMIT_ATTEMPTS` - Max login attempts
- `ADMIN_RATE_LIMIT_WINDOW` - Rate limit window in seconds

### Advertising
- `AD_ENABLE` - Enable ads (default: false)
- `AD_FREQUENCY_CAP_DAILY` - Max ads per player per day
- `AD_MONETAG_SCRIPT_URL` - Monetag SDK script URL (if using)

### Logging & Metrics
- `LOG_LEVEL` - `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: info)
- `METRICS_SAMPLE_INTERVAL` - Metric collection interval in seconds
- `EVENT_RETENTION_DAYS` - How long to keep event data

## Deployment with Dokploy

Dokploy provides a simple way to deploy on your own infrastructure.

### Setup

1. **Create Dokploy Instance** on your VPS (see https://dokploy.com/docs/core/getting-started)

2. **Add Repository**
   - In Dokploy dashboard: Applications > Create
   - Select Docker Compose
   - Connect your GitHub repository

3. **Configure Compose**
   - Select `docker-compose.yml` file

4. **Set Environment Variables**
   - Copy values from `.env.example`
   - Set `ADMIN_BOOTSTRAP_PASSWORD` to a secure value
   - Configure `RESOURCE_PROFILE` based on your VPS specs
   - Set `SITE_URL` to your public URL (e.g. `https://snake.example.com`) so canonical, hreflang and sitemap links are correct

5. **Configure Domain**
   - Add your domain in Dokploy
   - Dokploy automatically handles HTTPS via Traefik

6. **Deploy**
   - Click Deploy
   - Dokploy builds the image, starts services, and applies migrations automatically

### Scaling for 1 GB RAM

If running on 1 GB RAM:

1. Set `RESOURCE_PROFILE=low`
2. Add 1-2 GB swap to your server:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```
3. Monitor memory with `free -h` and `docker stats`

### Backup & Restore

**Backup PostgreSQL:**
```bash
docker compose exec postgres pg_dump -U postgres snake_game > backup.sql
```

**Restore:**
```bash
docker compose exec -T postgres psql -U postgres snake_game < backup.sql
```

## Admin Panel

Open `/admin` on your site. The panel is available in English and Spanish.

### First login
Set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` in the environment (Dokploy → Environment) and redeploy. The account is created only when no admin exists yet; change the password afterwards in **Account**. There are no default credentials.

Security: passwords are hashed with scrypt, logins are rate-limited, sessions expire after 12 hours and the session token lives only in the admin tab (not in a cookie), so ad scripts on the public pages cannot use it. Every change is written to the audit log.

### Pages
- **Dashboard**: players online, bots, rooms, connections, memory, tick time (live, every 5 s), today vs. yesterday, players online over the last 48 h, active rooms.
- **Statistics** (7/30/90/365 days): visitors, page views, games, unique players, play time, average game, kills, peak players, devices, languages, most used snakes, how games end, referrers, search-engine and social bots (SEO), ad impressions, top scores today and all time.
- **Ads**: code for `<head>`, a banner on the home page, an ad on the "You died" screen (every N deaths) and the contents of `/ads.txt`.
- **Appearance**: arena background color and pattern, wall color, food colors and glow, home-page colors, with a live preview.
- **Snakes**: create, edit, enable or delete skins (pattern, head shape, up to 6 colors, glow). Players pick their snake on the home page.
- **Gameplay**: arena size, players and bots per room, food, speed, boost speed and cost, starting length, spawn protection. Empty fields use the automatic server profile.
- **Sound**: generated background music (chill/arcade/off), default volumes, upload your own MP3/OGG/M4A/WAV, test buttons.
- **Account**: change password, time zone used by statistics, audit log.

Uploaded music is stored in the `app_data` volume (`/app/data`).

## Advertising (Monetag and others)

Paste the tags from your ad network in **Admin → Ads**. Pages are served with a per-request CSP nonce plus `strict-dynamic`, so ad scripts (and the scripts they load) run without weakening the policy for the rest of the site. Ads never pause the game.

Rewarded ads with server-verified rewards are only documented by Monetag for Telegram Mini Apps, so the game does not offer "watch an ad to revive".

## Testing

### Unit Tests
```bash
npm test
```

### Run Locally with Docker
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

### Health Checks
```bash
curl http://localhost:3000/healthz  # Should return {"status":"ok"}
curl http://localhost:3000/readyz   # Should return ready status
```

## Architecture

### Technology Stack
- **Frontend**: TypeScript without a framework + Vite, Canvas 2D, static SEO landing pages (EN at `/`, ES at `/es/`)
- **Backend**: Node.js LTS, Fastify, ws (WebSocket)
- **Database**: PostgreSQL 16, async connection pool
- **Deployment**: Docker, Docker Compose, Dokploy

### Performance Optimizations
- **Binary codec** for compact game state transmission (reduces bandwidth ~70%)
- **Spatial grid** for O(1) collision detection
- **Delta updates**: Only send changed data
- **Input throttling**: Max 20 inputs/sec per client
- **Aggregation**: Game events aggregated to daily summaries, never per-tick

### Game Rules
- **Speed**: 200 px/sec base movement
- **Boost**: Consumes 1 mass/tick, requires min length 4
- **Collision**: Head-to-head (higher mass wins), head-to-body (death)
- **Food**: Drop on death, collected by head contact
- **Spawn Protection**: 3 seconds, cannot damage/collect food
- **Max Snake Length**: 250-600 segments depending on profile

## Troubleshooting

### Database Connection Error
```
ERROR: connect ECONNREFUSED 127.0.0.1:5432
```
- Ensure `postgres` service is running: `docker compose ps`
- Check `DATABASE_URL` in `.env`
- Wait a few seconds for PostgreSQL to start

### Memory Usage High
- Check resource profile: `docker compose logs app | grep "profile"`
- Monitor: `docker stats snake-game-app`
- If >90% utilization, increase `NODE_HEAP_MB` or add swap

### WebSocket Connection Fails
- Check browser console for connection URL
- Ensure `/ws` path matches `WS_PATH` env var
- Verify domain routing (Dokploy) or proxy headers

### Admin Login Not Working
- Bootstrap happens on **first startup only**
- Reset by deleting database volume: `docker compose down -v`
- Or use Dokploy to view initial credentials

## Support & Docs

- [Dokploy Documentation](https://dokploy.com)
- [Fastify Documentation](https://www.fastify.io)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)

## License

MIT

---

## Español

### Inicio Rápido

```bash
# Instalar dependencias
npm install

# Copiar configuración
cp .env.example .env

# Iniciar con Docker Compose
docker compose -f docker-compose.yml -f docker-compose.local.yml up

# En otra terminal, iniciar desarrollo
npm run dev
```

### Despliegue con Dokploy

1. Crear instancia de Dokploy en tu VPS
2. Conectar repositorio
3. Seleccionar `docker-compose.yml`
4. Configurar variables de entorno
5. Mapear dominio (https automático)
6. Deploy

### Panel Admin

Accede en `/admin` después del despliegue.

**Autenticación**: Email y contraseña configurados en `ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD`.

### Anuncios (Monetag)

Actualmente desactivados para sitios web estándar. El panel de admin permite configuración segura.

### Solución de Problemas

**Error de conexión a BD**:
- Verifica que `postgres` esté corriendo
- Espera unos segundos a que PostgreSQL inicie

**Uso de memoria alto**:
- Aumenta `NODE_HEAP_MB`
- O configura más swap en el servidor
