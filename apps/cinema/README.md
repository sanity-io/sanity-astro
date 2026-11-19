# Cinema

A static film programme built on Astro 7 and `@sanity/astro`. It shows the current way to use Sanity with Astro:

- Content collections load from Sanity through `sanityLoader` in `src/content.config.ts`. Pages use `getCollection()` and `getStaticPaths()` from `astro:content`, and Zod parses every document at build time.
- `sanity:client` and `sanity:studio` are typed through `/// <reference types="@sanity/astro/module" />` in `src/env.d.ts`.
- Sanity Studio is embedded at `/admin`. The output is static, so the integration picks the hash router on its own.
- Images use `<SanityImage>` from `@sanity/astro/image` with the `sanityImageService()` image service: the CDN crops each `srcset` candidate around the hotspot, and `width` and `height` are fixed.
- Portable Text renders with `astro-portabletext`.
- Styling is Tailwind CSS 4 through `@tailwindcss/vite`, with design tokens in `src/styles/global.css`.

## Run it

From the repository root:

```sh
pnpm dev:cinema
```

The site is on `http://localhost:4327` and the Studio on `http://localhost:4327/admin`.

Other scripts in `apps/cinema`: `pnpm build`, `pnpm preview`, and `pnpm check` (`astro check`).

## Content

The app reads the public movies demo dataset (project `4j2qnyob`, dataset `production`) from Sanity's CDN. It needs no API token. To edit content in the embedded Studio you need access to that project and the dev origin in its CORS allow list, so for your own content change `projectId` and `dataset` in `astro.config.mjs` and `sanity.config.ts`.

`schemaTypes/` holds the movies schema so the Studio can open the same documents the site renders.
