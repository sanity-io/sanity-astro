# AGENTS.md

## Cursor Cloud specific instructions

This repo is the official **Sanity + Astro** integration ([`@sanity/astro`](./packages/sanity-astro)) — a pnpm + Turborepo monorepo containing the library plus six example Astro apps under `apps/`. There is **no local database**; content is served from **hosted Sanity Cloud**, so the dev servers need outbound network access to Sanity's API/CDN to render content.

### Services

| App (`--filter`) | Dev command               | Port | Notes                                                                                                               |
| ---------------- | ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `example`        | `pnpm dev:example`        | 4322 | Static blog demo. Reads **published** content from Sanity Cloud, **no token required**. Best token-free smoke test. |
| `example-ssr`    | `pnpm dev:example-ssr`    | 4323 | SSR variant (Vercel adapter).                                                                                       |
| `example-latest` | `pnpm dev:example-latest` | 4324 | Same demo on newer Astro/Sanity.                                                                                    |
| `movies`         | `pnpm dev:movies`         | 4321 | Movies + Visual Editing demo.                                                                                       |
| `cinema`         | `pnpm dev:cinema`         | 4325 | Astro 7 + Tailwind 4 + content collections via `sanityLoader`, movies dataset, **no token required**.               |
| `minimal`        | `pnpm dev:minimal`        | 4326 | Smallest setup: one page, `sanity:client` only, no React, no Studio, **no token required**.                         |

Every app except `minimal` also mounts an **embedded Sanity Studio at `/admin`** (e.g. `http://localhost:4322/admin`).

### Non-obvious gotchas

- **Build the library before/with dev.** Apps depend on `@sanity/astro` via `workspace:^` and consume its `dist/`. The root `dev:*` scripts already run `pnpm --filter @sanity/astro build` first, so always start apps via those root scripts (not `astro dev` directly). If you change library source in `packages/sanity-astro`, rebuild it (`pnpm --filter @sanity/astro build`, or `pnpm --filter @sanity/astro dev` for watch mode) for apps to pick up changes.
- **`movies` requires a secret.** Its dev script sets `PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true`, which forces Draft Mode and throws `The SANITY_API_READ_TOKEN environment variable is required in Draft Mode` (HTTP 500) unless a token is provided. For a token-free demo use `example` instead. The token must be a **viewer** (or higher) token for the project the app targets — the committed config points at Sanity's public `movies` demo project (`4j2qnyob`), so the token must belong to a Sanity account with access to that project. See **Providing the `movies` token** below for how to wire it in. To demo against a project you own instead, temporarily change `projectId`/`dataset` in `apps/movies/astro.config.mjs` and seed a `movie` document (fields `title` + `slug`; the homepage queries `*[_type == 'movie']`).
- **Tokens are project-scoped.** A Sanity API token only works against its own project host; used against a different project's host the Query API returns HTTP 401 `Session does not match project host`. So a token for one projectId cannot authenticate requests for another.
- **The token must live in a `.env` file, not just the process env.** `load-query.ts` reads `import.meta.env.SANITY_API_READ_TOKEN`, and Astro/Vite only expose _non-`PUBLIC_`_ vars to `import.meta.env` when they come from a `.env` file. A token exported into the shell / injected as a process env var is NOT picked up — put it in `apps/movies/.env`.
- **Quality gates run through turbo.** `pnpm check` runs `format:check` (oxfmt), then `lint` (oxlint), `typecheck` (`tsc --noEmit` for the library, `astro check` for apps that define it), `test` (vitest with coverage thresholds), `check:package` (`publint --strict` + `attw --pack`) and `build`. CI runs the same tasks. `pnpm format` writes formatting fixes.
- **Keep the library's `sanity` and `react` devDependencies on the same major as the apps.** `@sanity/astro` is a workspace link, so `dist/studio/studio-component.tsx` resolves `sanity` from `packages/sanity-astro/node_modules`. `vitePluginSanityModuleDedupe` only aliases in `astro dev` (`apply: 'serve'`); in a production build a version skew bundles two copies and the embedded Studio hydrates blank with `Duplicate instances of context ... Expected 6.x but got 5.x`. Published installs are unaffected because the peer resolves to the consumer's copy.
- **Coverage thresholds are enforced.** `packages/sanity-astro/vitest.config.ts` fails `pnpm test` when statements/branches/functions/lines drop below the configured floor. Raise the floor when you add tests; do not lower it to make a run pass.
- **The library builds with tsdown** (`tsdown.config.js`, ESM only, `dist/index.mjs` + `dist/loader.mjs` + `dist/*.d.mts`). `src/studio` and `src/visual-editing` are copied into `dist/` as source because the consuming Astro project compiles the `.astro`/`.tsx` files itself. The `tsdown` CLI is invoked with `--config-loader native` because the optional `unrun` peer is not installed.
- **Unit tests:** `pnpm --filter @sanity/astro test` (vitest, jsdom for the React component tests). **Integration tests** (`pnpm test:integration`, which builds `dist/` first) run `astro build` on `apps/example` and Playwright dev-server checks that require Chromium: `pnpm --filter @sanity/astro exec playwright install chromium --with-deps`. They need network access to Sanity's CDN.
- **Node/pnpm:** `@sanity/astro` requires Node `>=20.19.0 || >=22.12.0`; `packageManager` is pinned to `pnpm@9.15.9`.
- For embedded Studio login to work against a Sanity project, the dev origin (e.g. `http://localhost:4322`) must be allow-listed in that project's CORS settings.

### Providing the `movies` token

The `movies` app's Draft Mode token is supplied as a **dedicated Cursor secret** named `SANITY_MOVIES_API_READ_TOKEN` (kept separate from `SANITY_API_READ_TOKEN`, which is scoped to the `example*` apps' project `3do82whm`). Set it to a **Viewer** API token for project `4j2qnyob` (mint at `https://www.sanity.io/manage/project/4j2qnyob/api`).

Because Astro/Vite only reads non-`PUBLIC_` vars from a `.env` file (not the process env), the injected secret must be copied into `apps/movies/.env` (gitignored) under the name the app actually reads (`SANITY_API_READ_TOKEN`). Run this once per VM (the value comes from the injected secret):

```bash
printf 'PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true\nSANITY_API_READ_TOKEN=%s\n' "$SANITY_MOVIES_API_READ_TOKEN" > apps/movies/.env
```

To make this automatic on every boot, add the same guarded command to the environment's update/setup script:

```bash
[ -n "$SANITY_MOVIES_API_READ_TOKEN" ] && printf 'PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true\nSANITY_API_READ_TOKEN=%s\n' "$SANITY_MOVIES_API_READ_TOKEN" > apps/movies/.env
```
