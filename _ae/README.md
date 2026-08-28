# SchoolSync Backend

A modular-monolith NestJS backend for a multi-tenant school-management platform.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# edit .env as needed
```

### 3. Run the stack locally (Postgres + Redis + MinIO + Elasticsearch)

```bash
docker-compose up -d postgres redis minio elasticsearch
```

### 4. Run migrations & seed

```bash
npm run migration:run
npm run seed
```

### 5. Start the API in dev mode

```bash
npm run start:dev
```

Swagger UI is available at <http://localhost:3000/docs>.

## Default Credentials (after seed)

- Email: `admin@demo-school.edu`
- Password: `Demo!Pass123`
- Role: `ADMIN`
- Subdomain: `demo-school`

## Project Layout

```
src/
├── main.ts                       # Application bootstrap (helmet, CORS, pipes, filters, swagger)
├── app.module.ts                 # Root module
├── config/                       # database / redis / jwt / env-validation configs
├── common/                       # decorators, filters, guards, interceptors, pipes, utils
│   └── dto/pagination.dto.ts
├── database/
│   ├── data-source.ts            # TypeORM CLI entrypoint
│   ├── migrations/1719840000000-Init.ts
│   └── seeds/run-seed.ts
├── modules/                      # Feature modules (one folder per bounded context)
│   ├── auth/                     # JWT RS256 login, register, refresh, me, logout
│   ├── users/                    # User CRUD + bulk import stub
│   ├── schools/                  # Multi-tenant school management
│   ├── academic-years/
│   ├── classes/                  # Class + class_subjects
│   ├── subjects/
│   ├── students/
│   ├── enrollments/
│   ├── attendance/               # bulk-mark + per-student reports
│   ├── exams/
│   ├── marks/                    # bulk-upload + report-card engine
│   ├── fees/                     # Fee structures
│   ├── payments/                 # Payments + financial reports
│   ├── announcements/
│   ├── messages/
│   └── notifications/            # BullMQ workers for async delivery
├── shared/
│   ├── events/                   # EventBus + canonical event names
│   ├── queue/                    # Shared BullMQ connection
│   ├── storage/                  # S3/MinIO abstraction
│   └── search/                   # Elasticsearch abstraction
└── bootstrap/                    # swagger.setup, validation.setup
```

## Architecture Highlights

- **Modular monolith** with clear service boundaries (one folder per bounded context, ready for future microservice extraction).
- **Multi-tenancy via `school_id` column** on every tenant-owned table, enforced by `SchoolContextGuard`.
- **JWT (RS256 in prod, HS256 dev fallback)** with short-lived access tokens and long-lived refresh tokens.
- **Global guards**: `JwtAuthGuard` runs on every route; opt out with `@Public()`. `RolesGuard` enforces RBAC.
- **Global interceptors**: `LoggingInterceptor` (correlation IDs) + `ResponseInterceptor` (standard envelope `{ success, data, meta }`).
- **Global filter**: `HttpExceptionFilter` normalises all errors into `{ success: false, error: { code, message, details }, meta: { timestamp, path, correlationId } }`.
- **Event-driven notifications**: feature services publish to a BullMQ-backed `EventBus`; `NotificationsProcessor` consumes and persists notifications.
- **Rate limiting**: sliding-window Redis limiter via `@RateLimit({ limit, windowSec })` + `RateLimitGuard`.

## API Conventions

- Base URL: `/api/v1`
- Auth: `Authorization: Bearer <accessToken>` (obtain from `POST /api/v1/auth/login`)
- Response envelope:
  ```json
  { "success": true, "data": { ... }, "meta": { ... } }
  ```
- Error envelope:
  ```json
  { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." }, "meta": { "timestamp": "...", "path": "..." } }
  ```

## Testing

```bash
npm test           # unit tests
npm run test:e2e   # end-to-end tests
npm run test:cov   # coverage report
```

## Docker

```bash
docker build -t schoolsync-backend .
docker run -p 3000:3000 --env-file .env schoolsync-backend
```

Or use the full stack:

```bash
docker-compose up -d
```

## Production Hardening Checklist

- [ ] Replace HS256 dev key with RS256 (set `JWT_PRIVATE_KEY_PATH` and `JWT_PUBLIC_KEY_PATH`)
- [ ] Enable PgBouncer in front of Postgres
- [ ] Provision a Redis Cluster (6 nodes) for HA
- [ ] Configure Stripe / Razorpay / PayPal keys
- [ ] Configure SendGrid + Twilio for email/SMS
- [ ] Deploy via Helm chart to Kubernetes (HPA: 3–20 replicas)
- [ ] Enable Prometheus + Grafana + Sentry monitoring
- [ ] Configure TLS termination at the Ingress (cert-manager)

## License

MIT
