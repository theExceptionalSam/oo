# SchoolSync Production Migration Pack

This pack contains **every file you need** to harden, refactor, and deploy the SchoolSync repo (`theExceptionalSam/oo`) to a managed, production-shaped stack.

## What this pack does NOT do

It does NOT modify your GitHub repo directly. You apply the changes manually — copy the files into the right paths in your local clone, commit, push. This keeps you in control of every line.

## What's in the pack

```
schoolsync-prod-pack/
├── migrations/                       ← TypeORM migrations (apply in order)
│   ├── 1780000000000-AddRlsPolicies.ts           ← DB-level tenant isolation
│   ├── 1780000000001-AddPostgresSearch.ts        ← tsvector + GIN (replaces ES)
│   └── 1780000000002-AddGraphileWorkerSchema.ts  ← Postgres-as-queue (replaces Redis+BullMQ)
│
├── src/
│   ├── config/
│   │   └── jwt.config.ts                         ← Hardened — RS256 only, no HS256 fallback
│   │
│   ├── common/
│   │   ├── middleware/
│   │   │   └── rls-context.middleware.ts          ← Per-request SET LOCAL app.current_school_id
│   │   └── interceptors/
│   │       └── audit.interceptor.ts              ← Writes to audit_logs on every mutation
│   │
│   ├── shared/
│   │   ├── queue/
│   │   │   └── shared-queue.module.ts            ← Graphile Worker (replaces BullMQ)
│   │   ├── search/
│   │   │   └── search.service.ts                 ← Postgres tsvector (replaces ES)
│   │   ├── storage/
│   │   │   └── storage.service.ts                 ← Real S3/R2 SDK (replaces in-memory)
│   │   ├── events/
│   │   │   └── event-bus.service.ts               ← New shape — wraps Graphile Worker
│   │   └── realtime/
│   │       └── realtime.service.ts                ← Supabase Realtime (replaces Socket.io)
│   │
│   ├── workers/
│   │   └── main.ts                                ← Worker entry point (node dist/workers.js)
│   │
│   └── database/
│       └── seeds/
│           └── bootstrap-admin.ts                ← One-time admin creation (no hardcoded creds)
│
├── _ae/
│   ├── docker-compose.yml                         ← Drop ES + MinIO; mark Redis dev-only
│   └── .env.example                                ← New env template (Supabase/R2/Upstash/Realtime)
│
├── .github/workflows/
│   └── ci.yml                                      ← Lint, type-check, test, migration, tenant test
│
├── deploy/
│   ├── gen-dev-keys.sh                             ← Generate local RSA keypair for JWT
│   ├── CLOUDFLARE.md                               ← DNS + SSL + R2 + WAF setup
│   └── SUPABASE.md                                 ← Postgres + Storage + Realtime setup
│
├── render.yaml                                    ← Render blueprint (API + Background Worker)
├── vercel.json                                     ← Vercel config for the frontend SPA
│
└── docs/
    └── deployment-runbook.pdf                      ← Full step-by-step guide
```

## How to apply

1. Clone your repo locally:
   ```bash
   git clone https://github.com/theExceptionalSam/oo.git schoolsync
   cd schoolsync
   ```

2. Copy each file from this pack into the matching path. Example:
   ```bash
   cp /path/to/schoolsync-prod-pack/migrations/1780000000000-AddRlsPolicies.ts _ae/src/database/migrations/
   cp /path/to/schoolsync-prod-pack/src/config/jwt.config.ts _ae/src/config/
   cp /path/to/schoolsync-prod-pack/src/common/middleware/rls-context.middleware.ts _ae/src/common/middleware/
   # ... and so on for every file
   ```

3. Update `_ae/package.json` — add new deps, remove old ones:
   ```jsonc
   // ADD:
   "@aws-sdk/client-s3": "^3.620.0",
   "@aws-sdk/s3-request-presigner": "^3.620.0",
   "@supabase/supabase-js": "^2.45.0",
   "graphile-worker": "^0.16.0",

   // REMOVE (after migrating):
   "bullmq": "^5.12.0",
   "@nestjs/elasticsearch": "...",
   // Keep ioredis only if ScopeService still uses it.

   // ADD scripts:
   "bootstrap:admin": "ts-node src/database/seeds/bootstrap-admin.ts",
   "worker": "node dist/workers.js"
   ```

4. Generate local JWT keys:
   ```bash
   cd _ae && bash ../deploy/gen-dev-keys.sh ./keys
   ```

5. Update `.env` with your real Supabase/R2/Upstash credentials.

6. Run migrations:
   ```bash
   npm run migration:run
   ```

7. Bootstrap the admin (NOT the seed anymore):
   ```bash
   npm run bootstrap:admin -- --email=admin@yourschool.edu --subdomain=your-school --generate-password
   ```

8. Read `docs/deployment-runbook.pdf` for the full deploy sequence (Vercel → Supabase → Render → Cloudflare).

## What this pack solves

- ✅ **Multi-tenant isolation**: RLS at the database level, not just app-layer guard
- ✅ **JWT hardening**: RS256 only, no HS256 fallback, key ID for rotation
- ✅ **Search**: Postgres tsvector + GIN (drops Elasticsearch entirely)
- ✅ **Queue**: Graphile Worker on Postgres (drops Redis + BullMQ)
- ✅ **Realtime**: Supabase Realtime (drops Socket.io server + adapter)
- ✅ **Storage**: Real S3/R2 SDK (drops MinIO)
- ✅ **Audit**: Per-request interceptor writing to append-only `audit_logs`
- ✅ **Bootstrap admin**: One-time script, no hardcoded creds
- ✅ **CI/CD**: GitHub Actions pipeline with test + migration + tenant test gates
- ✅ **Deploy configs**: `render.yaml`, `vercel.json`, Cloudflare + Supabase guides

## After applying — the architecture you'll have

```
                    ┌──────────────┐
                    │  Cloudflare  │  DNS • CDN • WAF • R2 storage
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       app.yourdomain.com         api.yourdomain.com
              │                         │
    ┌─────────▼─────────┐         ┌──────▼───────┐
    │      Vercel      │         │    Render    │
    │  React/Vite SPA  │         │  NestJS API  │  ← stateless
    │      (free)      │         │   (Standard) │
    └──────────────────┘         └──────┬───────┘
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                       ┌──────▼─────────┐    ┌──────▼───────┐
                       │   Supabase     │    │   Render     │
                       │   (Postgres)   │    │  Worker      │
                       │  • RLS         │    │  (Graphile)  │
                       │  • PITR        │    │   ($25/mo)   │
                       │  • Realtime    │    └──────────────┘
                       │  • Storage    │
                       │  ($25/mo)     │
                       └────────────────┘
```

Five components. Four stateless. One source of truth (Postgres).

Total monthly cost: ~$75/month for a properly production-shaped stack.
