# Contributing

This is a pnpm workspace. The library lives in `packages/sanity-astro`; the example apps live in `apps/`.

## Setup

```bash
pnpm install
pnpm --filter @sanity/astro build
```

Node `>=20.19.0 || >=22.12.0` and `pnpm@12.15.0` (see `packageManager` in `package.json`).

## Everyday commands

| Command                 | What it does                                                                |
| ----------------------- | --------------------------------------------------------------------------- |
| `pnpm format:check`     | Checks formatting with oxfmt                                                |
| `pnpm format`           | Formats the repo with oxfmt                                                 |
| `pnpm lint`             | Lints the workspace                                                         |
| `pnpm typecheck`        | `tsc --noEmit` for the library                                              |
| `pnpm check`            | `astro check` for observatory and `tsc --noEmit` for the observatory studio |
| `pnpm test`             | Vitest unit tests                                                           |
| `pnpm test:integration` | Playwright checks for the library; needs a built `dist/`                    |
| `pnpm dev:<app>`        | Builds the library and starts one app, for example `pnpm dev:example`       |

The integration tests need Chromium (`pnpm --filter @sanity/astro exec playwright install chromium --with-deps`) and network access to Sanity's CDN.

## Changing the library

- `pnpm --filter @sanity/astro dev` rebuilds `dist/` on every change so running apps pick it up.
- Every `exports` key in `packages/sanity-astro/package.json` is public API. Adding a key is a feature; removing or renaming one is a breaking change.
- Add or extend a test next to the file you change.

## Changesets

Releases of `@sanity/astro` are managed with [Changesets](https://github.com/changesets/changesets). If your PR changes what the package publishes, run `pnpm changeset add` and commit the generated file in `.changeset/`. The [Changesets section in AGENTS.md](./AGENTS.md#changesets) describes which changes need one and how releases are published.
