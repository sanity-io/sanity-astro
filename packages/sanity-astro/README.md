# @sanity/astro

Official Sanity Astro integration

## Installation

In your Astro project, run the following command to install the Sanity Astro integration

```bash
npx astro add @sanity/astro
```

## Usage in Astro

Configure the integration in your `astro.config.mjs` file. The configuration options are the same as for @sanity/client.

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

## PortableText

We recommend using [astro-portabletext](https://github.com/theisel/astro-portabletext) to render your PortableText fields in Astro. See an example of this in apps/example/src/components/PortableText.astro, including using custom components to render custom blocks and annotations.

## Presenting images

We recommend using [@sanity/image-url](https://www.sanity.io/docs/image-url) to help you generate URLs for presenting Sanity images in your Astro app. See an example of this in apps/example/src/components/SanityImage.astro
