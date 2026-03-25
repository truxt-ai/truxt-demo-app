# Truxt Demo App

A sample microservice demonstrating engineering intelligence via Truxt Axiom.

## Quick Start

**Prerequisites**: Node.js >= 20, Docker

```bash
git clone https://github.com/truxt-ai/truxt-demo-app
cd truxt-demo-app
./scripts/setup-dev.sh    # installs deps, starts Postgres/Redis, runs migrations
npm run dev
```

Visit http://localhost:3000/health to verify.

## Manual Setup

```bash
cp .env.example .env        # fill in required vars
docker compose -f docker-compose.dev.yml up -d
npm install
for f in migrations/*.sql; do psql $DATABASE_URL -f "$f"; done
npm run dev
```

## Architecture

| Layer | Tech |
|-------|------|
| API Gateway | Express.js with JWT + API key auth |
| User Service | CRUD, search, profiles, RBAC |
| Analytics Service | Event tracking, dashboards |
| Team Service | Multi-tenant with roles and invites |
| Notification Service | In-app, email, Slack |
| Metrics Service | Time-series aggregation, dashboards |
| Webhook Service | HMAC-signed outgoing webhooks |
| Workers | Email, Slack, digest, webhook delivery |

## Testing

```bash
npm test                   # unit tests
npm run test:integration   # integration tests (requires running DB)
```
