# Architecture & Design

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT (React + Canvas)               │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Start Screen  │  │  Game Canvas │  │   HUD/Score    │  │
│  │   (Nickname)   │  │  (WebSocket) │  │  Leaderboard   │  │
│  └────────────────┘  └──────────────┘  └────────────────┘  │
│                                                              │
│  Interpolation | Input Throttling | i18n (EN/ES)           │
└────────────────────────────────────────────────────────────┘
                         WebSocket (Binary)
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                SERVER (Node.js + Fastify)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Game Engine (Authoritative)             │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Room Manager (auto-matchmaking, cleanup)      │  │  │
│  │  │  • Tick loop (15/20 Hz configurable)          │  │  │
│  │  │  • Spatial grid (O(1) collision detection)    │  │  │
│  │  │  • Bot manager (fills empty rooms)            │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Game Logic                                    │  │  │
│  │  │  • Movement (dt-based, wrap-around arena)     │  │  │
│  │  │  • Boost (mass consumption, protection)       │  │  │
│  │  │  • Collisions (head-to-head, head-to-body)   │  │  │
│  │  │  • Food (spawn, collect, drop on death)       │  │  │
│  │  │  • Revival claims (state machine, expiry)     │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  REST API: /health, /readyz, /api/metrics                   │
│  WebSocket: /ws (join, input, state broadcast)              │
│  Admin: /admin (React + lazy load)                          │
└────────────────────────────────────────────────────────────┘
                         Sync (Queries)
                              ↕
