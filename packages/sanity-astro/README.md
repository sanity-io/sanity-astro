# @sanity/astro

The Official Sanity integration for [Astro][astro]

- [Installation](#installation)
  - [Manual installation of dependencies](#manual-installation-of-dependencies)
- [Usage](#usage)
  - [Setting up the Sanity client](#setting-up-the-sanity-client)
  - [Embedding Sanity Studio on a route](#embedding-sanity-studio-on-a-route)
- [Portable Text](#portable-text)
- [Presenting images](#presenting-images)
  - [Resources](#resources)

## Installation

In your Astro project, run the following command to install the Sanity Astro integration:

```bash
npx astro add @sanity/astro @astrojs/react
```

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
      projectId: "3do82whm",
      dataset: "next",
      useCdn: true,
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

Check out [this guide][guide] for a more elaborate introduction to how to integrate content from Sanity into Astro.

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
    types: [],
  },
});
```

You can use this configuration file to install plugins, add a schema with document types, add customizations etc.

3. Add the following to your `astro.config.mjs`:
   - `output: 'hybrid'`: Required since the Studio is a client-side application
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
      useCdn: true,
      // Access the Studio on your.url/admin
      studioBasePath: "/admin",
    }),
    react(),
  ],
});
```

Remember that you have to [enable CORS origins for authenticated requests][cors] for the domains you're running your website project on. The Studio should automatically detect and let you add this when you access it on a new URL.

## Portable Text

We recommend using [astro-portabletext][astro-portabletext] to render your PortableText fields in Astro. See an example of this in [apps/example/src/components/PortableText.astro](../../apps/example/src/components/PortableText.astro), including using custom components to render custom blocks and annotations.

## Presenting images

We recommend using [@sanity/image-url](https://www.sanity.io/docs/image-url) to help you generate URLs for presenting Sanity images in your Astro app. See an example of this in [apps/example/src/components/SanityImage.astro](https://github.com/sanity-io/sanity-astro/blob/main/apps/example/src/components/SanityImage.astro)

### Resources

- [Official Astro + Sanity guide][guide]
- [Sanity documentation][docs]
- [Portable Text integration for Astro][astro-portabletext]

[astro]: https://astro.build
[astro-react]: https://docs.astro.build/en/guides/integrations-guide/react/
[guide]: https://www.sanity.io/guides/sanity-astro-blog
[docs]: https://www.sanity.io/docs
[astro-portabletext]: https://github.com/theisel/astro-portabletext
[cors]: https://www.sanity.io/docs/cors
