/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

interface ImportMetaEnv {
  readonly SANITY_API_READ_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
