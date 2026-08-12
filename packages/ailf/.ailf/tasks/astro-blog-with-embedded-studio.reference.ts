/**
 * Reference solution: Astro blog with an embedded Sanity Studio at /admin.
 *
 * Demonstrates:
 * - Embedding Sanity Studio with studioBasePath (requires @astrojs/react)
 * - A Studio configuration and post schema living alongside the Astro app
 * - Listing posts and rendering a single post by slug with getStaticPaths
 * - Rendering portable text with astro-portabletext and images with
 *   @sanity/image-url
 *
 * Note: .astro and Studio file contents are shown in comments since this
 * is a .ts file.
 */

// === Part 1: Astro configuration (astro.config.mjs) ===

import react from '@astrojs/react'
import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

export default defineConfig({
  integrations: [
    sanity({
      projectId: 'xxxxxxxx',
      dataset: 'production',
      apiVersion: '2026-03-01',
      useCdn: false,
      // Mounts Sanity Studio at /admin. Requires the react() integration.
      studioBasePath: '/admin',
    }),
    react(),
  ],
})

// === Part 2: Studio configuration (sanity.config.ts) ===
//
// import {defineConfig} from 'sanity'
// import {structureTool} from 'sanity/structure'
//
// import {post} from './src/schema/post'
//
// export default defineConfig({
//   name: 'blog',
//   title: 'Blog',
//   projectId: 'xxxxxxxx',
//   dataset: 'production',
//   plugins: [structureTool()],
//   schema: {
//     types: [post],
//   },
// })

// === Part 3: Post schema (src/schema/post.ts) ===
//
// import {defineField, defineType} from 'sanity'
//
// export const post = defineType({
//   name: 'post',
//   title: 'Post',
//   type: 'document',
//   fields: [
//     defineField({
//       name: 'title',
//       title: 'Title',
//       type: 'string',
//       validation: (rule) => rule.required(),
//     }),
//     defineField({
//       name: 'slug',
//       title: 'Slug',
//       type: 'slug',
//       options: {source: 'title'},
//       validation: (rule) => rule.required(),
//     }),
//     defineField({
//       name: 'publishedAt',
//       title: 'Published at',
//       type: 'datetime',
//     }),
//     defineField({
//       name: 'mainImage',
//       title: 'Main image',
//       type: 'image',
//       options: {hotspot: true},
//       fields: [
//         defineField({
//           name: 'alt',
//           title: 'Alternative text',
//           type: 'string',
//         }),
//       ],
//     }),
//     defineField({
//       name: 'body',
//       title: 'Body',
//       type: 'array',
//       of: [{type: 'block'}],
//     }),
//   ],
// })

// === Part 4: Image URL helper (src/lib/image.ts) ===
//
// import imageUrlBuilder from '@sanity/image-url'
// import type {SanityImageSource} from '@sanity/image-url/lib/types/types'
// import {sanityClient} from 'sanity:client'
//
// export function urlFor(source: SanityImageSource) {
//   return imageUrlBuilder(sanityClient).image(source)
// }

// === Part 5: Homepage (src/pages/index.astro) ===
//
// ---
// import {sanityClient} from 'sanity:client'
//
// const posts = await sanityClient.fetch(
//   `*[_type == "post" && defined(slug)] | order(publishedAt desc){
//     _id,
//     title,
//     publishedAt,
//     "slug": slug.current
//   }`,
// )
// ---
//
// <h1>Blog</h1>
// <ul>
//   {posts.map((post) => (
//     <li>
//       <a href={`/posts/${post.slug}`}>{post.title}</a>
//     </li>
//   ))}
// </ul>

// === Part 6: Post page (src/pages/posts/[slug].astro) ===
//
// ---
// import {PortableText} from 'astro-portabletext'
// import {sanityClient} from 'sanity:client'
// import {urlFor} from '../../lib/image'
//
// export async function getStaticPaths() {
//   const slugs = await sanityClient.fetch(
//     `*[_type == "post" && defined(slug)]{"slug": slug.current}`,
//   )
//   return slugs.map(({slug}) => ({params: {slug}}))
// }
//
// const {slug} = Astro.params
// const post = await sanityClient.fetch(
//   `*[_type == "post" && slug.current == $slug][0]{
//     title,
//     mainImage,
//     body
//   }`,
//   {slug},
// )
// ---
//
// <article>
//   <h1>{post.title}</h1>
//   {post.mainImage && (
//     <img
//       src={urlFor(post.mainImage).width(1200).url()}
//       alt={post.mainImage.alt ?? ''}
//     />
//   )}
//   <PortableText value={post.body} />
// </article>
