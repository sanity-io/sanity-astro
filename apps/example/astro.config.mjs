import sanity from "@sanity/astro";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: "3do82whm",
      dataset: "next",
      // If you are doing static builds you may want opt out of the CDN
      useCdn: false,
      studioBasePath: "/admin",
    }),
    react(),
  ],
  vite: {
    ssr: {
      // See: https://github.com/withastro/astro/issues/9192#issuecomment-1834192321
      external: ["prismjs"],
    },
  },
});
