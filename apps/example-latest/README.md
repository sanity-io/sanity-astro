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
```

When using Sanity 6 in this monorepo, `astro.config.mjs` aliases the root `sanity` package to this app's dependency tree so the embedded Studio bundles against the same version as the frontend.
