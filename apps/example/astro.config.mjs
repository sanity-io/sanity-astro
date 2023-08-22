import sanityIntegration from "@sanity/astro";
import { defineConfig } from "astro/config";
import react from '@astrojs/react';


// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  integrations: [
    sanityIntegration({
      projectId: "3do82whm",
      dataset: "next",
      // If you are doing static builds you may want opt out of the CDN
      useCdn: true,
      studioBasePath: "/admin",
    }),
    react()
  ],
});
