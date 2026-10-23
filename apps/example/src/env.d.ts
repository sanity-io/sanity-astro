/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

interface ImportMetaEnv {
  readonly PUBLIC_SANITY_VISUAL_EDITING_ENABLED: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
