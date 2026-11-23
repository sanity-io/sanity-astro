import blockContent from './objects/blockContent.tsx'
import author from './objects/author.ts'
import seo from './objects/seo.ts'
import post from './documents/post.ts'

// Export an array of all the schema types.  This is used in the Sanity Studio configuration. https://www.sanity.io/docs/schema-types

export const schemaTypes = [post, author, blockContent, seo]
