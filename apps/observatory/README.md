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

### Data layer: one fetch path with sync tags

Pages call [`sanityFetch`](src/sanity/fetch.ts) directly. Every fetch carries the request's edition
(public, audience or draft preview) and returns the query's **Content Lake sync tags** alongside the
data, which the page hands to `Astro.cache.set` together with the shared `PAGE_CACHE` lifetimes.

### Caching: editions in the URL, purged by sync tag

The deployment CDN keys its cache on the URL alone, so every rendering that differs has its own
path ([`src/lib/routing.ts`](src/lib/routing.ts), [`src/middleware.ts`](src/middleware.ts)):

| Edition          | Path                | Cached                                         |
| ---------------- | ------------------- | ---------------------------------------------- |
| Published site   | `/*`                | Yes, one entry shared by every visitor         |
| Audience edition | `/for/<audience>/*` | Yes, one entry per audience                    |
| Draft preview    | `/preview/*`        | Never: `cache.set(false)`, `private, no-store` |

Middleware rewrites the prefixed paths onto the same page routes, and links stay inside the current
edition. No cacheable response reads a cookie, so there is no `Vary` header to get wrong.

Published reads come from Sanity's API CDN (`cacheMode: 'noStale'`), and rendered pages are cached
with the queries' sync tags as cache tags. The `<sanity-live>` island
([`src/components/SanityLive.astro`](src/components/SanityLive.astro)) holds a tokenless Live
Content API EventSource and, when a relevant sync tag changes, offers the visitor a refresh toast (a
soft re-render, never an unasked navigation). It does not purge the CDN: a browser cannot hold the
secret.

[`/api/invalidate-tags`](src/pages/api/invalidate-tags.ts) hard-deletes the tagged pages from the CDN.
It accepts only `s1:` sync tags, so no caller can purge the whole site, and it fails closed. Set
`SANITY_INVALIDATE_SECRET` on the deployment; until that variable is set, the endpoint returns 503
and deletes nothing. With it set, a request must send `Authorization: Bearer <secret>` or it returns 401. Purging is the job of the sync tag invalidate Function described in
[Sanity Function](#sanity-function).
`PAGE_CACHE` (5 minutes fresh, a day stale-while-revalidate) bounds how long a missed purge can keep
stale content. CDN semantics only apply on a deployment; locally the flow still works, minus the
actual cache.

### Draft preview and Visual Editing

The studio's Presentation tool drives the site through
[`/api/preview/enable`](src/pages/api/preview/enable.ts) (validated with
`@sanity/preview-url-secret`), which sets an HMAC-signed preview cookie
([`src/lib/previewFlag.ts`](src/lib/previewFlag.ts)) and redirects into `/preview`. Each preview
cookie is written twice: a `Partitioned` copy for Presentation's iframe, and an unpartitioned copy
so a top-level visit to this origin can read the same session. Perspective and variant cookies
([`src/lib/preview.ts`](src/lib/preview.ts)) are resolved for `/preview/*` and for the picker
endpoints, which would otherwise 403; fetches under `/preview` switch to the selected perspective
with stega encoding.
[`src/components/VisualEditing.astro`](src/components/VisualEditing.astro) runs
`@sanity/visual-editing-standalone` for click-to-edit overlays and reloads the page when the editor
switches perspective or variant.

Preview pages render without Astro's `ClientRouter`. The router replaces `<body>` on soft
navigation, which orphans the overlay engine's `MutationObserver`, and drops the overlays'
runtime-injected styles from `<head>`. Full page loads avoid both. The trade-off is that the
Presentation URL bar does not follow navigation inside the preview; owning that router integration
is a job for `@sanity/astro`.

### Personalization: content variants (beta)

Audience personalization uses the Sanity **content variants beta**: an `audience` condition with
`families` / `stargazers` variants of the `homePage` document, served from the `/for/<audience>` edition
and passed to `client.fetch(query, params, {variant: {audience}})` on `apiVersion: 'X'`. Campaign
links with a known `utm_source` redirect into their edition, and the audience toolbar links between
editions. In Presentation, the variant picker previews each audience via the variant cookie.

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
exit-preview pill, audience toolbar) plus Astro's router outside preview, and the Visual Editing runtime loads only in
draft preview. Fonts are self-hosted at build time via the Fonts API with metrics-matched
fallbacks, the stylesheet is inlined, SVGs are minified by the experimental `svgOptimizer`,
`prefetchAll` warms navigations on hover, and `robots.txt` / `sitemap.xml` / canonical / Open
Graph are wired throughout.

## Boilerplate inventory

What this app hand-rolls, against what `@sanity/astro` offers today. This table is the working
backlog for streamlining the integration.

