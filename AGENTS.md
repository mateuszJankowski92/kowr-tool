# AGENTS.md

## Purpose

This repository contains a hackathon prototype for the KOWR Water Assistant. The product
helps a farmer assess water conditions for a Polish cadastral parcel and obtain transparent,
data-backed retention and agronomic recommendations.

Work quickly, but preserve a sound foundation. Prefer the smallest complete implementation
that satisfies the current task. Do not trade correctness, data provenance, or honest handling
of uncertainty for a more impressive-looking result.

## Product constraints

- The primary user is a farmer without GIS, remote-sensing, or hydrology expertise.
- The application must support parcels located anywhere in Poland.
- A parcel can be selected by cadastral identifier or from a map.
- An analysis is specific to a crop and a requested date, including historical dates from the
  previous ten years.
- Results and recommendations must be calculated from source data. Do not substitute static,
  prewritten recommendations for an analysis.
- Reports must identify source data, data dates, causes, recommendations, uncertainty,
  limitations, and missing inputs.
- Missing or unavailable data must be communicated explicitly. Never invent precision or
  silently replace unavailable production data with fixtures.
- A report must be printable, downloadable, or persistable. The exact first implementation is
  decided by the task that introduces reporting.
- Avoid collecting personal data unless a future requirement makes it necessary.
- Optimize the prototype for a useful response within 30 seconds for one parcel, while keeping
  failure handling honest.

## Repository structure and dependency direction

The workspace uses pnpm and contains:

```text
apps/web                    React/Vite browser application
apps/api                    Fastify API and infrastructure
packages/contracts          Zod HTTP contracts and inferred transport types
packages/analysis           Pure, deterministic domain calculations
packages/typescript-config  Shared TypeScript configuration
infra/migrations            PostgreSQL/PostGIS migrations
```

Keep dependencies pointing in this direction:

```text
apps/web  -> packages/contracts
apps/api  -> packages/contracts + packages/analysis
packages/analysis -> no application or infrastructure packages
packages/contracts -> no application or infrastructure packages
```

- Applications must not import from one another.
- `packages/contracts` owns transport schemas, not domain behavior.
- `packages/analysis` owns domain models and calculations. It must not know about HTTP,
  Fastify, databases, environment variables, external providers, or React.
- Map explicitly between transport DTOs and domain values in the API. Do not make the domain
  depend on an HTTP contract merely to avoid a small mapping function.
- Expose a package's public API through its root `index.ts`. Do not deep-import package
  internals.
- Do not create local barrel files solely to shorten imports.

## Feature organization

Organize backend application behavior as vertical feature modules. Expected top-level areas
include `features/parcels`, `features/analysis`, and `features/reports`; provider-specific code
belongs under `integrations/<provider>`.

A feature may contain files such as:

```text
features/parcels/
  parcel.routes.ts
  find-parcel.ts
  parcel.repository.ts
  parcel.errors.ts
  find-parcel.test.ts
```

Create only the files and layers the feature currently needs. Do not introduce empty
abstractions or generic `utils`, `helpers`, `services`, or `common` modules without a concrete,
well-named responsibility.

The standard backend flow is:

```text
route and schema
  -> use case
  -> ports
  -> integrations and repositories
  -> domain analysis
  -> response mapping
```

- Keep route handlers thin: validate input, invoke a use case, and map its result.
- Do not put SQL, provider calls, cache policy, or domain calculations in route handlers.
- Use functions for use cases and domain behavior.
- Use classes only when a stateful infrastructure adapter clearly benefits from one.
- Define interfaces at meaningful boundaries, especially ports. Do not create an interface for
  every implementation.

## API and contracts

- Use REST endpoints under `/api`. Do not add `/v1` until backward-compatible versioning is a
  real requirement.
- Use plural resource names, for example `/api/parcels` and `/api/analyses`.
- Return the response DTO directly for successful requests; do not wrap it in `{ data: ... }`
  without a concrete need.
- Use one public error shape:

  ```ts
  {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  }
  ```

- Error `code` values are stable and machine-readable. Error messages are safe to display and
  must not expose stack traces, secrets, provider credentials, or internal payloads.
