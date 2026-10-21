# Zenith Observatory — reference implementation

A fictional public observatory's marketing site, built as the **reference implementation of
advanced Sanity features on current Astro**. Together with its companion studio
([`apps/observatory-studio`](../observatory-studio)), it exists to answer one question precisely:

> What does a best-practices Sanity + Astro site require today, and how much of it should
> `@sanity/astro` absorb?

Everything here is deliberately hand-rolled: the app does **not** depend on `@sanity/astro`. Each
subsystem below is the "before" picture for future integration work, and the
[boilerplate inventory](#boilerplate-inventory) maps every piece to what the integration already
covers versus what it lacks.

## Quick start

```sh
pnpm install
pnpm dev:observatory   # site on :4325, studio on :3333
```

The dataset is public: published content renders with **no token**. The content is already seeded;
to (re-)seed a dataset yourself, and for draft preview / Visual Editing, see
[Environment](#environment).

| App                  | Port | Purpose                                                  |
| -------------------- | ---- | -------------------------------------------------------- |
| `observatory`        | 4325 | The site (Astro 7, SSR, Vercel adapter)                  |
| `observatory-studio` | 3333 | Sanity Studio v6 with Presentation, Vision and the seeds |

## What it demonstrates

### Data layer: live collections with per-request context

Pages read content through Astro live content collections
([`src/live.config.ts`](src/live.config.ts) → [`src/sanity/loader.ts`](src/sanity/loader.ts) →
[`src/sanity/fetch.ts`](src/sanity/fetch.ts)). Every entry is loaded with a per-request filter
carrying the visitor's audience and the editor's preview state, and returns the query's **Content
Lake sync tags** alongside the data.

### Caching: event-driven, not TTL-driven

There is deliberately no data cache in front of Sanity: published reads come from Sanity's API CDN
(`cacheMode: 'noStale'`), and whole rendered pages are cached on the deployment CDN with the
queries' sync tags as surrogate keys (`Astro.cache.set` forwards the loaders' cache hints,
year-long TTL). Purging is event-driven: the `<sanity-live>` island
([`src/components/SanityLive.astro`](src/components/SanityLive.astro)) holds a tokenless Live
Content API EventSource, and when a relevant sync tag changes it POSTs the changed tags to
[`/api/invalidate-tags`](src/pages/api/invalidate-tags.ts) (which hard-deletes the tagged pages
from the CDN) and offers the visitor a refresh toast — a soft view-transition re-render, never an
unasked navigation. Middleware sets `Vary: Cookie` so each audience gets its own cache entry and
cookieless traffic shares one. CDN semantics only apply on a deployment; in local dev the flow
still works, minus the actual cache.

### Draft preview and Visual Editing

The studio's Presentation tool drives the site through
[`/api/preview/enable`](src/pages/api/preview/enable.ts) (validated with
`@sanity/preview-url-secret`), an HMAC-signed preview cookie, and per-editor perspective/variant
cookies ([`src/lib/preview.ts`](src/lib/preview.ts)). While previewing, fetches switch to the
selected perspective with stega encoding, responses are `private, no-store`, and
[`src/components/VisualEditing.astro`](src/components/VisualEditing.astro) runs
`@sanity/visual-editing-standalone` for click-to-edit overlays, wired into Astro's `ClientRouter`.

Two integration sharp edges live in that component and are exactly the kind of thing the
integration should own eventually:

- Astro's router replaces the `<body>` element on soft navigation, which orphans the overlay
  engine's `MutationObserver` (its only rescan path). A custom `astro:before-swap` swap reuses
  Astro's own `swapFunctions` but preserves body identity.
- Astro's head swap drops runtime CSS-in-JS `<style>` tags whose rules live only in CSSOM, which
  silently unstyles the overlays after the first refresh. The same swap persists them.

### Personalization: content variants (beta)

Audience personalization uses the Sanity **content variants beta**: an `audience` condition with
`families` / `stargazers` variants of the `homePage` document, resolved per request in
[`src/middleware.ts`](src/middleware.ts) (`?audience=` switch → cookie → `utm_source`) and passed
to `client.fetch(query, params, {variant: {audience}})` on `apiVersion: 'X'`. In Presentation, the
variant picker previews each audience via the variant cookie.

The beta is enabled per project. Until the target project has it, keep
`PUBLIC_SANITY_VARIANTS_ENABLED=false` (the default): personalization stays dormant, the site
serves base content, and `pnpm seed` skips variant seeding with a pointer. Once enabled, re-run
`pnpm seed:observatory` and set the flag (plus `SANITY_STUDIO_VARIANTS_ENABLED=true` for the
studio's variant picker) — no code changes.

### Images: the Sanity image CDN as the Astro image service

A custom `astro:assets` external service
([`src/sanity/imageService.ts`](src/sanity/imageService.ts)) answers every `<Image />` transform
straight from Sanity's image CDN — responsive srcsets, AVIF/WebP content negotiation, and the
editor's hotspot/crop honored via the URL builder ([`src/sanity/image.ts`](src/sanity/image.ts),
[`src/components/SanityImage.astro`](src/components/SanityImage.astro)). No platform optimizer or
sharp endpoint in between.

### Types: GROQ-driven TypeGen

Queries are `defineQuery` literals in [`src/sanity/queries.ts`](src/sanity/queries.ts);
`pnpm typegen:observatory` extracts the studio schema and generates
[`src/sanity/sanity.types.ts`](src/sanity/sanity.types.ts) (committed), so pages and components
consume fully typed results.

### Performance posture

Server-rendered pages with no framework runtime: client JS is three small islands (live toast,
exit-preview pill, audience toolbar) plus the router, and the Visual Editing runtime loads only in
draft preview. Fonts are self-hosted at build time via the Fonts API with metrics-matched
fallbacks, the stylesheet is inlined, SVGs are minified by the experimental `svgOptimizer`,
`prefetchAll` warms navigations on hover, and `robots.txt` / `sitemap.xml` / canonical / Open
Graph are wired throughout.

## Boilerplate inventory

What this app hand-rolls, against what `@sanity/astro` offers today. This table is the working
backlog for streamlining the integration.

| Concern                                           | Here (hand-rolled)                                        | `@sanity/astro` today                                       |
| ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Client configuration                              | `src/sanity/client.ts` + `astro:env` schema               | Covered: `sanity:client` module (no `astro:env` schema)     |
| Studio hosting                                    | Separate app on :3333                                     | Covered: embedded at a route                                |
| Visual Editing overlays                           | `VisualEditing.astro` + standalone runtime + router fixes | Partial: `VisualEditing` component, no `ClientRouter` fixes |
| Draft mode (signed cookie, enable/disable routes) | `src/lib/preview.ts` + 2 API routes                       | Missing                                                     |
| Perspective & variant switching from Presentation | 2 API routes + cookie plumbing                            | Missing                                                     |
| Live collections loader with sync-tag cache hints | `src/sanity/loader.ts` + `fetch.ts`                       | Missing (`loadQuery` is a documented app-level pattern)     |
| Live updates island + CDN tag purge endpoint      | `SanityLive.astro` + `/api/invalidate-tags`               | Missing                                                     |
| Image service (CDN-native `astro:assets`)         | `imageService.ts` + `image.ts` + `SanityImage.astro`      | Missing (docs point at `@sanity/image-url` manually)        |
| Personalization middleware (variants beta)        | `src/middleware.ts` + `src/lib/audience.ts`               | Missing                                                     |
| TypeGen wiring                                    | studio `typegen` script + committed types                 | Missing                                                     |

## Environment

Copy [`.env.example`](.env.example) to `.env`. Defaults point at the seeded demo project
(`gvy5piix`, dataset `production`, public), so the published site runs with an empty `.env`.

- `SANITY_API_READ_TOKEN` — Viewer-role token; only needed for draft preview / Visual Editing.
- `PUBLIC_SANITY_VARIANTS_ENABLED` — flip to `true` once the project has the variants beta.

To point at your own project: change the project id / dataset in `.env` (both apps), add CORS
origins for :4325 and :3333, then seed content with `pnpm seed:observatory` (needs
`SANITY_AUTH_TOKEN` with write access in the studio's `.env`; the script uploads deterministic
SVG-rendered artwork and publishes the documents idempotently — see
[`../observatory-studio/scripts`](../observatory-studio/scripts)).
