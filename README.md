# Truxt Demo App

A sample microservice for demonstrating Truxt Axiom's engineering intelligence capabilities.

## Architecture

- **API Gateway** (`src/gateway/`) — Express.js request routing and auth middleware
- **User Service** (`src/services/user/`) — User management, profiles, permissions
- **Analytics Service** (`src/services/analytics/`) — Event tracking, dashboards, reporting
- **Shared** (`src/shared/`) — Common utilities, database clients, error handling

## Quick Start

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
npm run test:integration
```
