# Deployment

Generic prep notes for deploying to Heroku/Railway/Render — not tied to one platform. This
covers what needs to be true before a deploy, not how to click through any specific
provider's dashboard.

## Processes

Three independent processes need to run:

```
web:     cd backend && node src/index.js
research: cd product-research-agent && uvicorn main:app --host 0.0.0.0 --port $PORT
frontend: cd frontend/dashboard && npm run build   # then serve the build/ output statically
```

`node src/index.js` and `uvicorn` both read `$PORT` from the environment where the platform
sets it (Railway/Render/Heroku all do this) — the process should not hardcode 5000/8000 in
production; `backend/src/index.js` already reads `process.env.PORT`, and `main.py`'s
`settings.port` already reads from its own env-driven config.

## Environment variables

**Express backend** (`backend/.env.production` — template with placeholders, fill in real
values in the platform's env var UI, never commit real secrets):
- `JWT_SECRET` — real random 32+ byte value, different from dev
- `CORS_ORIGIN` — the deployed frontend's origin (comma-separated if more than one)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — once Stripe is actually configured (see
  `backend/src/routes/billing.js` — checkout stays in its "pending API keys" mode until
  these are real)
- `FRONTEND_URL` — used for Stripe Checkout success/cancel redirect URLs
- `NODE_ENV=production` — disables stack traces in error responses (see
  `backend/src/index.js`'s error-handling middleware)

**FastAPI research service** (`product-research-agent/config.py` settings, via its own
env vars): `ollama_host`, `cors_origins`, `shopify_store_url`/`shopify_api_token`/
`shopify_api_secret` (if Shopify sync is used), `ebay_client_id`/`ebay_client_secret` (if
eBay search is used), `database_url` (defaults to a local SQLite file — see the blocker
below).

## Known blocker: local SQLite files

Both backends use local SQLite files (`backend/dropship_ai.db`, `product-research-agent/products.db`).
Neither survives Heroku's ephemeral filesystem across dyno restarts/deploys. Railway and
Render can attach a persistent volume, which is required for either platform. Until a
persistent volume (or a migration to a hosted Postgres) is in place, do not deploy to
Heroku — data would silently disappear on the next deploy or dyno cycle.

## Backups

Run `npm run backup` (in `backend/`) to copy `dropship_ai.db` into a timestamped file under
`backend/backups/` (gitignored, not committed). Schedule this via cron or the platform's
scheduled-job feature before any deploy and on a regular interval:

```
0 */6 * * * cd /app/backend && npm run backup
```

There's no equivalent backup script yet for `product-research-agent/products.db` — copy it
the same way (`cp products.db backups/products-$(date +%Y%m%dT%H%M%S).db`) if needed.

## Security

- `helmet()` and per-route rate limiting on `/api/users/login` and `/api/users/register`
  are already wired into `backend/src/index.js`.
- Errors are logged to `backend/logs/app.log`/`error.log` (structured JSON, one line per
  event) and only return a stack trace to the client when `NODE_ENV !== 'production'`.
