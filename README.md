# KOWR Water Assistant

Monorepo prototypu wspierającego ocenę sytuacji wodnej działek rolnych. Projekt składa się
z aplikacji React/Vite, API Fastify oraz bazy PostgreSQL z rozszerzeniem PostGIS.

## Wymagania

- Node.js 22+
- pnpm 10+
- Docker z Docker Compose

## Pierwsze uruchomienie

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

Po uruchomieniu:

- aplikacja: http://localhost:5173
- API: http://localhost:3000
- dokumentacja OpenAPI: http://localhost:3000/docs
- health check: http://localhost:3000/api/health

Frontend zawiera obecnie wyłącznie techniczny punkt montowania aplikacji. Widoki produktu
zostaną dodane po ustaleniu pierwszego przepływu użytkownika.

## Struktura

```text
apps/api               Fastify, integracje i dostęp do PostGIS
apps/web               React, Vite i interfejs użytkownika
packages/contracts     współdzielone kontrakty Zod
packages/analysis      czyste, deterministyczne obliczenia domenowe
packages/typescript-config  wspólna konfiguracja TypeScript
infra/migrations       migracje PostgreSQL/PostGIS
```

## Polecenia

```bash
pnpm dev          # frontend i backend w trybie watch
pnpm check        # lint, typy, testy i build
pnpm db:up        # uruchom PostGIS
pnpm db:migrate   # wykonaj migracje
pnpm db:down      # zatrzymaj usługi Dockera
```

## Zasady architektury

- Sekrety dostawców danych pozostają wyłącznie w API.
- Schematy wejścia i odpowiedzi są współdzielone przez `@kowr/contracts`.
- Obliczenia domenowe trafiają do `@kowr/analysis` i nie wykonują operacji sieciowych.
- Każde zewnętrzne źródło danych otrzyma osobny adapter w `apps/api/src/integrations`.
- Brak pojedynczego źródła nie powinien unieważniać całego raportu; wynik może mieć status
  `partial` i jawnie wymieniać ograniczenia.

## Następny krok

Pierwszym pionowym wycinkiem będzie wyszukanie działki przez identyfikator w ULDK, zapisanie
jej geometrii w `parcel_cache` oraz wyświetlenie granicy na mapie.
