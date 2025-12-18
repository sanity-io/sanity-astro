declare module 'sanity:client' {
  export const sanityClient: import('@sanity/client').SanityClient
}

declare module 'sanity:studio' {
  export const studioConfig: import('sanity').Config
}

declare module 'sanity:draft-mode' {
  export const sanityDraftMode: {
    enable(cookies: import('astro').Cookies): void
    disable(cookies: import('astro').Cookies): void
    isEnabled(cookies: import('astro').Cookies): boolean
  }
}