- Zod schemas in `packages/contracts` are the source of truth for HTTP payloads. Infer their
  TypeScript types with `z.infer`; do not duplicate the type manually.
- Validate both requests and responses.
- Reject unknown fields in application-owned request payloads.
- For third-party payloads, validate the subset the application needs and tolerate unrelated
  fields added by the provider.

Expected business failures must use explicit, typed error codes. Map them to HTTP responses in
one central boundary. Unexpected failures should be logged and returned as a generic `500`.
Failure of one independent data source should normally contribute to a partial analysis rather
than fail the entire analysis.

## Data conventions

- Represent calendar dates as `YYYY-MM-DD`.
- Represent timestamps as ISO 8601 in UTC.
- Pass the requested date or an injected clock into time-dependent behavior. Pure domain code
  must not call `new Date()` or `Date.now()` implicitly.
- Use metric units. Include the unit in a field name when it is not otherwise unambiguous, for
  example `precipitationMm`.
- Use GeoJSON and WGS84/EPSG:4326 at system boundaries.
- Coordinate order is always `[longitude, latitude]`.
- Preserve useful precision in domain calculations and round only for presentation.
- `null` means a known absence of a value. An optional property means that the property was not
  supplied or does not apply to that variant. Do not use the two forms interchangeably.

## Persistence and migrations

- Use Kysely for normal database access. Kysely is an approved future dependency.
- Raw SQL is allowed in migrations and for PostGIS operations that would be significantly less
  clear through a query builder.
- Keep SQL out of routes and domain code.
- Repositories own persistence operations, not business decisions. Cache freshness and the
  decision to fetch or reuse data belong to a use case or a dedicated cache policy.
- A migration may be amended while it is strictly local and unused by anyone else. Once shared
  in the repository, treat it as immutable and add a new sequentially numbered migration.
- Keep each migration focused on one logical schema change.
- Real-PostGIS integration tests are deferred. The default test suite must not require Docker.

## External integrations

- Give each external data provider its own adapter under `apps/api/src/integrations`.
- Keep credentials and provider secrets in the API only.
- Give every network request an explicit timeout.
- Propagate an `AbortSignal` when the higher-level operation supplies one.
- Retry only safe operations and only for transient failures. Keep retry counts bounded.
- Fetch independent sources concurrently when doing so improves latency without violating
  provider limits.
- Record the provider, retrieval time, relevant source-data date, and license or terms required
  for provenance.
- Do not silently fall back to fixture or fabricated data. Fixtures are allowed in tests and in
  an explicitly labeled development mode only.
- Do not log full provider payloads. Store a raw payload only when cache or audit requirements
  justify it.

The exact providers, analysis orchestration model, cache policy, and use of an LLM remain open
decisions. Do not establish them incidentally in an unrelated task. Domain results and decisions
must remain deterministic; a future LLM may at most help present an already computed result in
plain language unless explicitly agreed otherwise.

## Frontend architecture

Organize the web application as:

```text
app/             Routing, providers, and the application shell
features/        User workflows and feature-specific components
components/ui/   shadcn/ui primitives
api/             Shared HTTP client infrastructure
```

- Use TanStack Query (`@tanstack/react-query`) for all server state: fetching, caching,
  invalidation, mutations, and request status.
- Do not copy query results into local state.
- Put meaningful navigational state in the URL.
- Use React local state for ephemeral UI state.
- Do not add a global client-state store without a demonstrated need and explicit approval for
  any new dependency.
- The frontend consumes application DTOs from the API; it must not interpret raw provider
  payloads.
- Use shadcn/ui as the component foundation and Tailwind CSS for styling. Generated shadcn
  components may be adapted to the product.
- Use shared design tokens instead of arbitrary repeated colors and spacing values.
- Avoid inline styles unless a value is inherently dynamic and unsuitable for Tailwind.
- Do not wrap a shadcn primitive unless the wrapper adds behavior or enforces a meaningful,
  repeated product convention.
- Before a shadcn generator command adds packages, present the dependency list and obtain
  approval. Generating code that uses already-approved dependencies does not need separate
  approval.

