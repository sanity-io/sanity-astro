/// <reference types="astro/import-meta.d.ts" />

declare module "sanity:client" {
  const sanityClient: import("@sanity/client").SanityClient;
  export default sanityClient;
}

declare module "sanity:studio" {
  const studioConfig: import("sanity").Config;
  export default studioConfig;
}