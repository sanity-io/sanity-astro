# The Official Sanity integration for Astro

This integration enables the [Sanity Client][sanity-client] in your [Astro][astro] project and lets you embed Sanity Studio on a route. Astro is an all-in-one web framework that supports a range of UI languages and can be deployed in most places.

- [Installation](#installation)
  - [Manual installation of dependencies](#manual-installation-of-dependencies)
  - [Adding types for `sanity:client`](#adding-types-for-sanityclient)
- [Usage](#usage)
  - [Setting up the Sanity client](#setting-up-the-sanity-client)
  - [Embedding Sanity Studio on a route](#embedding-sanity-studio-on-a-route)
- [Rendering rich text and block content with Portable Text](#rendering-rich-text-and-block-content-with-portable-text)
- [Presenting images](#presenting-images)
  - [Resources](#resources)
- [Enabling Visual Editing](#enabling-visual-editing)

## Installation

In your Astro project, run the following command to install the Sanity integration:

```bash
npx astro add @sanity/astro @astrojs/react
```

Note: `@astrojs/react` is only needed if you plan to embed a Sanity Studio in your project.

### Manual installation of dependencies

```bash
npm install @astrojs/react @sanity/astro @sanity/client @sanity/visual-editing sanity @types/react-dom @types/react react-dom react
```

### Adding types for `sanity:client`

This integration leverages [Vite.js' virtual modules][vite-virtual-modules] with Astro's naming convention (e.g. `astro:assets`). Since it's not possible to automatically include module declarations from npm packages, you'll have to add the following line to the `env.d.ts` file that usually resides in the `src` folder of an Astro project:

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

[Check out this guide][guide] for a more elaborate introduction to how to integrate content from Sanity into Astro. You can also look in the `examples` folder in this repository for complete implementation examples.

### Embedding Sanity Studio on a route

Sanity Studio is a customizable content workspace where you can edit your content. It‘s a Single Page Application that you can keep in its own repository, together with your Astro project as a monorepo, or embedded in your website.

To initialize a Studio in a dedicated folder, you can run `npm create sanity@latest` and follow the instructions.

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
    types: [
      /* your content types here*/
    ],
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

## Rendering rich text and block content with Portable Text

Sanity uses an open specification for rich text and block content called [Portable Text][portabletext]. Portable Text stores content from the editor as JSON (and not HTML or Markdown). This makes it platform/framework agnostic, and also queryable (for example, you can query for blog posts that have more than 4 TypeScript code blocks).

While it's possible to loop over the JSON structure manually, we recommend using a Portable Text library to do the heavy lifting. It will automatically render the default editor configuration to HTML. If you do customizations like adding custom block types, then you need to map those to a component in your front end.

We recommend using [astro-portabletext][astro-portabletext] to render your PortableText fields in Astro. See an example of this in [apps/example/src/components/PortableText.astro](../../apps/example/src/components/PortableText.astro), including using custom components to render custom blocks and annotations.

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
import vercel from '@astrojs/vercel/serverless'

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
const visualEditingEnabled = import.meta.env.SANITY_VISUAL_EDITING_ENABLED == 'true'
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

`VisualEditing` is needed to render Overlays. It's a React component under the hood, so you'll need the [React integration for Astro][astro-react] if you don't already use that at this point.

`VisualEditing` takes two props:

- `enabled`: so you can control whether or not visual editing is enabled depending on your environment.
- `zIndex` (optional): allows you to change the `z-index` of overlay elements.

In the example above, `enabled` is controlled using an [environment variable](https://docs.astro.build/en/guides/environment-variables/):

```sh
// .env.local
SANITY_VISUAL_EDITING_ENABLED="true"
```

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

const visualEditingEnabled = import.meta.env.SANITY_VISUAL_EDITING_ENABLED === 'true'
const token = import.meta.env.SANITY_API_READ_TOKEN

export async function loadQuery<QueryResponse>({
  query,
  params,
}: {
  query: string
  params?: QueryParams
}) {
  if (visualEditingEnabled && !token) {
    throw new Error('The `SANITY_API_READ_TOKEN` environment variable is required during Visual Editing.')
  }

  const perspective = visualEditingEnabled ? 'previewDrafts' : 'published'

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
[visual-editing]: https://www.sanity.io/docs/introduction-to-visual-editing
[presentation-tool]: https://www.sanity.io/docs/configuring-the-presentation-tool
[overlays]: https://www.sanity.io/docs/visual-editing-overlays
[stega]: https://www.sanity.io/docs/stega
