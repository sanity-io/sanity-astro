# AGENTS.md

## Cursor Cloud specific instructions

This repo is the official **Sanity + Astro** integration ([`@sanity/astro`](./packages/sanity-astro)) — a pnpm + Turborepo monorepo containing the library plus four example Astro apps under `apps/`. There is **no local database**; content is served from **hosted Sanity Cloud**, so the dev servers need outbound network access to Sanity's API/CDN to render content.

### Services

| App (`--filter`) | Dev command | Port | Notes |
|------------------|-------------|------|-------|
| `example` | `pnpm dev:example` | 4322 | Static blog demo. Reads **published** content from Sanity Cloud, **no token required**. Best token-free smoke test. |
| `example-ssr` | `pnpm dev:example-ssr` | 4323 | SSR variant (Vercel adapter). |
| `example-latest` | `pnpm dev:example-latest` | 4324 | Same demo on newer Astro/Sanity. |
| `movies` | `pnpm dev:movies` | 4321 | Movies + Visual Editing demo. |

Each app also mounts an **embedded Sanity Studio at `/admin`** (e.g. `http://localhost:4322/admin`).

### Non-obvious gotchas

- **Build the library before/with dev.** Apps depend on `@sanity/astro` via `workspace:^` and consume its `dist/`. The root `dev:*` scripts already run `pnpm --filter @sanity/astro build` first, so always start apps via those root scripts (not `astro dev` directly). If you change library source in `packages/sanity-astro`, rebuild it (`pnpm --filter @sanity/astro build`, or `pnpm --filter @sanity/astro dev` for watch mode) for apps to pick up changes.
- **`movies` requires a secret.** Its dev script sets `PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true`, which forces Draft Mode and throws `The SANITY_API_READ_TOKEN environment variable is required in Draft Mode` (HTTP 500) unless `SANITY_API_READ_TOKEN` is provided. For a token-free demo use `example` instead.
- **`pnpm lint` executes 0 tasks.** No workspace package defines a `lint` script, so `turbo run lint` reports "No tasks were executed" (this matches CI and is expected — not a failure). Running `eslint` directly currently fails because the shared `eslint-config-custom` pulls in `eslint-config-next`, whose parser needs `next` (not installed). The effective style gate is Prettier: `pnpm format` (write) or `npx prettier --check .`. Note some files in the repo are already not Prettier-clean on `main`.
- **Unit tests:** `pnpm --filter @sanity/astro test` (vitest). **Integration tests** (`pnpm --filter @sanity/astro test:integration`) use Playwright and require Chromium: `pnpm --filter @sanity/astro exec playwright install chromium --with-deps`, and a freshly built `dist/`.
- **Node/pnpm:** `@sanity/astro` requires Node `>=20.19.0 || >=22.12.0`; `packageManager` is pinned to `pnpm@9.15.9`.
- For embedded Studio login to work against a Sanity project, the dev origin (e.g. `http://localhost:4322`) must be allow-listed in that project's CORS settings.
