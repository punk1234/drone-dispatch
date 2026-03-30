# Drone Dispatch API

A REST API for managing a fleet of 10 autonomous drones delivering medications. Built with Node.js, TypeScript, Express 5, PostgreSQL, Redis, and RabbitMQ.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework | Express 5 |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache | Redis 7 (ioredis) |
| Message broker | RabbitMQ (amqplib) |
| File storage | AWS S3 / LocalStack (pre-signed URL flow) |
| Validation | Zod |
| Testing | Jest + Supertest |

---

## Architecture

```
src/
  app/
    abstract.app.ts      # AbstractApp — lifecycle, middleware, configure()
    app.ts               # App extends AbstractApp — wires all dependencies
    route.manager.ts     # /api prefix applied once here
  config/
    database.ts, redis.ts, rabbitmq.ts
  controllers/           # Arrow-property classes — no .bind() needed
  jobs/
    battery-audit.job.ts # node-cron: records battery levels every minute
  middlewares/
    auth.middleware.ts        # API key validation, role resolution
    error.middleware.ts       # Centralised error handler + AppError
    rate-limit.middleware.ts  # Per-API-key rate limiting (express-rate-limit)
    validate.middleware.ts    # Zod validation → req.validated
  repositories/
    drone.repository.ts       # DroneRepository + AuditLogRepository
    medication.repository.ts  # MedicationRepository
  routes/
  services/
    base.service.ts           # isDatabaseUniqueConstraint helper
    drone.service.ts          # Business logic — no Prisma imports
    medication.service.ts
    audit-log.service.ts
  types/
    index.ts                  # Re-exports from @prisma/client
    prisma.types.ts           # DroneWithMedications, PaginatedResult, etc.
  utils/
    cache.service.ts          # Redis wrapper — services never touch Redis directly
    logger.ts, rabbitmq.publisher.ts, s3.ts
  validations/
    index.ts                  # All Zod schemas + PaginationSchema
  workers/
    rabbitmq.consumer.ts      # In-process consumer — 3 queues
  server.ts                   # main() — initialize, checkDependencies, run
prisma/
  schema.prisma
  seed.ts
tests/
  drone.service.test.ts
  medication.service.test.ts
  audit-log.service.test.ts
  validations.test.ts
  auth.middleware.test.ts
```

### Key design decisions

**Repository pattern** — Services never import Prisma directly. All DB calls go through `DroneRepository`, `AuditLogRepository`, or `MedicationRepository`. Swapping the ORM requires changes only in the repository layer.

**CacheService** — Redis is wrapped in `src/utils/cache.service.ts`. Services call `this.cache.get/set/del` — never `getRedisClient()` directly. Failures are logged but never propagated — cache is non-critical.

**State machine** — Drone state transitions are enforced via an explicit `VALID_TRANSITIONS` map. Invalid transitions throw `AppError 422` before any DB call.

**Single `P2002` catch** — Duplicate detection uses Prisma's unique constraint error code rather than a pre-check query. This saves one DB round-trip per create operation.

**Medication code as primary key** — `Medication.code` (e.g. `AMX_500`) is the natural unique identifier and is used as the PK. No redundant UUID column.

**Auto-increment IDs for `BatteryAuditLog`** — Audit logs are append-only and sequential. Integer auto-increment is smaller and more index-friendly than UUID for this table.

**Narrow mutation responses** — `PATCH /state` and `PUT /battery` return only the changed fields (`id`, `serialNumber`, and the updated field) — not the full drone with medications. The client already has the drone; returning the full object would be over-fetching.

---

## API

Interactive docs available at `http://localhost:3000/api/docs` once the app is running.
Full spec: `api-spec.yml`.

### Authentication

All endpoints require an `X-Api-Key` header.

| Key | Role | Access |
|---|---|---|
| `dd-admin-k9x2mP7qL4nW8vT3` | Admin | Full access |
| `dd-readonly-rJ5yH6bN1cQ2sA9` | Readonly | GET endpoints only |

