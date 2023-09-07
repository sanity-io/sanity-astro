# The Official Sanity integration for Astro

This integration enables the [Sanity Client][sanity-client] in your [Astro][astro] project and lets you embed Sanity Studio on a route. Astro is an all-in-one web framework that supports a range of UI languages and can be deployed in most places.

- [Installation](#installation)
  - [Manual installation of dependencies](#manual-installation-of-dependencies)
- [Usage](#usage)
  - [Setting up the Sanity client](#setting-up-the-sanity-client)
  - [Embedding Sanity Studio on a route](#embedding-sanity-studio-on-a-route)
- [Rendering rich text and block content with Portable Text](#rendering-rich-text-and-block-content-with-portable-text)
- [Presenting images](#presenting-images)
  - [Resources](#resources)

## Installation

In your Astro project, run the following command to install the Sanity integration:

```bash
npx astro add @sanity/astro @astrojs/react
```

Note: `@astrojs/react` is only needed if you plan to embed a Sanity Studio in your project.

### Manual installation of dependencies

```bash
npm install @astrojs/react @sanity/astro @types/react-dom @types/react react-dom react
```

## Usage

### Setting up the Sanity client

Configure the integration in your `astro.config.mjs` file. The configuration options and methods are the same as for [@sanity/client](https://github.com/sanity-io/client#readme):

```typescript
import sanity from "@sanity/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: "<YOUR-PROJECT-ID>",
      dataset: "<YOUR-DATASET-NAME>",
      // Set useCdn to false if you're building statically.
      useCdn: false,
    }),
  ],
});
```

This enables the use of `useSanityClient()` in your template files. For example:

```mdx
---
// /blog/index.astro
import { useSanityClient } from "@sanity/astro";

const client = useSanityClient();
const posts = await client.fetch(`*[_type == "post" && defined(slug)] | order(publishedAt desc)`);
---

<h1>Blog</h1>
<ul>
  {posts.map((post) => (
    <li>
      <a href={"/posts/" + post.slug.current} class="post-link">
        {post.title}
      </a>
    </li>
  ))}
</ul>
```

[Check out this guide][guide] for a more elaborate introduction to how to integrate content from Sanity into Astro.

### Embedding Sanity Studio on a route

Sanity Studio is a customizable content workspace where you can edit your content. It‘s a Single Page Application that you can keep in its own repository, together with your Astro project as a monorepo, or embedded in your website.

To initialize a Studio in a dedicated folder, you can run `npm create sanity@latest` and follow the instructions.

This integration lets you embed a Sanity Studio on a route in your Astro project. To enable it:

1. Create a new file in your project root called `sanity.config.ts` (or `.js`)
2. Add the following code, and add your `projectId` and `dataset` to it:

```typescript
// sanity.config.ts
import { defineConfig } from "sanity";
import { deskTool } from "sanity/desk";

export default defineConfig({
  name: "project-name",
  title: "Project Name",
  projectId: "<YOUR-PROJECT-ID>",
  dataset: "<YOUR-DATASET-NAME>",
  plugins: [deskTool()],
  schema: {
    types: [
      /* your content types here*/
    ],
  },
});
```

You can use this configuration file to install plugins, add a schema with document types, add customizations etc. Note that the Studio will be using Astro‘s development server which is built on top of [Vite][vite].

1. Add the following to your `astro.config.mjs`:
   - `output: 'hybrid'`: Required since the Studio is a client-side application.
   - `studioBasePath: '/admin'`: The route/path for where you want to access your studio
   - Import the [React integration for Astro][astro-react], and add it to the `integrations` array.

```javascript
// astro.config.mjs
import sanityIntegration from "@sanity/astro";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  output: "hybrid",
  integrations: [
    sanityIntegration({
      projectId: "3do82whm",
      dataset: "next",
      // Set useCdn to false if you're building statically.
      useCdn: false,
      // Access the Studio on your.url/admin
      studioBasePath: "/admin",
    }),
    react(),
  ],
});
```

2. Since you have set `output: 'hybrid'` (or `server`), you have to add a deployment adapter to your Astro config as well. [Astro offers a range of adapters][adapter] depending on where you want to host your website.

3. You have to [enable CORS origins for authenticated requests][cors] for the domains you're running your website project on. The Studio should automatically detect and let you add this when you access the Studio on a new URL. Typically you need to add your local development server URL and your production URL to the CORS origin settings. It's important that you only enable CORS for authenticated requests on domains that _you_ control.

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
[adapter]: https://docs.astro.build/en/guides/server-side-rendering/#converting-a-static-site-to-hybrid-rendering
[portabletext]: https://portabletext.org
[image-document]: https://www.sanity.io/docs/image-metadata
[astro-sanity-picture]: https://github.com/otterdev-io/astro-sanity-picture
[groq-intro]: https://egghead.io/courses/introduction-to-groq-query-language-6e9c6fc0
[sanity-client]: https://www.sanity.io/docs/js-client
[image-urls]: https://www.sanity.io/docs/image-urls
