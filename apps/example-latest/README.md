# Sanity + Astro example app (latest versions)

This example application is the same as the [`example`](../../example) app, but uses the latest versions of Astro and its related dependencies:

- Astro 7
- `@astrojs/react` 6
- `@astrojs/prism` 4
- Sanity 6
- `@sanity/client` 7
- `@sanity/image-url` 2

It renders the Sanity.io blog using Astro and shows how to configure the Sanity + Astro integration in `astro.config.mjs`, query and display Sanity content in `src/pages/index.astro` and `src/pages/posts/[slug].astro`, render Portable Text in `src/components/PortableText.astro`, and present Sanity images in `src/components/SanityImage.astro`.

Run it with:

```sh
pnpm dev:example-latest
pnpm build:example-latest
```

> **Note:** This app is excluded from the monorepo `pnpm build` CI task until [#406](https://github.com/sanity-io/sanity-astro/issues/406) lands. Sanity 6 + Astro 7 currently hit duplicate-module resolution errors in this workspace without the module-dedupe fix. Use `pnpm build:example-latest` to build locally.
