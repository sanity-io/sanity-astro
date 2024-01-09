// exporting this on its own seems the only way to provide it with a package
// it's critical to match it by providing a sani.d.ts file at the top of your
// app src folder, with the following one line (begins with the triple-/)
//
//       /// <reference types="@sanity/astro/module" />

declare module "sanity:client" {
  export const sanityClient: import("@sanity/client").SanityClient;
}

declare module "sanity:studio" {
  export const studioConfig: import("sanity").Config;
}