| Concern                                           | Here (hand-rolled)                                               | `@sanity/astro` today                                         |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Client configuration                              | `src/sanity/client.ts` + `astro:env` schema                      | Covered: `sanity:client` module (no `astro:env` schema)       |
| Studio hosting                                    | Separate app on :3333                                            | Covered: embedded at a route                                  |
| Visual Editing overlays                           | `VisualEditing.astro` + standalone runtime, no router in preview | Partial: `VisualEditing` component, no `ClientRouter` support |
| Draft mode (signed cookie, enable/disable routes) | `src/lib/preview.ts` + 2 API routes                              | Missing                                                       |
| Perspective & variant switching from Presentation | 2 API routes + cookie plumbing                                   | Missing                                                       |
| Fetch with sync-tag cache hints                   | `src/sanity/fetch.ts` + `Astro.cache.set` in pages               | Missing (`loadQuery` is a documented app-level pattern)       |
| Live updates island + CDN tag purge endpoint      | `SanityLive.astro` + `/api/invalidate-tags`                      | Missing                                                       |
| Image service (CDN-native `astro:assets`)         | `imageService.ts` + `image.ts` + `SanityImage.astro`             | Missing (docs point at `@sanity/image-url` manually)          |
| Edition routing and personalization (variants)    | `src/middleware.ts` + `src/lib/routing.ts` + `audience.ts`       | Missing                                                       |
| TypeGen wiring                                    | studio `typegen` script + committed types                        | Missing                                                       |

## Sanity Function

[`sanity.blueprint.ts`](../../sanity.blueprint.ts) at the repository root defines a
[sync tag invalidate Function](https://www.sanity.io/docs/functions) for the observatory's dataset,
following the same setup as
[`template-nextjs-personal-website`](https://github.com/sanity-io/template-nextjs-personal-website).
When published content changes, Sanity calls
[`apps/observatory-functions/invalidate-sync-tags`](../observatory-functions/invalidate-sync-tags/index.ts)
with the affected sync tags. The Function POSTs them to `/api/invalidate-tags` with the
`SANITY_INVALIDATE_SECRET` bearer token, then calls `done`, which releases the live event to every
`<sanity-live>` island subscribed with `waitFor=function`. A visitor's refresh therefore always
lands on a purged page. If the purge fails, the Function logs the error and still calls `done`, so
live updates keep flowing and `PAGE_CACHE` bounds how stale the page can be.

A dataset can have only one sync tag invalidate Function. To deploy it, run these commands from the
repository root:

```sh
# 1. The same secret on the site deployment and the Function
openssl rand -hex 32
vercel env add SANITY_INVALIDATE_SECRET

# 2. Once per checkout: log in and link a Blueprint stack in the observatory's project
pnpm dlx sanity@latest login
pnpm dlx sanity@latest blueprints init

# 3. Deploy the Function with the site's purge endpoint and the secret
INVALIDATE_URL=https://<domain>/api/invalidate-tags \
SANITY_INVALIDATE_SECRET=<secret> \
pnpm dlx sanity@latest blueprints deploy

# 4. Hold live events until the purge has happened, then redeploy the site
vercel env add PUBLIC_SANITY_LIVE_WAIT_FOR_FUNCTION   # value: true
```

The Function's environment is additive, so a later `blueprints deploy` without `INVALIDATE_URL`
or `SANITY_INVALIDATE_SECRET` keeps the deployed values. Tail its output with
`pnpm dlx sanity@latest functions logs invalidate-sync-tags`. To try it locally against the dev
server (started with `SANITY_INVALIDATE_SECRET` set), run:

```sh
INVALIDATE_URL=http://localhost:4325/api/invalidate-tags SANITY_INVALIDATE_SECRET=<secret> \
pnpm dlx sanity@latest functions test invalidate-sync-tags --data '{"syncTags":["s1:example"]}'
```

## Environment

Copy [`.env.example`](.env.example) to `.env`. Defaults point at the seeded demo project
(`gvy5piix`, dataset `production`, public), so the published site runs with an empty `.env`.

- `SANITY_API_READ_TOKEN` — Viewer-role token; only needed for draft preview / Visual Editing.
- `PUBLIC_SANITY_VARIANTS_ENABLED` — flip to `true` once the project has the variants beta.
- `SANITY_INVALIDATE_SECRET` — required before `/api/invalidate-tags` will purge. While it is unset
  the endpoint returns 503 and deletes nothing. Set the same value on the deployment and send it as
  `Authorization: Bearer <secret>` from the server-side caller that should purge (see
  [Caching](#caching-editions-in-the-url-purged-by-sync-tag)).
- `PUBLIC_SANITY_LIVE_WAIT_FOR_FUNCTION` — flip to `true` once the Function is deployed, so live
  events wait for the purge (see [Sanity Function](#sanity-function)).
- `INVALIDATE_URL` — only read by `sanity.blueprint.ts` when deploying the Function.

To point at your own project: change the project id / dataset in `.env` (both apps), add CORS
origins for :4325 and :3333, then seed content with `pnpm seed:observatory` (needs
`SANITY_AUTH_TOKEN` with write access in the studio's `.env`; the script uploads deterministic
SVG-rendered artwork and publishes the documents idempotently — see
[`../observatory-studio/scripts`](../observatory-studio/scripts)).
