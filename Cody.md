# sanity-astro-cody

# Notes 
- this branch implements only middleware perspective syncing, on top of original 3.6.0 agent-written strategy, so it will work only with earlier versions of Studio, etc.
- another branch implements only our fully latest-compatible visual-editing-standalone comversion, keeping this perspective code separate.
- a current PR contaning both is on hold, to be updated with latest of these elements.

## Up-front notice
Because it uses the 3.6.0 codebase, for testing it's required to use the complex experimental strategy prop for VisualEditing in Layout.astro of the testing app.

Our standalone-based segmentation presented separately doesn't need any extra props like this, so it is a simple (P)npm install version drop-in for the legacy app code. When combined as intended with this upgrade, there's just the small tweak to loadQuery added, as detailed below. 

It's worth mentioning here that the way middleware is used internally is assured by Astro's implementation not to interfere whatsoever with any middleware that the app may want to add. That will simply run after what's internal here, as a stack, and what we do in ours is a closed box, thus shouldnt interfere with anyone.

## building local tgz for file-based local nstall

In sanity-astro/packages/sanity-astro

pnpm build && pnpm pack

## Loading local sanity-astro in your app (use own path)
npm install  ../../../sani/sanity-astro-cody/packages/sanity-astro/sanity-astro-3.6.0-perspective.track.tgz

## modified utils/sanity.ts

This is in the app used to test. A few extra lines, usually in utils/sanity.ts, hooks the dynamic perspective up with loadQuery(), so it delivers the right Sanity data when in the Studio iframe.

```diff
...

+ import { getActivePerspective } from "@sanity/astro/middleware";

...

export async function loadQuery<T>(
  query: string,
  params: QueryParams = {},
): Promise<T> {
  if (visualEditingEnabled && !token) {
    throw new Error(
      "The `SANITY_API_READ_TOKEN` environment variable is required during Visual Editing.",
    );
  }

 + // Evaluated per-request so SSR always reflects the current middleware state
 + const perspective = visualEditingEnabled
 +   ? "drafts" // getActivePerspective()
 +   : "published";


  const { result } = await sanityClient.fetch<T>(query, params, {
    filterResponse: false,
    perspective,
    useCdn: !visualEditingEnabled,
    resultSourceMap: visualEditingEnabled ? "withKeyArraySelector" : false,
    stega: visualEditingEnabled,
    ...(visualEditingEnabled ? { token } : {}),
  });

  return result;
}

...

```

# Design points to support edge deployments

This section is an analysis by Gemini Argon High on the code implementation for these perspective syncing additions.

It discusses rationale of code abilities, and gives some warnings at the end about certain platforms' edge computing features which might sound attractive (or are defaulted?), but will block the perspective tracking, as is explained.

Following the warnings should't affect noticeable performance, just assure Sanity visual editing always behaves.

## 1. Advantages of Middleware-Based Perspective Syncing for Edge Deployments

### Concurrency-Safe Isolate State (`AsyncLocalStorage`)

In traditional single-tenant servers, mutating a shared client instance is merely bad practice; in V8 edge isolates (such as Cloudflare `workerd`) and warm serverless containers, it is a data-leak vulnerability. Because a single isolate multiplexes multiple incoming HTTP requests concurrently across an event loop, mutating a module-scoped `sanityClient` configuration when an editor switches to `drafts` can cause a concurrent public visitor’s request in the same isolate to fetch unpublished drafts.

By wrapping `next()` inside `AsyncLocalStorage.run(perspective, () => next())`, `onRequest` binds the resolved perspective strictly to the asynchronous execution graph of that single HTTP request. Concurrent requests inside the same warm isolate never see each other's perspective state.

### Zero Context-Threading Across the Server Call Stack (`getActivePerspective`)

Astro exposes request state (`Astro.cookies`, `Astro.url`, `Astro.locals`) only inside `.astro` component frontmatter and API route handlers. Without `AsyncLocalStorage`, every page and layout would have to extract the perspective cookie and manually pass `perspective` down through every helper function, data loader, and shared query module.

Exporting `getActivePerspective()` allows `loadQuery` (or any deep server utility) to pull the active perspective directly out of the ambient asynchronous context without changing function signatures or coupling data-fetching modules to Astro's component context.

