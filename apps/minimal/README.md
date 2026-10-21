# Minimal

The smallest working Sanity + Astro setup: one integration entry in `astro.config.mjs` and one page that fetches with `sanityClient` from `sanity:client`. No Studio, no React, no CSS framework. Copy this folder to start a new project.

## Run it

From the repository root:

```sh
pnpm dev:minimal
```

The page is on `http://localhost:4326`. Other scripts in `apps/minimal`: `pnpm build`, `pnpm preview`, and `pnpm typecheck` (`astro check`).

## Content

The page lists movies from Sanity's public demo dataset (project `4j2qnyob`, dataset `production`) over the CDN. It needs no API token. Poster thumbnails come from the asset URL with `?w=120&h=180&fit=crop&auto=format` appended, so the app does not need `@sanity/image-url`.

## Dependencies

- `astro` and `@sanity/astro`.
- `@sanity/client`, because the `sanity:client` virtual module imports it from your project, so it has to be a direct dependency.
- `@astrojs/check` and `typescript` for `astro check`.

The Studio peers of `@sanity/astro` (`sanity`, `react`, `react-dom`, `react-is`, `styled-components`) are not installed. They are only needed when `studioBasePath` is set.

The types for `sanity:client` come from the integration itself, so there is no `src/env.d.ts` in this app.
