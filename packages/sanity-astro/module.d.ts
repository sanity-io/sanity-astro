declare module 'sanity:client' {
  export const sanityClient: import('@sanity/client').SanityClient
}

declare module 'sanity:studio' {
  export const config: import('sanity').Config
}

declare module '*.astro' {
  const component: unknown
  export default component
}
