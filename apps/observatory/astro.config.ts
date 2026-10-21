import vercel from '@astrojs/vercel'
import {cacheVercel} from '@astrojs/vercel/cache'
import tailwindcss from '@tailwindcss/vite'
import {defineConfig, envField, fontProviders, svgoOptimizer} from 'astro/config'

export default defineConfig({
  output: 'server',
  server: {port: 4325},
  // Pages opt into CDN caching with `Astro.cache.set` (tagged with Sanity
  // sync tags, purged by `/api/invalidate-tags`). Every edition that renders
  // differently has its own URL (see `src/lib/routing.ts`), so responses never
  // need `Vary`; middleware disables caching under `/preview`.
  cache: {provider: cacheVercel()},
  routeRules: {
    '/robots.txt': {maxAge: 3600, swr: 86400},
    '/sitemap.xml': {maxAge: 3600, swr: 86400},
  },
  // Skew protection would append a per-deployment param to every asset URL,
  // including the Sanity image CDN URLs below, re-keying their caches on each
  // deploy. This site has no cross-deployment sessions worth protecting.
  adapter: vercel({skewProtection: false}),
  image: {
    // `astro:assets` transforms are answered by Sanity's own image CDN,
    // resized, format-negotiated and edge-cached at the source, instead of
    // re-optimizing through the deployment platform or a sharp endpoint.
    service: {entrypoint: './src/sanity/imageService.ts'},
    domains: ['cdn.sanity.io'],
    // Every <Image /> gets a breakpoint srcset and sizes generated from its
    // rendered width, plus intrinsic-ratio styles, out of the box.
    layout: 'constrained',
    responsiveStyles: true,
  },
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4325',
  // Hovering any internal link warms the next navigation. The preview exit
  // link clears cookies on GET, so it opts out with
  // `data-astro-prefetch="false"`: a prefetch must never touch cookies.
  prefetch: {prefetchAll: true},
  fonts: [
    {
      // Downloaded at build time and self-hosted under `/_astro/fonts` with
      // immutable caching: one variable weight-range file, no third-party
      // origins at runtime, and a metrics-matched fallback against layout
      // shift.
      provider: fontProviders.google(),
      name: 'Space Grotesk',
      cssVariable: '--font-space-grotesk',
      weights: ['300 700'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Arial', 'sans-serif'],
    },
  ],
  experimental: {
    // Imported SVGs (the logo and highlight icons) are minified at build time.
    svgOptimizer: svgoOptimizer(),
  },
  build: {
    // The stylesheet is small; inlining it removes a render-blocking request
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      PUBLIC_SANITY_PROJECT_ID: envField.string({
        context: 'server',
        access: 'public',
        default: 'gvy5piix',
      }),
      PUBLIC_SANITY_DATASET: envField.string({
        context: 'server',
        access: 'public',
        default: 'production',
      }),
      PUBLIC_SANITY_STUDIO_URL: envField.string({
        context: 'server',
        access: 'public',
        default: 'http://localhost:3333',
      }),
      // Audience personalization runs on the content variants beta, which is
      // enabled per project. Off by default so the site works everywhere.
      PUBLIC_SANITY_VARIANTS_ENABLED: envField.boolean({
        context: 'server',
        access: 'public',
        default: false,
      }),
      // Only needed for draft preview (Presentation / Visual Editing). The
      // dataset is public, so published reads work without it.
      SANITY_API_READ_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Shared secret for `/api/invalidate-tags`. While unset the endpoint
      // returns 503 and deletes nothing. When set, purge requests must send
      // it as a bearer token.
      SANITY_INVALIDATE_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
    },
  },
})