┌─────────────────────────────────────────────────────────────┐
│             PostgreSQL (Sessions, Runs, Analytics)         │
│  • schema_version (migrations tracking)                     │
│  • sessions (player identity & locale)                      │
│  • runs (per-game metrics)                                  │
│  • revive_claims (reward state machine)                     │
│  • game_events (daily aggregates)                           │
│  • ad_events (impression/click tracking)                    │
│  • audit_logs (admin actions)                               │
│  • app_settings (configuration)                             │
└─────────────────────────────────────────────────────────────┘
```

## Low-Resource Optimizations

### Network Efficiency

**Binary Codec** (`packages/shared/src/binary-codec.ts`):
- Snakes: id_hash(2B) + mass(2B) + flags(1B) + segment_count(1B) + segments(4B each)
- Food: id_hash(2B) + position(4B)
- Total: ~50-100 bytes vs ~1000+ bytes JSON
- **Bandwidth reduction**: ~90%

**Viewport Interest**:
- Each client only receives data for snakes/food within game area
- Server calculates bounding box per client
- Other rooms' data never sent
- **Saves bandwidth and processing**

**Delta Updates**:
- Only changed segments are sent, not full snake
- Interpolation on client reconstructs smooth movement
- Leaderboard top-5 only (not all players)

**Input Throttling**:
- Client: max 20 inputs/second per player
- Server: verifies timestamp, drops old inputs
- **Prevents DDoS and reduces processing**

### CPU Efficiency

**Spatial Grid** (not quadtree or R-tree):
- Fixed-size grid (200x200 px cells by default)
- O(1) lookup, O(k) where k = objects in cell
- ~99% of queries touch 1-4 cells
- No dynamic tree rebalancing overhead

**Tick Rate Flexibility**:
- Low: 15 Hz (saves 25% CPU vs 20 Hz)
- Standard: 20 Hz
- High: 20 Hz (same rate, larger worlds)

**Bot AI Simplification**:
- Decision every N ticks (not every tick)
- No pathfinding (just move toward closest food)
- No collision avoidance planning

**Object Pooling**:
- Reuse snake body segment arrays
- Avoid allocations during tick loop
- **Reduces GC pressure significantly**

### Memory Efficiency

**Tight Type Definitions**:
- Int16 for coordinates (covers ±32k px)
- Uint16 for mass (covers 0-65k)
- Single boolean per flag (not separate fields)

**Configuration-Driven Limits**:
- Max snakes per room: 30-40 (not 100+)
- Max food per room: 200-600 (not 1000+)
- Max snake length: 250-600 segments (not unlimited)
- Connection pool: 4-12 (not 50+)

**PostgreSQL Small Config**:
- `shared_buffers=32MB` (from default 128MB)
- `work_mem=2MB` (from 4MB)
- `max_connections=30` (from 100)
- Only for aggregate data (not per-tick writes)

**Lazy-Loaded Admin Panel**:
- Admin React bundle is chunked, loaded only on `/admin`
- Main game bundle: ~50 KB (gzip)
- Admin bundle: +30 KB (loaded separately)

### Disk/I/O Efficiency

**Event Aggregation**:
- Never write per-tick to database
- Aggregate in memory: runs, deaths, revivals per day
- Flush once per minute to DB (batch insert)
- **Reduction: from 2000+ writes/min to ~1 write/min**

**Selective Persistence**:
- Session data: in-memory, persisted only on logout or timeout
- Game state: never persisted (reconstructed on client join)
- Admin actions: logged (audit trail)
- Player metrics: aggregated daily

**Cleanup**:
- Expired sessions removed by cron (daily)
- Empty rooms cleaned up after 60s inactivity
- Old events deleted per retention policy (30d by default)

## Core Components

### Shared Package

**Types** (`types.ts`):
- Single source of truth for data structures
- Used by both server and client

**Schemas** (`schemas.ts`):
- Zod validation for all inputs
- Defensive against malformed messages
- Type-safe at runtime

**Binary Codec** (`binary-codec.ts`):
- Compact serialization for game state
- Stateless (can be used anywhere)
- Round-trip tested

**i18n** (`i18n-types.ts`):
- Locale detection (navigator, localStorage, URL)
- Translation string types (catch missing keys at compile time)

**Resource Profiles** (`resource-profiles.ts`):
- Detect available CPU/memory
- Map to pre-tuned settings
- Allow manual overrides via env vars

**Error Codes** (`error-codes.ts`):
- Centralized error messages (EN + ES)
- Used by server (send codes) and client (translate)
- Prevents hardcoded strings

### Server Package

**Game Engine** (`game/engine.ts`):
- Owns all game state (rooms, snakes, food)
- Tick loop (15 or 20 Hz, configurable)
- Room creation/destruction
- Metrics aggregation

**Room** (`game/engine.ts`):
- Simulates one game world
- Handles all movement, collisions, food
- Targets 12-30 players per room
- Auto-cleans when empty

**Spatial Grid** (`game/spatial-grid.ts`):
- Efficient collision detection
- Insert/remove/update in O(1) amortized
- getNearby() returns candidates

**WebSocket Server** (`ws/index.ts`):
- Manages client connections
- Listens for `join` and `input` messages
- Broadcasts binary-encoded game state every ~50ms
- Backpressure handling (drop old frames if client lags)

**API Routes** (`api/routes.ts`):
- `/healthz` - liveness probe
- `/readyz` - readiness probe (includes metrics)
- `/api/metrics` - current game metrics
- `/api/admin/rooms` - room inspection

**Database** (`db/`):
- Connection pool (4-12 connections)
- Migration runner (auto on startup)
- Query helpers (`query()`, `queryOne()`)
- No ORM (raw SQL, minimal overhead)

**Config** (`config.ts`):
- Loads and validates all env vars
- Detects resource profile
- Merges overrides
- Exposes single `config` singleton

**Logger** (`logger.ts`):
- Pino for structured logging
- JSON in prod, pretty in dev
- Includes module name for filtering

### Client Package

**Game Canvas** (`components/GameCanvas.tsx`):
- Renders arena, snakes, food
- Interpolation between ticks
- FPS counter (dev mode)
- Minimal React interaction (pure Canvas)

**HUD** (`components/HUD.tsx`):
- Score display
- Top-5 leaderboard
- Player count
- Control hints (varies mobile vs desktop)

**API Client** (`api.ts`):
- WebSocket management
- Automatic reconnection (exponential backoff)
- Binary state decoding
- Listener pattern (React hooks can subscribe)

**i18n** (`i18n/index.ts`):
- `en.ts` and `es.ts` with type-safe keys
- `I18n` class manages locale, subscriptions
- `i18n.t('game.score')` with optional params

**App** (`App.tsx`):
- Start screen (nickname entry)
- Game screen (Canvas + HUD)
- Death screen (score, restart)
- Language selector

## Game Mechanics

### Movement

```typescript
// Each tick (every 50-66ms):
snake.direction = snake.nextDirection  // Apply input
newPosition = head + (speedVector * dt) // dt-based movement
newPosition = wrap(newPosition, arenaSize) // Wrap around edges
snake.segments.unshift(newHead)
snake.segments.pop()  // Remove tail (unless growing)
```

**Why**: dt-based movement is frame-rate independent and smoother than discrete grid movement.

### Collision Detection

**Head-to-Body**:
```
if (distance(head, bodySegment) < collisionRadius):
  self.isDead = true
```

**Head-to-Head** (Deterministic):
```
if (distance(head1, head2) < collisionRadius):
  if (snake1.mass > snake2.mass):
    snake2.isDead = true
  else if (snake2.mass > snake1.mass):
    snake1.isDead = true
  else:
    both.isDead = true  // Tie
```

**Why**: Mass-based fairness prevents small snakes from bullying. Tie rule is rare but fair.

### Boost

```typescript
if (snake.boosting && snake.mass > minBoostLength):
  snake.mass -= boostConsumption  // 1 per tick
  snake.speed *= boostMultiplier
else:
  snake.boosting = false
```

**Strategic trade-off**: Boost lets you escape or chase, but shrinks you.

### Revival

**State Machine**:
```
On Death:
  create ReviveClaim {
    status: 'waiting'
    expires_at: now + 5min
    restoreMass: currentMass * 0.5
  }

On Revive Click (dev/future):
  claim.status = 'ad_shown'
  [Wait for verification]
  
