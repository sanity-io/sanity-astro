/**
 * Reference solution: create a new Astro site connected to Sanity.
 *
 * Demonstrates:
 * - Adding the @sanity/astro integration to astro.config.mjs
 * - Type declarations for the sanity:client virtual module
 * - Fetching content with the pre-configured client in page frontmatter
 *
 * Note: .astro file contents are shown in comments since this is a .ts file.
 */

// === Part 1: Astro configuration (astro.config.mjs) ===

import sanity from '@sanity/astro'
import {defineConfig} from 'astro/config'

export default defineConfig({
  integrations: [
    sanity({
      projectId: 'xxxxxxxx',
      dataset: 'production',
      apiVersion: '2026-03-01',
      // Static build: fetch fresh content at build time instead of the CDN.
      useCdn: false,
    }),
  ],
})

// === Part 2: Type declarations (src/env.d.ts) ===
//
// /// <reference types="astro/client" />
// /// <reference types="@sanity/astro/module" />

// === Part 3: Homepage (src/pages/index.astro) ===
//
// ---
// import {sanityClient} from 'sanity:client'
//
// const posts = await sanityClient.fetch(
//   `*[_type == "post" && defined(slug)] | order(publishedAt desc){
//     _id,
//     title,
//     slug,
//     publishedAt
//   }`,
// )
// ---
//
// <html lang="en">
//   <body>
//     <h1>Blog</h1>
//     <ul>
//       {posts.map((post) => (
//         <li>
//           <a href={`/posts/${post.slug.current}`}>{post.title}</a>
//         </li>
//       ))}
//     </ul>
//   </body>
// </html>
