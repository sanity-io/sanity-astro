# The Official Sanity integration for Astro

This integration enables the [Sanity Client][sanity-client] in your [Astro][astro] project and lets you embed Sanity Studio on a route. Astro is an all-in-one web framework that supports a range of UI languages and can be deployed in most places.

- [Installation](#installation)
  - [Manual installation of dependencies](#manual-installation-of-dependencies)
  - [Types for `sanity:client` and `sanity:studio`](#types-for-sanityclient-and-sanitystudio)
- [Usage](#usage)
  - [Setting up the Sanity client](#setting-up-the-sanity-client)
  - [Loading Sanity documents into content collections](#loading-sanity-documents-into-content-collections)
  - [Loading Sanity documents into content collections](#loading-sanity-documents-into-content-collections)
  - [Embedding Sanity Studio on a route](#embedding-sanity-studio-on-a-route)
- [Rendering rich text and block content with Portable Text](#rendering-rich-text-and-block-content-with-portable-text)
- [Presenting images](#presenting-images)
  - [Resources](#resources)
- [Enabling Visual Editing](#enabling-visual-editing)
- [Examples](#examples)

## Installation

In your Astro project, run the following command to install the Sanity integration:

```bash
npx astro add @sanity/astro @astrojs/react
```

Note: `@astrojs/react` is only needed if you plan to embed a Sanity Studio in your project.

### Manual installation of dependencies

```bash
npm install @astrojs/react @sanity/astro @sanity/client sanity @types/react-dom @types/react-is @types/react react-dom react-is react styled-components
```

### Types for `sanity:client` and `sanity:studio`

This integration leverages [Vite.js' virtual modules][vite-virtual-modules] with Astro's naming convention (e.g. `astro:assets`). On Astro 4.14 and later the integration registers the module declarations for you through [`injectTypes`][inject-types]. They land in `.astro/integrations/_sanity_astro/types.d.ts` after `astro dev`, `astro build` or `astro sync`, and no further setup is needed.

On older Astro versions, add this line to the `env.d.ts` file in the `src` folder of your project:

```dts
/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />
```

You might have to restart the TS Server running in your code editor to get it to resolve types after updating this file. The easiest way to do this is to restart the application.

## Usage

### Setting up the Sanity client

Configure the integration in your `astro.config.mjs` file. The configuration options and methods are the same as for [@sanity/client](https://github.com/sanity-io/client#readme):

```typescript
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '<YOUR-PROJECT-ID>',
      dataset: '<YOUR-DATASET-NAME>',
      // Set useCdn to false if you're building statically.
      useCdn: false,
      // Optional: log server-side Sanity client requests.
      // Modes: 'dev' | 'build' | 'always'
      logClientRequests: 'dev',
    }),
  ],
})
```

This enables the use of `sanityClient` in your template files. For example:

```mdx
---
// /blog/index.astro
import { sanityClient } from "sanity:client";

const posts = await sanityClient.fetch(`*[_type == "post" && defined(slug)] | order(publishedAt desc)`);
---

<h1>Blog</h1>
<ul>
  {posts.map((post) => (
    <li>
      <a href={'/posts/' + post.slug.current} class="post-link">
        {post.title}
      </a>
    </li>
  ))}
</ul>
```

[Check out this guide][guide] for a more elaborate introduction to how to integrate content from Sanity into Astro. You can also look in the `apps` folder in this repository for complete implementation examples.

To log server-side requests made with `sanity:client`, set `logClientRequests` in your integration config:

- `logClientRequests: 'dev'` logs during development
- `logClientRequests: 'build'` logs during static builds
- `logClientRequests: 'always'` logs during both development and builds

If omitted, request logging is disabled.

### Loading Sanity documents into content collections

On Astro 5 and later, `sanityLoader` feeds a GROQ query into the [Content Layer][content-layer], so `getCollection()` and `getEntry()` work the same way for Sanity documents as for local Markdown. Pass the client from `sanity:client` so the loader reuses your integration config:

```typescript
// src/content.config.ts
import {sanityLoader} from '@sanity/astro/loader'
import {defineCollection} from 'astro:content'
import {z} from 'astro/zod'
import {sanityClient} from 'sanity:client'

const movies = defineCollection({
  loader: sanityLoader({
    client: sanityClient,
    query: `*[_type == "movie" && defined(slug.current)]{_id, title, "slug": slug.current, releaseDate}`,
    // Entry ids default to `_id`. Use the slug when pages are addressed by it.
    id: (movie) => movie.slug as string,
  }),
  schema: z.object({
    _id: z.string(),
    title: z.string(),
    slug: z.string(),
    releaseDate: z.string().optional(),
  }),
})

export const collections = {movies}
```

```astro
---
// src/pages/movies/[slug].astro
import {getCollection} from 'astro:content'

export async function getStaticPaths() {
  const movies = await getCollection('movies')
  return movies.map((movie) => ({params: {slug: movie.id}, props: {movie}}))
}

const {movie} = Astro.props
---

<h1>{movie.data.title}</h1>
```

Every load fetches the whole query result, clears the collection and writes each document back with a content digest, so edits and deletions in Sanity show up on the next build or dev-server restart. The `apps/cinema` example in this repository uses the loader for its movie and people pages.

### Embedding Sanity Studio on a route

Sanity Studio is a customizable content workspace where you can edit your content. It‘s a Single Page Application that you can keep in its own repository, together with your Astro project as a monorepo, or embedded in your website.

To initialize a Studio in a dedicated folder, you can run `npm create sanity@latest` and follow the instructions.

This integration lets you embed a Sanity Studio on a route in your Astro project. To enable it:

1. Create a new file in your project root called `sanity.config.ts` (or `.js`)
2. Add the following code, and add your `projectId` and `dataset` to it:

```typescript
// sanity.config.ts
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

export default defineConfig({
  name: 'project-name',
  title: 'Project Name',
  projectId: '<YOUR-PROJECT-ID>',
  dataset: '<YOUR-DATASET-NAME>',
  plugins: [structureTool()],
  schema: {
    types: [/* your content types here*/],
  },
})
```

You can use this configuration file to install plugins, add a schema with document types, add customizations etc. Note that the Studio will be using Astro‘s development server which is built on top of [Vite][vite].

1. Add the following to your `astro.config.mjs`:
   - `studioBasePath: '/admin'`: The route/path for where you want to access your studio
   - Import the [React integration for Astro][astro-react], and add it to the `integrations` array.

```javascript
// astro.config.mjs
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [
    sanity({
      projectId: '3do82whm',
      dataset: 'next',
      // Set useCdn to false if you're building statically.
      useCdn: false,
      // Access the Studio on your.url/admin
      studioBasePath: '/admin',
    }),
    react(),
  ],
})
```

2. You have to [enable CORS origins for authenticated requests][cors] for the domains you're running your website project on. The Studio should automatically detect and let you add this when you access the Studio on a new URL. Typically you need to add your local development server URL and your production URL to the CORS origin settings. It's important that you only enable CORS for authenticated requests on domains that _you_ control.

### Workspaces in embedded Studio

Sanity workspaces are supported by exporting an array from `defineConfig` (see [Studio Workspaces][studio-workspaces]).

When Studio is embedded through `@sanity/astro`, the integration owns workspace `basePath` values so all workspaces stay mounted under your configured `studioBasePath` route:

- In browser-history mode (`studioRouterHistory` omitted or `'browser'`), workspaces are mounted as:
  - single workspace: `/<studioBasePath>` (for example `/admin`)
  - multiple workspaces: `/<studioBasePath>/<workspace-name>` for every workspace
- In hash-history mode (`studioRouterHistory: 'hash'`), workspaces are mounted inside the hash router:
  - single workspace: `#/`
  - multiple workspaces: `#/<workspace-name>` for every workspace
- If `studioRouterHistory` is omitted, the integration defaults to hash history for Astro `output: 'static'`, and browser history for server output.

If you are also using Visual Editing stega, set `stega.studioUrl` to your Studio route path (for example `'/admin'`) and avoid appending a manual hash suffix.

## Rendering rich text and block content with Portable Text

Sanity uses an open specification for rich text and block content called [Portable Text][portabletext]. Portable Text stores content from the editor as JSON (and not HTML or Markdown). This makes it platform/framework agnostic, and also queryable (for example, you can query for blog posts that have more than 4 TypeScript code blocks).

While it's possible to loop over the JSON structure manually, we recommend using a Portable Text library to do the heavy lifting. It will automatically render the default editor configuration to HTML. If you do customizations like adding custom block types, then you need to map those to a component in your front end.

We recommend using [astro-portabletext][astro-portabletext] to render your PortableText fields in Astro. See an example of this in [apps/example/src/components/PortableText.astro](../../blob/main/apps/example/src/components/PortableText.astro), including using custom components to render custom blocks and annotations.

```mdx
---
import {PortableText as PortableTextInternal} from "astro-portabletext"
import CallToActionBox from "./CallToActionBox.astro";
import Code from "./Code.astro";
import SanityImage from "./SanityImage.astro";
import YouTube from "./YouTube.astro";
import InternalLink from "./InternalLink.astro";

const components = {
  type: {
    callToActionBox: CallToActionBox,
    code: Code,
    image: SanityImage,
    youtube: YouTube,
  },
  mark: {
    internalLink: InternalLink
  }
};

---

<PortableTextInternal value={Astro.props.value} components={components} />
```

## Presenting images

Sanity comes with [a native asset pipeline for your images and files][image-urls]. It has on-demand transforms, automatic optimization for browsers that supports webp, and serves images from a global CDN network. When you upload images to Sanity, it will also automatically analyze the image and add [a metadata document][image-document] with information like dimensions, color palette, generate blurhash, and LQIP strings.

We recommend using [@sanity/image-url](https://www.sanity.io/docs/image-url) to help you generate URLs for presenting Sanity images in your Astro app. See an example of this in [apps/example/src/components/SanityImage.astro](https://github.com/sanity-io/sanity-astro/blob/main/apps/example/src/components/SanityImage.astro)

You can also use community-contributed integrations like [astro-sanity-picture][astro-sanity-picture] to integrate images from Sanity into your website.

## Enabling Visual Editing

To enable [Visual Editing][visual-editing], you need to:

1. [Enable Overlays using the `VisualEditing` component](#1-enable-overlays-using-the-visualediting-component)
2. [Add the Presentation tool to the Studio](#2-add-the-presentation-tool-to-the-studio)
3. [Enable Stega](#3-enable-stega)

**Please note that Visual Editing only works for [server-side rendered](https://docs.astro.build/en/guides/server-side-rendering/) pages.** This means you probably want to configure your Astro project something like this:

```js
import vercel from '@astrojs/vercel'

// astro.config.mjs
export default defineConfig({
  integrations: [
    sanity({
      useCdn: true,
      // ...
    }),
    // ...
  ],
  output: 'server',
  adapter: vercel(),
})
```

### 1. Enable [Overlays][overlays] using the `VisualEditing` component

Add `VisualEditing` from `@sanity/astro/visual-editing` in your ["page shell" layout](https://docs.astro.build/en/basics/layouts/):

```ts
---
import {VisualEditing} from '@sanity/astro/visual-editing'

export type props = {
  title: string
}
const {title} = Astro.props
const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED == 'true'
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width" />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
  </head>
  <body>
    <slot />
    <VisualEditing enabled={visualEditingEnabled} zIndex={1000} />
    <!--                                          ^optional -->
  </body>
</html>
```

`VisualEditing` renders the Overlays from a plain `<script>`. It does not need the [React integration for Astro][astro-react] or any React component in your project, so a site built only from `.astro` files gets Visual Editing by adding this one component. See [`apps/minimal`](https://github.com/sanity-io/sanity-astro/tree/main/apps/minimal) for a React-free setup.

`VisualEditing` takes these props:

- `enabled`: so you can control whether or not visual editing is enabled depending on your environment.
- `zIndex` (optional): allows you to change the `z-index` of overlay elements.
- `keepStegaOnCopy` (optional): by default, Visual Editing strips stega from the clipboard on copy. Pass `keepStegaOnCopy` to opt out and leave stega in copied text.
- `refresh` (optional): `'morph'` (default) or `'reload'`. See [How the preview refreshes](#how-the-preview-refreshes).

In the example above, `enabled` is controlled using an [environment variable](https://docs.astro.build/en/guides/environment-variables/):

```sh
// .env.local
PUBLIC_SANITY_VISUAL_EDITING_ENABLED="true"
```

#### How the preview refreshes

Edits reach the page in two steps, neither of which reloads it.

1. **Instant text.** Presentation streams document changes to the overlays. `VisualEditing` listens to that stream and rewrites the stega-encoded text nodes rendered from the changed document as soon as the change arrives, before any request to your server. A node is rewritten only when your page was seen rendering that field verbatim and the node still shows a value the field held before. Text your page transformed (truncated, formatted, upper-cased) and text built from several fields are left to the server render.
2. **In-place morph.** Half a second after the last change, `VisualEditing` fetches the current URL and patches the live DOM with [idiomorph](https://github.com/bigskysoftware/idiomorph) so it matches the fresh server HTML. Everything the text patch cannot express (ordering, images, dates, references, conditionally rendered markup) updates here. Scroll position, focus, form state and the Presentation connection survive because the document never navigates. If the server has not caught up with the change yet, the fetch retries briefly, and a settle pass runs one second later.

The morph keeps what the server render cannot describe. Client-injected roots stay (the overlay host, Astro's dev toolbar, Vite's error overlay), as do head resources (`<style>`, `<script>` other than JSON-LD, stylesheet and preload `<link>`s) and `<html>`/`<body>` attributes. Head metadata (`<title>`, `<meta>`, canonical links, JSON-LD) is reconciled, since the server owns it. Hydrated `<astro-island>` elements keep their client-rendered subtree and receive the new `props` attribute, which Astro re-hydrates from. Form controls the visitor has typed in or toggled keep their value. Mark any other element whose client state must survive (a chat widget, a cookie banner, a media player) with Astro's `transition:persist` attribute.

When the fetch fails, the response is not HTML, or the fresh HTML introduces a `<script>` the page does not have yet, `VisualEditing` falls back to a full reload and restores the scroll position afterwards. The script case exists because a script parsed from a fetched document can be inserted but never executed, so only a reload gives it the behaviour the server intended. Pass `refresh="reload"` to always reload instead:

```astro
<VisualEditing enabled={visualEditingEnabled} refresh="reload" />
```

Visual Editing needs fresh HTML per request, so run the site with `astro dev` or an SSR adapter while previewing.

Two limits are worth knowing. Values rendered from a release perspective are not patched instantly, because the overlays stream the draft and published forms of a document but not its version form; those update through the morph. And the overlay chunk is emitted into your build output whether or not `enabled` is true, exactly as the previous React island was; a page with Visual Editing off never fetches it.

#### Custom refresh and history handling (deprecated)

If you need a custom `refresh` or `history` function, the React component from `@sanity/astro/visual-editing/component` still accepts them. It wraps the same runtime as the `.astro` component and needs the [React integration for Astro][astro-react]. It is deprecated and will be removed in the next major release; open an issue if the `.astro` component's `refresh` prop does not cover your case.

```tsx
// src/components/VisualEditing.tsx
import {VisualEditingComponent} from '@sanity/astro/visual-editing/component'

export default function VisualEditing() {
  return (
    <VisualEditingComponent
      refresh={(payload) => {
        // Return a promise so the overlay shows a loading state until it resolves.
        return new Promise((resolve) => {
          // ...your custom refresh here, then:
          resolve()
        })
      }}
      onSuspiciousStega={(reports) => {
        for (const report of reports) {
          console.warn(`Stega found in ${report.kind}`, report)
        }
      }}
    />
  )
}
```

```astro
---
// src/layouts/Layout.astro
import VisualEditing from '../components/VisualEditing'
const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
---

<body>
  <slot />
  {visualEditingEnabled && <VisualEditing client:only="react" />}
</body>
```

The `payload` tells you why the refresh fired: `payload.source` is `'manual'` when the editor clicks refresh in Presentation, or `'mutation'` when a document changes. The same subpath also accepts `history` if you need to take over URL syncing, and `onSuspiciousStega` for opt-in reporting when stega appears in unsafe placements (`class`, `href`, `<head>`, scripts, and similar).

### 2. Add the Presentation tool to the Studio

Follow the instructions on [how to configure the Presentation tool][presentation-tool].

### 3. Enable [Stega][stega]

If you already run Studio on an Astro route, then you can set the `stega.studioUrl` to the same relative path:

```js
export default defineConfig({
  integrations: [
    sanity({
      studioBasePath: '/admin',
      stega: {
        studioUrl: '/admin',
      },
    }),
  ],
})
```

Now, all you need is a `loadQuery` helper function akin to this one:

```ts
// load-query.ts
import {type QueryParams} from 'sanity'
import {sanityClient} from 'sanity:client'

const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
const token = import.meta.env.SANITY_API_READ_TOKEN

export async function loadQuery<QueryResponse>({
  query,
  params,
}: {
  query: string
  params?: QueryParams
}) {
  if (visualEditingEnabled && !token) {
    throw new Error(
      'The `SANITY_API_READ_TOKEN` environment variable is required during Visual Editing.',
    )
  }

  const perspective = visualEditingEnabled ? 'drafts' : 'published'

  const {result, resultSourceMap} = await sanityClient.fetch<QueryResponse>(query, params ?? {}, {
    filterResponse: false,
    perspective,
    resultSourceMap: visualEditingEnabled ? 'withKeyArraySelector' : false,
    stega: visualEditingEnabled,
    ...(visualEditingEnabled ? {token} : {}),
    useCdn: !visualEditingEnabled,
  })

  return {
    data: result,
    sourceMap: resultSourceMap,
    perspective,
  }
}
```

You'll notice that we rely on a "read token" which is required in order to enable stega encoding and for authentication when Sanity Studio is live previewing your application.

1. Go to https://sanity.io/manage and select your project.
2. Click on the 🔌 API tab.
3. Click on + Add API token.
4. Name it "SANITY_API_READ_TOKEN" and set Permissions to Viewer and hit Save.
5. Copy the token and add it to your `.env.local` file: `SANITY_API_READ_TOKEN="<paste your token here>"`

Now, you can query and interact with stega-enabled data using the visual editing overlays:

```ts
// some.astro file
import {loadQuery} from '../load-query'

const {data: movies} = await loadQuery<Array<{title: string}>>({
  query: `*[_type == 'movie']`,
})
```

## Examples

The `apps` folder holds runnable examples. Each one is a standalone Astro project that reads published content from a hosted Sanity dataset, so they run without an API token unless noted.

| App                                                                                              | Shows                                                                                                                                                            | Run from the repo root    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [`apps/minimal`](https://github.com/sanity-io/sanity-astro/tree/main/apps/minimal)               | The smallest setup: one page fetching with `sanity:client`, no React, no Studio. Visual Editing without React when `PUBLIC_SANITY_VISUAL_EDITING_ENABLED` is set | `pnpm dev:minimal`        |
| [`apps/cinema`](https://github.com/sanity-io/sanity-astro/tree/main/apps/cinema)                 | Astro 7, content collections through `sanityLoader`, Tailwind CSS 4, embedded Studio on static output                                                            | `pnpm dev:cinema`         |
| [`apps/example`](https://github.com/sanity-io/sanity-astro/tree/main/apps/example)               | Blog with Portable Text, images and an embedded Studio, on Astro 5                                                                                               | `pnpm dev:example`        |
| [`apps/example-latest`](https://github.com/sanity-io/sanity-astro/tree/main/apps/example-latest) | The same blog on the newest Astro and Sanity releases                                                                                                            | `pnpm dev:example-latest` |
| [`apps/example-ssr`](https://github.com/sanity-io/sanity-astro/tree/main/apps/example-ssr)       | The blog rendered on the server with the Vercel adapter                                                                                                          | `pnpm dev:example-ssr`    |
| [`apps/movies`](https://github.com/sanity-io/sanity-astro/tree/main/apps/movies)                 | Server rendering, Visual Editing and the Presentation tool. Needs `SANITY_API_READ_TOKEN`; see the app README                                                    | `pnpm dev:movies`         |

### Resources

- [The official Astro + Sanity guide][guide]
- [Sanity documentation][docs]
- [Portable Text integration for Astro][astro-portabletext]
- [Astro Sanity Picture][astro-sanity-picture]
- [Egghead's Introduction to GROQ][groq-intro]

[astro]: https://astro.build
[astro-react]: https://docs.astro.build/en/guides/integrations-guide/react/
[guide]: https://www.sanity.io/guides/sanity-astro-blog
[docs]: https://www.sanity.io/docs
[astro-portabletext]: https://github.com/theisel/astro-portabletext
[cors]: https://www.sanity.io/docs/cors
[vite]: https://vitejs.dev
[portabletext]: https://portabletext.org
[image-document]: https://www.sanity.io/docs/image-metadata
[astro-sanity-picture]: https://github.com/otterdev-io/astro-sanity-picture
[groq-intro]: https://egghead.io/courses/introduction-to-groq-query-language-6e9c6fc0
[sanity-client]: https://www.sanity.io/docs/js-client
[image-urls]: https://www.sanity.io/docs/image-urls
[vite-virtual-modules]: https://vitejs.dev/guide/api-plugin.html#virtual-modules-convention
[inject-types]: https://docs.astro.build/en/reference/integrations-reference/#injecttypes-option
[content-layer]: https://docs.astro.build/en/guides/content-collections/
[visual-editing]: https://www.sanity.io/docs/introduction-to-visual-editing
[presentation-tool]: https://www.sanity.io/docs/configuring-the-presentation-tool
[overlays]: https://www.sanity.io/docs/visual-editing-overlays
[stega]: https://www.sanity.io/docs/stega
[studio-workspaces]: https://www.sanity.io/docs/studio/workspaces
