# @sanity/astro

Official Sanity Astro integration

## Installation

In your Astro project, run the following command to install the Sanity Astro integration:

```bash
npx astro add @sanity/astro
```

## Usage in Astro

Configure the integration in your `astro.config.mjs` file. The configuration options are the same as for @sanity/client.

```typescript
import sanityIntegration from '@sanity/astro';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanityIntegration({
      projectId: '3do82whm',
      dataset: "next",
    })
  ]
});
```

## Usage in Astro Components

See apps/example for usage including how to render PortableText with custom blocks, and using Sanity's asset cdn to display images.