Every asynchronous screen must deliberately handle idle/initial, loading, success, empty, and
error states. A partial analysis requires a distinct, visible explanation.

Accessibility is part of completion. Use semantic elements, associated form labels, keyboard
operation, visible focus styles, and accessible validation and error messages.

## TypeScript and naming conventions

- Use strict TypeScript and preserve the repository's existing compiler checks.
- Prefer `type`; use `interface` primarily for ports or genuinely extensible object contracts.
- Do not use TypeScript `enum`. Prefer literal unions, `as const`, or Zod enums as appropriate.
- Do not use `any`. Parse or narrow `unknown` at boundaries.
- Use named exports, not default exports.
- Use `import type` for type-only imports.
- Use `kebab-case.ts` for non-component files.
- Use `PascalCase.tsx` for React component files; the existing `App.tsx` follows this rule.
- Co-locate tests as `*.test.ts` or `*.test.tsx`.
- Code, identifiers, comments, UI copy, documentation, and commit messages are written in
  English.
- Comments should explain rationale, constraints, scientific assumptions, or non-obvious
  tradeoffs. Do not narrate what the code already states.
- Public functions do not require JSDoc unless their contract or reasoning is not evident from
  types and naming.

Follow the repository's Biome formatting: two-space indentation, double quotes, semicolons, and
a 100-character line width. Do not manually fight the formatter.

## Logging and configuration

- Access validated environment configuration through the API configuration module rather than
  reading `process.env` throughout the application.
- Never commit or modify a developer's `.env` file and never print secrets.
- Backend request and application logging uses the Fastify logger and structured fields.
- New application code must not use `console.*`. CLI and migration scripts may use concise
  console output when no application logger exists.
- Integration failure logs should include the provider name, duration, and a safe error code,
  but not secrets or full sensitive payloads.

## Testing

Test the most important behavior rather than implementation details.

- Add unit tests for significant domain rules and boundary conditions.
- Test Fastify routes with `Fastify.inject`.
- Test provider adapters against realistic saved fixtures at the adapter boundary.
- Mock ports and external boundaries, not internal private functions.
- Add a regression test for a bug fix when practical.
- Keep the default tests deterministic and independent of the network, Docker, and live
  provider availability.
- End-to-end browser tests, real-PostGIS integration tests, and a coverage threshold are out of
  scope for now.

## Change discipline

- Inspect the relevant implementation and nearby conventions before editing.
- Implement the smallest complete change that satisfies the task.
- Minimize changes outside the task. Do not perform opportunistic refactors; refactoring is a
  separate requested activity.
- Preserve user changes and unrelated work in a dirty worktree.
- Do not add, remove, or upgrade a dependency without explicit approval. Kysely, shadcn/ui, and
  the already-installed TanStack Query are approved choices, but additional packages pulled in
  by a generator still require approval.
- Use pnpm and workspace-aware commands. Do not introduce another package manager or lockfile.
- Update README or existing documentation when a code change makes it inaccurate. Do not create
  speculative documentation.
- Do not impose a Git branching or commit convention beyond writing commit messages in English.
- Do not change unresolved architectural decisions as a side effect of another task. Surface
  the decision to the user when it becomes necessary.

## Verification workflow

During implementation, run the narrowest useful checks for fast feedback. Before handing off a
substantial completed feature, run the full repository check when practical.

Useful commands include:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

At minimum:

1. Format or lint touched code.
2. Typecheck affected packages.
3. Run relevant tests.
4. Run `pnpm check` for substantial or cross-package changes.
5. Report any check that could not be run and explain why.

Do not start Docker or depend on a live database for ordinary verification unless the current
task explicitly requires it.

## Definition of done

A normal change is complete when:

- the requested behavior works through the relevant application boundary;
- important errors, loading states, and edge cases are handled;
- the most important behavior is covered by an appropriate test;
- no unapproved dependency was introduced;
- relevant lint, typecheck, test, and build checks pass;
- public behavior, configuration, and setup documentation remain accurate;
- limitations, partial results, and unverified assumptions are reported clearly.

