declare module 'sanity:client' {
  export const sanityClient: import('@sanity/client').SanityClient
}

declare module 'sanity:studio' {
  export const config: import('sanity').Config
}

declare module 'sanity:visual-editing' {
  export const sanityVisualEditing: {
    previewMode: false | {enable: string; disable: string; cookie: string}
    previewModeId?: string
    token?: string
  }
}

declare module '*.astro' {
  const component: unknown
  export default component
}
