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

## Visual Editing without a client framework

Set `PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true` and the page renders `VisualEditing` from `@sanity/astro/visual-editing`, fetches with stega, and connects to the Presentation tool of the Studio at `PUBLIC_SANITY_STUDIO_URL` (default `http://localhost:3333`). Nothing else changes: no `@astrojs/react`, no React component in `src/`. The overlays still render with React inside `@sanity/visual-editing`; this app just never imports it.

```sh
PUBLIC_SANITY_VISUAL_EDITING_ENABLED=true pnpm dev
```

Without a token the page previews published content. Put a viewer token in `apps/minimal/.env` as `SANITY_API_READ_TOKEN` to preview drafts. `PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET` point the app at another project, which is how the repository's live-preview harness runs it against a sandbox dataset.

Edits in the Studio reach the page in two steps: stega text nodes update the moment the change arrives, and half a second later the page fetches its own URL and morphs the DOM in place, so scroll, focus and the Presentation connection survive. Astro renders pages on demand under `astro dev`; a production deployment needs an SSR adapter for the same behaviour.

## Dependencies

- `astro` and `@sanity/astro`.
- `@sanity/client`, because the `sanity:client` virtual module imports it from your project, so it has to be a direct dependency.
- `@astrojs/check` and `typescript` for `astro check`.

The Studio peers of `@sanity/astro` (`sanity`, `react`, `react-dom`, `react-is`, `styled-components`) are not listed here. They are only needed when `studioBasePath` is set. `@sanity/visual-editing` renders its overlays with React internally and declares it as a peer dependency; pnpm and npm install that peer automatically, and the app itself never imports React.

The types for `sanity:client` come from the integration itself, so there is no `src/env.d.ts` in this app.
