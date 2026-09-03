# Contributing

This is a pnpm workspace. The library lives in `packages/sanity-astro`; the example apps live in `apps/`.

## Setup

```bash
pnpm install
pnpm --filter @sanity/astro build
```

Node `>=20.19.0 || >=22.12.0` and `pnpm@9.15.9` (see `packageManager` in `package.json`).

## Everyday commands

| Command                 | What it does                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | Runs every gate CI runs: format check, lint, typecheck, unit tests with coverage, package checks, build |
| `pnpm format`           | Formats the repo with oxfmt                                                                             |
| `pnpm lint`             | Lints with oxlint                                                                                       |
| `pnpm typecheck`        | `tsc --noEmit` for the library and `astro check` for the apps that define it                            |
| `pnpm test`             | Vitest unit tests; coverage thresholds in `packages/sanity-astro/vitest.config.ts` must hold            |
| `pnpm test:integration` | Builds the library, then runs `astro build` and Playwright dev-server checks against the apps           |
| `pnpm check:package`    | `publint --strict` and `attw --pack` on the library tarball                                             |
| `pnpm dev:<app>`        | Builds the library and starts one app, for example `pnpm dev:cinema`                                    |

The integration tests need Chromium (`pnpm --filter @sanity/astro exec playwright install chromium --with-deps`) and network access to Sanity's CDN.

## Changing the library

- `pnpm --filter @sanity/astro dev` rebuilds `dist/` on every change so running apps pick it up.
- Every `exports` key in `packages/sanity-astro/package.json` is public API. Adding a key is a feature; removing or renaming one is a breaking change.
- Add or extend a test next to the file you change. Raise the coverage floor when the numbers allow it.

## Commits and releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Release Please turns `feat` and `fix` commits on `main` into a release PR and publishes `@sanity/astro` to npm with provenance when that PR merges.
