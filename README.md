# HydroPlon

Hackathon prototype by **Iteracja7**, helping farmers assess water conditions on Polish cadastral
parcels and choose retention and agronomic actions backed by environmental data.

## Features

- Select a parcel on the map or by cadastral identifier; receive a crop suggestion from ARiMR declarations.
- Analyse a crop for a selected date or period, including the previous ten years.
- Explore water-balance scenarios, weather, satellite observations, soil profiles and 3D terrain.
- Get recommendations with evidence, source dates and explicit limitations.
- Print a simple or extended A4 report, or save it as PDF through the browser.

Data comes from GUGiK, ARiMR, SoilGrids, Open-Meteo/NASA POWER, Copernicus and OpenStreetMap.
Model results are estimates, not field measurements; missing data remains explicitly marked.

## Run locally

Requires **Node.js 22+**, **pnpm 10+** and **Docker Compose**. The PostGIS image uses `linux/amd64`;
Apple Silicon requires Docker's amd64 emulation.

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

- Application: http://localhost:5173
- API and OpenAPI documentation: http://localhost:3000/docs

For satellite statistics and imagery, set `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` in your local
`.env`, then restart the API. Without them, public observation dates remain available, but satellite
results are limited. Provider secrets stay in the API.

## Production deployment

The deployment at `https://hydroplon.aixir.pl` uses PostGIS in Docker, a PM2-managed API and host
Nginx. PostgreSQL listens on `127.0.0.1:5433`; the API listens on `127.0.0.1:3100`.
The host needs Docker Compose, PM2, Nginx and Certbot, an appropriate DNS A record, and public
ports 80 and 443.

```bash
cp .env.production.example .env.production
# Use the same password in POSTGRES_PASSWORD, DATABASE_URL and PM2_DATABASE_URL.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Compose starts the database and applies migrations. Place the built API and its dependencies in
`/opt/hydroplon/api`, migrations in `/opt/hydroplon/infra/migrations`, and the frontend build in
`/var/www/hydroplon`. Use the checked-in [PM2 configuration](deploy/ecosystem.config.cjs) and
[Nginx configuration](deploy/nginx.hydroplon.aixir.pl.conf). Supply the API's environment variables
from the untracked production configuration when starting PM2, then run `pm2 save`.

After enabling the Nginx configuration, issue the certificate and check the services:

```bash
certbot --nginx -d hydroplon.aixir.pl
docker compose --env-file .env.production -f docker-compose.production.yml ps
pm2 show hydroplon-api
curl --fail https://hydroplon.aixir.pl/api/health
```

Database data lives in a named volume. Back it up before deleting volumes; ordinary
`docker compose down` preserves them.

## Commands

```bash
pnpm dev          # Run frontend and API in watch mode
pnpm check        # Lint, typecheck, tests and production build
pnpm db:up        # Start PostGIS
pnpm db:migrate   # Apply database migrations
pnpm db:down      # Stop Docker services
pnpm crops:update # Refresh the ARiMR crop catalogue
```

## Repository

```text
apps/web             React, Vite, Tailwind CSS and shadcn/ui
apps/api             Fastify, external integrations and persistence
packages/contracts   Shared Zod HTTP contracts
packages/analysis    Deterministic domain calculations
infra/migrations     PostgreSQL/PostGIS migrations
```

## Documentation

- [Sample parcel report (PDF)](docs/examples/hydroplon-raport-prosty.pdf)
- [Product requirements and decisions](docs/product-requirements.md)
- [Analysis methodology and limitations](docs/water-situation-methodology.md)
- [Crop model coverage](docs/crop-catalog-review.md)
- [Architecture and contribution rules](AGENTS.md)
