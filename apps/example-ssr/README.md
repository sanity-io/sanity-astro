# Sanity + Astro example app

This example app is the same as the other example app in this repository, except with `output: 'server'` in the Astro configuration.

This example application renders the Sanity.io blog using Astro. It shows how to configure the Sanity + Astro integration in `astro.config.mjs`, querying and displaying Sanity content in `src/pages/index.astro` and `src/pages/posts/[slug].astro`, how to render PortableText in `src/components/PortableText.astro`, and how to present Sanity images in `src/components/SanityImage.astro`.
