# Notes

This branch contains the visual-editing-standalone version of sanity-astro.

It should slot into an app just as the basis sanity-astro has, in Layout.astro.

It provides full compatibility with latest Sanity Studio and Astro modules. It also implements the latest missed-typing at pauses ability.

No strategy targeting is provided, thus no modification of VisualEditing component props in Layout.astro - it just works.

## Upgrades version

This is the first version. Small upgrades anticipated, but functionality is all here. In particular, Vite config may simplify.

## actual version on build
3.6.0-standalone.base

This will appear on the tgz path mentioned below, for local file import into app on same filesystem, as tested here.

The testing app is based on the sanity-astro-clean blog template, which needs no modification here except importing this build for sanity-astro.

Be sure in testing to hot-wire your loadQuery() to pull only drafts, as mentioned below, so that Visual Editing will show the edited data in the iframed web page. 

## building local tgx for local install

In sanity-astro/packages/sanity-astro

pnpm build && pnpm pack

## Loading local sanity-astro

In your app folder, 
npm install  ../../../sani/sanity-astro-cody/packages/sanity-astro/sanity-astro-3.6.0-standalone.base.tgz

## modified utils/sanity.ts

For this package as segmented for Sanity engineeering, the middleware isn't included to track Studio perspective in the app. 

Thus, hot-wire your app, likely in loadQuery, to request only the `drafts` perspective. 

That way, when you try Visual Editing in Studio, you'll be viewing the edited data in the iframed web page.

When combined with the perspective tracking upgrade separately offered, you'll make the slight loadQuery code changes so that tracking perspectives using Studio buttons becomes fully automatic.

# Design points for the implementation

This upgrade implements Sanity visual-editing-standalone, enabling full @sanity/astro compatibility with current Sanity Studio and related upgrades.

On this frame, it includes a well-worked out ability to avoid missing keystrokes, when typing has natural pauses humans make, such as before a comma, period, or other punctuation. 

There is a separate docs package for engineering analysis of the approaches taken.

The sections below are written by Gemini Argon High, mainly attentive to special care taken to working smoothly with edge deployments, as serverless vendors may offer.

### 1. Cross-Origin Edge Topologies & CHIPS Cookie Isolation

In edge deployments, the Studio and the preview site frequently live on separate origins (for example, a static Studio on `studio.example.com` framing a branch preview on `branch-xyz.pages.dev`).

- **Partitioned Cross-Site Cookies:** When running over HTTPS, `setCookiePerspective` sets `SameSite=None; Secure; Partitioned`. That `Partitioned` attribute (CHIPS) is essential when the Studio and edge preview sit on different root domains, preventing modern browsers from blocking the cookie inside the third-party iframe.
- **Host-Scoped Naming:** Naming the cookie `sanity-perspective-${window.location.host.replace(/[:.]/g, "-")}` prevents cookie collisions across multi-tenant edge preview subdomains that share a parent domain.
- **Clean Edge URLs (`stripUrlPerspectiveParams`):** Stripping `sanity-preview-perspective` and `perspective` from the query string via `history.replaceState` after capturing them into the cookie keeps the URL canonical. On edge networks where query parameters alter cache keys or routing rules, keeping state in the cookie header avoids fragmented cache entries.

### 2. Regional Edge Replication Latency & Cold-Start Protection

Edge SSR functions execute close to the user, which means an Astro edge worker can fire a GROQ query milliseconds after a reload is triggered—often before the Sanity Content Lake has finished committing and propagating the latest mutation to the edge's nearest API CDN/dataset replica.

- **Latency Floor & Adjustable Interval:** `onMutationRefresh` enforces `Math.max(300, assureTypingInterval - elapsed)` rather than reloading the instant Comlink signals a mutation, giving the Content Lake time to resolve the write before the edge worker re-fetches. Because `PUBLIC_SANITY_ASSURE_TYPING_INTERVAL` is configurable via environment variable, deployments facing higher cross-region latency can widen that window without touching code.
- **Invocation Coalescing:** Serverless platforms bill per invocation and throttle concurrent upstream connections. Coalescing rapid `mutation` events into a single trailing timer—and ignoring `welcome` and `reconnect` handshakes—prevents bursts of keystrokes or transient edge socket drops from triggering back-to-back SSR invocations.
- **In-Flight Reconciliation (`window.load`):** If an edge cold start stretches the HTTP response time of a reload while the editor keeps typing, the URL-scoped `sanity_sync_needed` flag catches those in-flight keystrokes once the new document finishes loading and schedules a single follow-up pass.

### 3. Zero V8 Isolate Overhead in `<VisualEditing/>`

Edge runtimes run inside constrained V8 isolates with strict bundle-size limits and no access to Node.js APIs at request time.

- **Pure HTML/Script Emission on the Server:** `visual-editing-standalone.astro` executes no server-side runtime dependencies, Node built-ins, or React SSR rendering—when `enabled` is true, the edge worker simply emits two `<script>` tags and a stylesheet link.
- **No Framework Hydration Tax:** Moving from a `client:only="react"` island to `@sanity/visual-editing-standalone` keeps React, `@sanity/ui`, and `styled-components` out of the page's SSR/edge execution path entirely.

### 4. Fail-Closed Credential Stripping in `sanity:client`

In `vite-plugin-sanity-client.ts`, the virtual module generator checks `loadOptions?.ssr === true` before serializing named client configurations. Any named client carrying a `token` or `headers` is replaced with a `serverOnlyClient` proxy in non-SSR builds, and the plugin fails closed if `loadOptions` is omitted. Meanwhile, the generated runtime code relies strictly on standard Web APIs (`performance.now()`, `Date`, `Proxy`, `Map`) rather than Node-specific modules, allowing `sanity:client` to execute identically inside Node containers and V8 edge isolates.   

### 5. In concert with perspective control

The separately offered implementation for visual editing perspective syncing adds a discussion of how it handles its own factors, when edge computing may be employed.