| Scenario | Status |
|---|---|
| Missing `X-Api-Key` | `401` |
| Unrecognised key | `401` |
| Valid readonly key on admin endpoint | `403` |

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/api/drones` | Admin | Register a drone |
| `GET` | `/api/drones` | Both | List drones (paginated) |
| `GET` | `/api/drones/available` | Both | Drones available for loading |
| `GET` | `/api/drones/audit-logs` | Both | Battery audit logs — all drones |
| `GET` | `/api/drones/:id` | Both | Get drone by ID |
| `GET` | `/api/drones/:id/medications` | Both | Loaded medications |
| `GET` | `/api/drones/:id/battery` | Both | Battery level |
| `GET` | `/api/drones/:id/audit-logs` | Both | Battery audit logs — one drone |
| `POST` | `/api/drones/:id/load` | Admin | Load medications |
| `PATCH` | `/api/drones/:id/state` | Admin | Update state |
| `PUT` | `/api/drones/:id/battery` | Admin | Update battery level |
| `POST` | `/api/medications` | Admin | Create medication |
| `GET` | `/api/medications` | Both | List medications |
| `GET` | `/api/medications/:code` | Both | Get medication by code |
| `POST` | `/api/storage/upload-url` | Admin | Generate pre-signed S3 URL |

### Pagination

All list endpoints that return collections support pagination via query params:

```
GET /api/drones?page=2&limit=10
GET /api/drones/audit-logs?page=1&limit=50
```

Paginated responses include a `meta` object:

```json
{
  "data": [...],
  "meta": {
    "total": 42,
    "page": 2,
    "limit": 10,
    "totalPages": 5
  }
}
```

### State machine

Transitions are strictly enforced — invalid transitions return `422`:

```
IDLE       → LOADING
LOADING    → IDLE          load cancelled (medications cleared)
LOADING    → LOADED        loading complete
LOADED     → LOADING       incremental loading
LOADED     → DELIVERING    drone dispatched
LOADED     → IDLE          load abandoned (medications cleared)
DELIVERING → DELIVERED     arrived at destination (medications cleared)
DELIVERED  → RETURNING     heading back to base
RETURNING  → IDLE          back at base
```

### Rate limiting

Applied per API key (not IP address — aligns with the auth model).

| Limiter | Limit | Endpoints |
|---|---|---|
| Strict | 20 req / 15 min | All mutating endpoints |
| General | 100 req / 15 min | All GET endpoints |

All rate limit values are configurable via environment variables. To disable during local testing:

```bash
RATE_LIMIT_MAX_STRICT=10000
RATE_LIMIT_MAX_GENERAL=10000
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm

### 1. Clone and install

```bash
git clone <repo-url>
cd drone-dispatch
npm install
```

### 2. Configure environment

```bash
cp .env.docker .env
# Edit .env if you need to change any values
```

### 3. Start infrastructure

```bash
docker compose up -d postgres redis rabbitmq localstack
```

Wait for postgres to be healthy (about 5 seconds), then:

```bash
# Create tables
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Seed 10 drones and 5 medications
npm run db:seed
```

### 4. Start the API

```bash
npm run dev
```

### Full Docker setup (app + infrastructure)

```bash
docker compose up --build
```

Then run migrations against the containerised database:

```bash
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string |
| `ADMIN_API_KEY` | — | Admin API key |
| `READONLY_API_KEY` | — | Readonly API key |
| `AWS_ENDPOINT_URL` | — | S3 endpoint (use LocalStack URL locally) |
| `AWS_S3_BUCKET` | — | S3 bucket name |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | — | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | — | AWS credentials |
| `BATTERY_AUDIT_CRON` | `* * * * *` | Cron schedule for battery audit |
| `CACHE_TTL` | `30` | Redis cache TTL in seconds |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_STRICT` | `20` | Strict limit per window |
| `RATE_LIMIT_MAX_GENERAL` | `100` | General limit per window |
| `PRESIGNED_URL_EXPIRES` | `300` | Pre-signed URL expiry in seconds |

See `.env.example` for the full template and `.env.docker` for pre-filled Docker values.

---

## Testing

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Type check only
npx tsc --noEmit
```

### Test structure

| File | Type | Coverage |
|---|---|---|
| `drone.service.test.ts` | Unit | State machine (9 valid + 21 invalid transitions), load guards, cache, events |
| `medication.service.test.ts` | Unit | Create, find, duplicate detection |
| `audit-log.service.test.ts` | Unit | Pagination, filtering |
| `validations.test.ts` | Unit | All Zod schemas, edge cases |
| `auth.middleware.test.ts` | Unit | 401/403 cases, role resolution |

---

## Seeded data

The seed file creates 10 drones across all states and 5 medications to support immediate testing:

| Serial | Model | Battery | State |
|---|---|---|---|
| DRN-ALPHA-001 | Heavyweight | 95% | IDLE |
| DRN-ALPHA-002 | Heavyweight | 80% | IDLE |
| DRN-BETA-001 | Cruiserweight | 60% | LOADING |
| DRN-BETA-002 | Cruiserweight | 45% | IDLE |
| DRN-GAMMA-001 | Middleweight | 30% | IDLE |
| DRN-GAMMA-002 | Middleweight | 20% | IDLE *(battery too low to load)* |
| DRN-DELTA-001 | Lightweight | 90% | DELIVERING |
| DRN-DELTA-002 | Lightweight | 75% | DELIVERED |
| DRN-DELTA-003 | Lightweight | 55% | RETURNING |
| DRN-ECHO-001 | Middleweight | 100% | IDLE |

Medications: `AMX_500`, `PCM_250`, `IBU_400`, `MET_1000`, `LSN_010`.

---

## What I would add next

- **Redis-backed rate limit store** — with multiple app replicas (K8s HPA), each instance tracks its own counter independently. `rate-limit-redis` slots in with one config change since Redis is already in the stack.
- **`DroneMedication` lifecycle** — add a `status` field (`LOADED`, `DELIVERED`, `RETURNED`) and `deliveredAt` timestamp. Instead of deleting records on delivery, mark them as `DELIVERED` for full audit history.
- **Delivery destination** — attach a recipient ID or address to the load operation. Currently the API has no concept of where medications are going.
- **K8s migration Job** — run `prisma migrate deploy` as a Kubernetes Job before the Deployment rollout rather than on every container start.
- **OAuth2 client credentials** — replace static API keys with a proper token flow for production multi-tenant use.