On Verification:
  claim.status = 'verified'
  spawn(newSnake, restoreMass, protectedTime=3s)
  claim.used = true
```

**Why**: 
- One-per-run: prevents infinite revivals
- Restore percentage: makes revival valuable but not overpowering
- Protection: prevents immediate death on respawn
- Verification: prevents duplicate/spoofed claims

## Performance Targets

### Low Profile (1 vCPU / 1 GB)

| Metric | Target |
|--------|--------|
| Tick duration | <50ms (15 Hz) |
| Memory (app) | <200 MB |
| Memory (db) | <100 MB |
| Concurrent players | 30-60 (2-4 rooms) |
| Latency p95 | <100ms |

### Standard Profile (2 vCPU / 2 GB)

| Metric | Target |
|--------|--------|
| Tick duration | <50ms (20 Hz) |
| Memory (app) | <400 MB |
| Memory (db) | <200 MB |
| Concurrent players | 80-150 (4-6 rooms) |
| Latency p95 | <80ms |

### High Profile (4 vCPU / 8 GB)

| Metric | Target |
|--------|--------|
| Tick duration | <50ms (20 Hz) |
| Memory (app) | <800 MB |
| Memory (db) | <500 MB |
| Concurrent players | 250-400+ (8-12 rooms) |
| Latency p95 | <60ms |

## Future Scaling

If you outgrow single-server:

### Phase 1: Caching (DB reads)
- Add Redis for leaderboard, session cache
- Minimal client changes

### Phase 2: Pub/Sub (Cross-process)
- Redis pub/sub for room broadcast (not direct WebSocket)
- Allows multiple app instances
- Load balance via Nginx/HAProxy

### Phase 3: Microservices (Separate roles)
- Game servers (tick loop only)
- API servers (REST endpoints)
- Socket servers (WebSocket bridge)
- Admin servers (dashboard)
- Data servers (PostgreSQL, aggregation)

### Phase 4: Sharding (Horizontal)
- Each shard owns subset of rooms (e.g., room 0-99999 on instance 1)
- Cross-shard communication for leaderboard aggregation
- Requires consistent hashing

## Security

### Server Authority
- **All game logic on server**: Client cannot cheat position/score
- Input validation: Zod schemas validate every message
- Rate limiting: Max 20 inputs/sec per client
- IP-based tracking: Hash IP for bot/abuse detection

### Database
- Prepared statements (node-pg native)
- No SQL injection surface
- Connection pooling limits resource exhaustion
- Secrets in env vars, never in code

### Admin Panel
- HttpOnly cookies (no JavaScript access)
- CSRF tokens (Fastify built-in)
- Rate limiting on login (5 attempts per 5min)
- Password hashing (scrypt, N=2^14)
- Reauthentication for sensitive actions

### WebSocket
- Message size limits (~10 KB per message)
- Connection limits per IP
- Backpressure handling (drop old frames if client lags)
- No eval or dynamic code execution

## Monitoring

### Application Metrics
- Real-time: `/api/metrics` endpoint
- Historical: Aggregated to PostgreSQL (game_events table)
- Admin dashboard charts these over time

### Resource Metrics
- Docker stats: CPU, memory, network
- Process memory: RSS, heap used (logged each minute)
- Event loop lag: Tracked in game tick (warn if >100ms)

### Health Checks
- `/healthz`: Responds 200 OK if alive (no DB check)
- `/readyz`: Responds 200 OK if DB connected and game running
- Kubernetes/Docker uses these for readiness/liveness probes

## Testing Strategy

### Unit Tests
- Game mechanics: movement, collisions, boost logic
- Schemas: input validation
- Profiles: resource detection
- i18n: string keys and locale selection

### Integration Tests
- Database: migrations, inserts, queries
- WebSocket: connect, send input, receive state
- Admin: login, config changes, audit logging

### Load Tests
- Concurrent connections: 10, 50, 100+ clients
- Measure: message rate, latency, memory, CPU
- Identify bottlenecks (DB pool, tick duration, etc.)

### E2E Tests (Manual)
- Join game, move, eat food, boost, die, restart
- Language switching
- Reconnection
- Admin login and settings

## Deployment Model

### Development
```bash
docker compose -f compose.yaml -f compose.dev.yaml up
```
- App rebuilds on code changes
- Hot reload on client changes
- Logs streamed to console
- One process, one database

### Production (Dokploy)
```bash
# Dokploy handles:
docker compose build --push  # Build image
docker compose up -d         # Start containers
docker compose exec app npm run migrate  # Migrations
```
- Auto HTTPS/WSS via Traefik
- Health checks every 30s
- Auto-restart on failure
- Persistent volume for database
- Logs to Docker stdout

### Scaling Beyond Single Server
- Switch from Docker Compose to Kubernetes/Swarm
- Use shared PostgreSQL (RDS or external)
- Add Redis for caching/pub-sub
- Load balance via Nginx/ingress controller
- (Not needed for 1-4 vCPU targets)
