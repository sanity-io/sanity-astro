# Cinema

A static film programme built on Astro 7 and `@sanity/astro`. It shows the current way to use Sanity with Astro:

- Content collections load from Sanity through `sanityLoader` in `src/content.config.ts`. Pages use `getCollection()` and `getStaticPaths()` from `astro:content`, and Zod parses every document at build time.
- `sanity:client` is typed without a manual `/// <reference types="@sanity/astro/module" />`. The integration injects the types into `.astro/`.
- Sanity Studio is embedded at `/admin`. The output is static, so the integration picks the hash router on its own.
- Images use `@sanity/image-url` with `srcset`, hotspot cropping, and fixed `width` and `height` attributes in `src/components/SanityImage.astro`.
- Portable Text renders with `astro-portabletext`.
- Styling is Tailwind CSS 4 through `@tailwindcss/vite`, with design tokens in `src/styles/global.css`.

## Run it

From the repository root:

```sh
pnpm dev:cinema
```

The site is on `http://localhost:4325` and the Studio on `http://localhost:4325/admin`.

Other scripts in `apps/cinema`: `pnpm build`, `pnpm preview`, and `pnpm typecheck` (`astro check`).

## Content

The app reads the public movies demo dataset (project `4j2qnyob`, dataset `production`) from Sanity's CDN. It needs no API token. To edit content in the embedded Studio you need access to that project and the dev origin in its CORS allow list, so for your own content change `projectId` and `dataset` in `astro.config.mjs` and `sanity.config.ts`.

`schemaTypes/` holds the movies schema so the Studio can open the same documents the site renders.

## Note on `tsconfig.json`

`@sanity/astro` is a workspace link in this monorepo, so its type imports of `astro/loaders` resolve to the library's own Astro devDependency. The `paths` entry points them at this app's Astro instead, which is what a published install does on its own. Drop it when you copy the app out of the monorepo.
