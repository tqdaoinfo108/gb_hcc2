# Deployment Guide

## Environment

Create `.env` at monorepo root:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/hcc_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-secure-value
API_PORT=3001
CMS_PORT=3002
KIOSK_PORT=3000
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
NEXT_PUBLIC_WS_URL=http://127.0.0.1:3001
```

## Install

```bash
npm install
npm run bootstrap
```

`bootstrap` checks database connectivity, runs Prisma migrations with `migrate deploy`, and generates Prisma Client.

## Development

```bash
npm run dev
```

Services:

- API: `http://127.0.0.1:3001`
- Swagger: `http://127.0.0.1:3001/docs`
- CMS: `http://127.0.0.1:3002`
- Kiosk web shell: `http://127.0.0.1:3000`

## Docker

```bash
docker compose up --build
```

Docker services:

- `api`
- `cms`
- `postgres`
- `redis`

For a remote PostgreSQL production database, point `DATABASE_URL` to the remote host and do not expose the local `postgres` service.

## Tauri Windows installer

Install Rust and platform prerequisites, then run:

```bash
npm run tauri:build
```

The kiosk bundle target is MSI. Tauri updater public key and update endpoint must be replaced with production signing values before release.
