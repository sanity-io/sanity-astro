import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {defineDocuments, defineLocations, presentationTool} from 'sanity/presentation'
import {sanityClient} from 'sanity:client'
import {schemaTypes} from './schemaTypes'

const {projectId, dataset} = sanityClient.config()
if (!projectId || !dataset) {
  throw new Error('Missing projectId or dataset')
}
console.log('projectId', projectId)
// *todo* take this from the sanity:client if possible
const previewUrl = import.meta.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:4324'

export default defineConfig(
  {
    name: 'admin',
    title: 'Sanity-Astro Upgrade',
    basePath: '/admin',
    projectId,
    dataset,
    plugins: [
      structureTool(),
      visionTool(),
      presentationTool({
        previewUrl,
        resolve: {
          // Maps a URL in the preview to the corresponding Sanity document,
          // so opening /post/my-slug in Presentation opens that post in the sidebar.
          mainDocuments: defineDocuments([
            {
              route: '/posts/:slug',
              filter: ({params}) => `_type == "post" && slug.current == "${params.slug}"`,
            },
          ]),
          // Maps a post document to its preview URL,
          // so editors can jump straight to the preview from any post in the Studio.
          locations: {
            post: defineLocations({
              select: {title: 'title', slug: 'slug.current'},
              resolve: (doc) => ({
                locations: doc?.slug
                  ? [{title: doc?.title || 'Untitled', href: `/posts/${doc.slug}`}]
                  : [],
              }),
            }),
          },
        },
      }),
    ],
    schema: {
      types: schemaTypes,
    },
  }
)