### First-Byte Perspective Alignment (No Double-Render Cold Starts)

When the Studio loads or switches perspectives (including stacked Content Releases such as `r1,drafts`), `onRequest` resolves the target perspective before page rendering starts—checking incoming query parameters (`sanity-preview-perspective` or `perspective`) first, then falling back to the host-isolated `sanity-perspective-<host>` cookie.

Because the client script in `visual-editing-standalone.astro` writes that cookie with `SameSite=None; Secure; Partitioned` (CHIPS) over HTTPS and strips the query parameters via `history.replaceState`, every subsequent edge SSR navigation or mutation reload arrives at `onRequest` with the exact perspective already in the `Cookie` header. The edge worker queries the Sanity Content Lake with the right perspective on the initial pass rather than rendering `published` first and requiring a client-triggered second reload.

### Edge CDN Cache-Poisoning Prevention

Edge platforms aggressively cache SSR responses at POPs when permitted by headers. By stamping visual-editing responses with `Cache-Control: private, no-cache, no-store, must-revalidate`, `onRequest` enforces two guarantees at the CDN layer:

1. **No Draft Leakage:** Edge caches will not store a `drafts` or release-perspective render and serve it to unauthenticated visitors requesting the same URL.
2. **Fresh Mutation Reads:** When `visual-editing-standalone.astro` fires a reload after `assureTypingInterval`, the edge POP is forced to execute the SSR worker and fetch fresh data from the Content Lake rather than returning a cached HTML snapshot from the previous keystroke.

## 2. Edge Features That Must Not Be Turned On (and Required Flags)

### Do NOT Enable `edgeMiddleware: true` on Hybrid Serverless Adapters (`@astrojs/vercel`, `@astrojs/netlify`)

This is the primary architectural trap to warn users against:

- **Why it breaks (The Split-Isolate Trap):** On Vercel and Netlify, Astro’s default SSR adapter runs both `onRequest` middleware and `.astro` page rendering inside the **same** Node.js Serverless Function container. Memory is contiguous, so `AsyncLocalStorage` entered in `onRequest` is directly readable by `getActivePerspective()` during page SSR.
- **What happens when `edgeMiddleware: true` is enabled:** The adapter compiles `src/middleware` into a standalone Edge Function (running in a separate V8/Deno isolate at the CDN edge) while leaving page SSR inside a downstream Node.js Serverless Function.
- **The Failure Mode:** `node:async_hooks` (`AsyncLocalStorage`) only propagates across asynchronous calls within the same JavaScript isolate—it cannot cross an HTTP network hop between an Edge Function and a downstream Node container. If `edgeMiddleware: true` is turned on, `onRequest` sets the perspective in the edge isolate, forwards the request over the network to the SSR function where the `AsyncLocalStorage` store is empty, and `getActivePerspective()` silently falls back to `"published"`.
- **Rule:** Keep `edgeMiddleware: false` (the default) on `@astrojs/vercel` and `@astrojs/netlify`.

### Cloudflare Workers / Pages (`@astrojs/cloudflare`): Enable `nodejs_compat`, Avoid Split Worker Routing

Cloudflare’s `workerd` runtime does **not** suffer from the Vercel/Netlify split-isolate trap because a single Cloudflare Worker invocation executes both Astro's `onRequest` middleware and the `.astro` SSR page render inside the **same V8 isolate**. However, two Cloudflare-specific rules apply:

- **Required Flag (`nodejs_compat`):** Because `middleware.ts` imports `AsyncLocalStorage` from `node:async_hooks`, Cloudflare projects **must** enable the `nodejs_compat` compatibility flag (or `nodejs_als`) in `wrangler.toml` / `wrangler.json` with a modern `compatibility_date`. Without `nodejs_compat`, `workerd` will fail to resolve `node:async_hooks`.
- **Do NOT Strip Cookies or Override Origin Cache-Control in Cloudflare Cache Rules:** If a site administrator configures a Cloudflare Cache Rule set to *Cache Everything* combined with *Ignore Origin Cache Control* or *Strip Cookies*, Cloudflare's edge proxy will either strip the `sanity-perspective-<host>` cookie before the Worker sees it or cache the draft HTML response in defiance of the middleware's `Cache-Control: private, no-cache, no-store, must-revalidate` header.